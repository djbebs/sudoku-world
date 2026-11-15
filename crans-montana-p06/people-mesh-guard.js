/**
 * Full-body / rendered-mesh collision sentinel for the Pixel Atlas.
 *
 * Checks head, hair/headgear, torso, arms and legs against the actual world
 * triangles of rendered playground meshes, not merely the actor's anchor.
 *
 * Head, headgear and torso are always protected. Hands/feet may touch
 * authored support, slide and net surfaces; those contacts are not considered
 * penetration. Rigid barriers/blue panels/posts are protected for all parts.
 *
 * Fail closed: if no collision-free pose exists the actor must not render.
 * Pure THREE dependency injection; no region names, paths or tile size.
 */
const EXCLUDE_MATERIALS=new Set(['ground','terrain']);
const ANATOMY=[
 ['head','Tete'],['head','Cheveux'],['head','Bonnet'],
 ['head','Casquette'],['head','Chapeau'],
 ['torso','Torse'],
 ['arm','Bras_G'],['arm','Bras_D'],
 ['leg','Jambe_G'],['leg','Jambe_D']
];
function finite3(v){return Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z)}
function boxValid(b){return finite3(b.min)&&finite3(b.max)&&b.max.x>b.min.x&&b.max.y>b.min.y&&b.max.z>b.min.z}
export function buildSceneCollisionIndex(T,models=[]){
 const records=[],ignored=[];
 for(const item of models){
  const root=item.modelObject;
  if(!root?.traverse)continue;
  root.updateWorldMatrix?.(true,true);
  root.updateMatrixWorld?.(true);
  root.traverse(mesh=>{
   if(!mesh.isMesh||!mesh.geometry)return;
   const kind=mesh.userData?.atlasCollisionKind||'barrier';
   if(EXCLUDE_MATERIALS.has(kind))return;
   const geom=mesh.geometry,positions=geom.getAttribute?.('position')||geom.attributes?.position;
   if(!positions||positions.count<3)return;
   const idx=geom.getIndex?.()||geom.index||null;
   const n=idx?.count??positions.count,triangles=[];
   const world=mesh.matrixWorld;
   for(let i=0;i+2<n;i+=3){
    const a=idx?idx.getX(i):i,b=idx?idx.getX(i+1):i+1,c=idx?idx.getX(i+2):i+2;
    const va=new T.Vector3().fromBufferAttribute(positions,a).applyMatrix4(world);
    const vb=new T.Vector3().fromBufferAttribute(positions,b).applyMatrix4(world);
    const vc=new T.Vector3().fromBufferAttribute(positions,c).applyMatrix4(world);
    if(!finite3(va)||!finite3(vb)||!finite3(vc))continue;
    triangles.push(new T.Triangle(va,vb,vc));
   }
   if(!triangles.length)return;
   geom.computeBoundingBox?.();
   const bounds=new T.Box3().setFromObject(mesh,true);
   if(!boxValid(bounds))return;
   records.push({model:item.key,kind,name:mesh.name||kind,bounds,triangles,mesh});
  });
 }
 return {records,triangleCount:records.reduce((n,r)=>n+r.triangles.length,0),ignored};
}
function addBodySamples(T,part,category,actor,output){
 if(!part)return;
 const box=new T.Box3().setFromObject(part,true);
 if(!boxValid(box))return;
 const dims=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
 // Full vertical extent is covered by overlapping spheres. For the head,
 // include the diagonal radius so the skull and headgear cannot tunnel
 // through a thin rail even when its center is outside.
 const narrow=.5*Math.hypot(dims.x,dims.z);
 const radius=Math.max(.018,narrow);
 const n=category==='head'?Math.max(1,Math.ceil(dims.y/Math.max(radius,.08))):
   Math.max(2,Math.ceil(dims.y/Math.max(radius*.85,.10)));
 const actualRadius=category==='head'?Math.hypot(radius,dims.y/(2*n))+.015:radius+.012;
 const low=box.min.y,high=box.max.y;
 for(let i=0;i<n;i++){
  const point=new T.Vector3(center.x,low+(i+.5)/n*(high-low),center.z);
  output.push({category,part:part.name,point,radius:actualRadius,actor:actor.spec?.id});
 }
 // A few offset samples catch shoulder and protruding hat corners,
 // which one centered capsule would miss.
 if(category==='head'||category==='torso'){
  for(const dx of [-.30,.30])for(const dz of [-.30,.30]){
   output.push({category,part:part.name,
    point:new T.Vector3(center.x+dx*dims.x,center.y,center.z+dz*dims.z),
    radius:Math.max(.025,actualRadius*.63),actor:actor.spec?.id});
  }
 }
}
export function bodyProbes(T,actor){
 const parts=[];
 const seen=new Set();
 const root=actor.root;
 for(const [category,name] of ANATOMY){
  const p=root?.getObjectByName?.(name);
  if(!p||seen.has(p))continue;
  seen.add(p);addBodySamples(T,p,category,actor,parts);
 }
 if(!parts.some(p=>p.category==='head')){
  // Missing head geometry MUST NOT silently disable collision detection.
  const b=new T.Box3().setFromObject(root,true);
  if(boxValid(b)){
   const s=b.getSize(new T.Vector3()),c=b.getCenter(new T.Vector3());
   parts.push({category:'head',part:'fallback-top-of-model',
    point:new T.Vector3(c.x,b.max.y-s.y*.16,c.z),
    radius:Math.max(.09,Math.min(s.x,s.z)*.48),actor:actor.spec?.id});
  }
 }
 return parts;
}
export function allowTouch(category,kind,phase){
 if(kind==='support'||kind==='slide-surface'){
  return category==='leg'||category==='arm';
 }
 if(kind==='handrail')return category==='arm';
 if(kind==='net-contact')return category==='arm'||category==='leg';
 // Inside a tube the avatar is completely hidden until reaching the exit.
 if(kind==='tunnel'&&phase==='insideTube')return true;
 return false;
}
export function firstBodyMeshIntersection(T,actor,index,phase,opts={}){
 if(!actor.anchor?.visible||!actor.root?.visible)return null;
 actor.anchor.updateWorldMatrix?.(true,true);
 actor.anchor.updateMatrixWorld?.(true);
 const probes=bodyProbes(T,actor);
 const nearest=new T.Vector3();
 const extra=opts.clearance??.022;
 for(const probe of probes){
  for(const entry of index.records){
   if(allowTouch(probe.category,entry.kind,phase))continue;
   const limit=probe.radius+extra;
   if(entry.bounds.distanceToPoint(probe.point)>limit)continue;
   const sq=limit*limit;
   for(const triangle of entry.triangles){
    triangle.closestPointToPoint(probe.point,nearest);
    if(nearest.distanceToSquared(probe.point)<sq){
     return {part:probe.part,category:probe.category,object:entry.name,
      model:entry.model,kind:entry.kind,clearance:limit};
    }
   }
  }
 }
 return null;
}
/**
 * Candidate offsets are limited to a few centimetres and searched in a
 * stable order. Large corrections would detach the person from their game,
 * so we deliberately hide instead of pretending the resulting pose is valid.
 */
