/**
 * Playground pedestrian safety for approved illustrative prefabs.
 *
 * Volumes and tracks are prefab-local metres. All authored motion segments
 * are sampled continuously enough to detect tunnelling through an occupied
 * volume between keyframes. Fail closed: a motion variant that conflicts
 * with a forbidden solid is not assigned to a character.
 *
 * This validates COLLISION APPROXIMATIONS only, not a physics simulation.
 * Sliding on a ramp / climbing a net are authored contact interactions, not
 * forbidden crossings. Every new village prefab supplies its own obstacles.
 */
export const DEFAULT_RADIUS=0.24;
export const DEFAULT_BODY_HEIGHT=1.30;
const finite=v=>Number.isFinite(v);
export function insideBox(p,box,radius=DEFAULT_RADIUS,bodyHeight=DEFAULT_BODY_HEIGHT){
 if(!p||!finite(p.x)||!finite(p.z)||!finite(p.y))return true;
 const nearestX=Math.max(box.minX,Math.min(box.maxX,p.x));
 const nearestZ=Math.max(box.minZ,Math.min(box.maxZ,p.z));
 const horiz=(p.x-nearestX)**2+(p.z-nearestZ)**2<=radius*radius;
 const low=p.y+0.07,high=p.y+bodyHeight;
 const vert=low<box.maxY&&high>box.minY;
 return horiz&&vert;
}
export function collidesWithSolid(point,volumes=[],radius=DEFAULT_RADIUS,bodyHeight=DEFAULT_BODY_HEIGHT){
 return volumes.some(v=>insideBox(point,v,radius,bodyHeight));
}
export function sampleSweptSegment(a,b,callback,step=.055){
 if(!a||!b||![a.x,a.y,a.z,b.x,b.y,b.z].every(finite))return false;
 const length=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);
 const count=Math.max(1,Math.ceil(length/step));
 for(let i=0;i<=count;i++){
  const t=i/count;
  if(callback({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t},t)===false)return false;
 }
 return true;
}
function footprint(p,ring){
 if(!Array.isArray(ring)||ring.length<3)return false;
 let result=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)result=!result;
 }
 return result;
}
/**
 * Validates in local coordinates against solid volumes and in world XY
 * against the original OSM playground polygon. A variant cannot traverse
 * an obstacle even when the start/end points are outside.
 *
 * Tracks are feet/ground pivot points, not the model's visual bounding box.
 * The user can inspect/tune the volumes per 3D prefab.
 */
export function validatePrefabVariant({variant,model,polygon,extent=49.5,radius=DEFAULT_RADIUS,
 bodyHeight=DEFAULT_BODY_HEIGHT}){
 const {track,sequence}=variant||{};
 if(!Array.isArray(track)||track.length<2||!Array.isArray(sequence)||!sequence.length)
  return {ok:false,reason:'missing-track-or-sequence'};
 const scale=model?.scale||1,center=model?.center;
 if(!center||!finite(scale)||scale<=0)return {ok:false,reason:'bad-model-transform'};
 const bounds=model.solidVolumes||[];
 if(bounds.some(v=>![v.minX,v.maxX,v.minY,v.maxY,v.minZ,v.maxZ].every(finite)||
   v.minX>=v.maxX||v.minY>=v.maxY||v.minZ>=v.maxZ))
  return {ok:false,reason:'bad-solid-volume'};
 for(const item of sequence){
  if(!Array.isArray(item)||item.length!==4)return {ok:false,reason:'bad-phase'};
  const [phase,from,to,duration]=item;
  if(!finite(duration)||duration<=0||!Number.isInteger(from)||!Number.isInteger(to)||
    !track[from]||!track[to])return {ok:false,reason:'invalid-sequence-index'};
  const a=track[from],b=track[to];
  const valid=sampleSweptSegment(a,b,p=>{
   const pt={x:center.x+p.x*scale,z:center.z+p.z*scale};
   if(Math.abs(pt.x)>=extent||Math.abs(pt.z)>=extent||!footprint(pt,polygon))return false;
   // Inside an enclosed slide tube, the child is hidden and the actual
   // tube surface is intentionally not a forbidden occupied volume.
   return !collidesWithSolid(p,bounds,radius,bodyHeight);
  });
  if(!valid)return {ok:false,reason:'collision-or-outside-polygon',phase,from,to};
 }
 const first=track[sequence[0][1]],last=track[sequence.at(-1)[2]];
 if(Math.hypot(first.x-last.x,first.y-last.y,first.z-last.z)>.03)
  return {ok:false,reason:'non-looping-variant'};
 return {ok:true,reason:null};
}
export function chooseSafeVariants({model,interaction,polygon,extent}){
 const candidates=Array.isArray(interaction.variants)&&interaction.variants.length?
  interaction.variants:[interaction];
 const safe=[],rejected=[];
 for(const item of candidates){
  const result=validatePrefabVariant({variant:item,model,polygon,extent});
  (result.ok?safe:rejected).push(result.ok?item:{variant:item.name||'default',...result});
 }
 return {safe,rejected};
}
/**
 * Last line of defence if data changes during a frame. If a sampled pose
 * intersects a forbidden solid, restore the previous valid pose. No
 * interpolation is allowed to slip through between two frames.
 */
export function guardLivePose(pose,spec,cache,step=.07){
 const collider=spec?.solidVolumes;
 const center=spec?.modelCenter;
 if(!collider?.length||!center)return pose;
 const scale=spec.modelScale||1;
 const asLocal=p=>({
  x:(p.x-center.x)/scale,
  y:(p.y-(spec.modelGroundY||0)) /scale,
  z:(p.z-center.z)/scale
 });
 const p=asLocal(pose);
 const previous=cache?.lastSafePose||null;
 const previousLocal=previous?asLocal(previous):null;
 const pass=previousLocal?sampleSweptSegment(previousLocal,p,pt=>!collidesWithSolid(pt,collider),step):
  !collidesWithSolid(p,collider);
 if(pass){if(cache)cache.lastSafePose={...pose};return pose}
 if(previous){
  return {...previous,armL:0,armR:0,legL:0,legR:0,
    armLZ:0,armRZ:0,legLZ:0,legRZ:0,bodyX:0,bodyZ:0,
    phase:'collision-stop'};
 }
 return {...pose,visible:false,phase:'collision-stop'};
}