export function correctionCandidates(T,pose){
 const f={x:Math.sin(pose.heading||0),z:Math.cos(pose.heading||0)};
 const side={x:f.z,z:-f.x};
 const candidates=[{dx:0,dy:0,dz:0}];
 for(const y of [.06,.12,.20])candidates.push({dx:0,dy:y,dz:0});
 for(const shift of [.10,-.10,.20,-.20]){
  candidates.push({dx:side.x*shift,dy:.03,dz:side.z*shift});
  candidates.push({dx:f.x*shift,dy:.03,dz:f.z*shift});
 }
 return candidates.map(c=>({...pose,x:pose.x+c.dx,y:pose.y+c.dy,z:pose.z+c.dz}));
}
export function modelCollisionAudit(T,actor,index,pose,applyPose,opts={}){
 if(!pose.visible)return {pose,collision:null,hidden:false,corrected:false};
 let hit=null;
 const options=correctionCandidates(T,pose);
 for(let i=0;i<options.length;i++){
  const candidate=options[i];
  applyPose(candidate);
  hit=firstBodyMeshIntersection(T,actor,index,candidate.phase,opts);
  if(!hit)return {pose:candidate,collision:null,hidden:false,corrected:i>0};
 }
 // No safe pose in the permitted adjustment window. Unlike the prior
 // anchor-only check, this policy NEVER renders a known intersecting body.
 const hidden={...pose,visible:false,phase:'geometry-occluded'};
 applyPose(hidden);
 return {pose:hidden,collision:hit,hidden:true,corrected:false};
}
