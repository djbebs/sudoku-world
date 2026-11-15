/**
 * P0.6.3 - Ycoor people animation using exactly the six user-supplied GLB files.
 * No invented streets or off-footpath walking. Outfit materials and hats
 * respond to season. Rigless arms/legs animated using named GLB nodes.
 */
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { originalGlbBuffers, CHARACTER_FILES, SOURCE } from './characters-assets.js';
import { compileWalkPath, motionAt } from './people-motion.js?v=2';

const COLORS={
 spring:{tops:['#61b78e','#e1aa61','#7298cf','#e18b9f','#bdac5f'],bottoms:['#374c59','#5c6c76','#6f5945','#667346']},
 summer:{tops:['#ed6867','#f4c550','#5eb7e4','#67c58e','#ee9064','#b38cdb'],bottoms:['#536a8a','#536b58','#a68a5e','#4c485d']},
 autumn:{tops:['#b8744c','#9c8550','#768a66','#846c8e','#4d7595'],bottoms:['#4d5667','#595348','#55604e','#474b55']},
 winter:{tops:['#447c9f','#b65755','#6865a6','#7c8655','#c78a48'],bottoms:['#2f3b55','#4b4e51','#47433e','#384a3d']}
};
export const SOURCE_FILES=CHARACTER_FILES.slice();
let templates=null;
function pick(arr,seed){return arr[Math.abs(seed>>>0)%arr.length]}
function hash(n){let x=(n+0x9e3779b9)|0;x=Math.imul(x^(x>>>16),0x21f0aaad);x=Math.imul(x^(x>>>15),0x735a2d97);return (x^(x>>>15))>>>0}
export function outfitFor(kind,season,index){
 const mode=['spring','summer','autumn','winter'].includes(season)?season:'summer';
 const hat=mode==='winter'||mode==='autumn'?'bonnet':
  hash(index+77)%2?'casquette':'chapeau';
 const palette=COLORS[mode],seed=hash(index+300);
 return {file:kind+'_'+hat+'.glb',top:pick(palette.tops,seed),
  bottom:pick(palette.bottoms,hash(seed+53)),hatColor:pick(palette.tops,hash(seed+71)),
  sleeves:hat==='bonnet'?'longues':'courtes ou légères',season:mode};
}
async function loadTemplates(){
 if(templates)return templates;
 templates=(async()=>{
  const originals=await originalGlbBuffers();
  const loader=new GLTFLoader(),out={};
  await Promise.all(CHARACTER_FILES.map(name=>new Promise((resolve,reject)=>{
   loader.parse(originals[name],'',g=>{
    out[name]=g.scene;resolve();
   },reject);
  })));
  return out;
 })().catch(e=>{templates=null;throw e});
 return templates;
}
export function inside(p,ring){
 if(!ring||ring.length<3)return false;
 let hit=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)hit=!hit;
 }
 return hit;
}
function segmentInside(a,b,ring){
 for(let i=0;i<=10;i++){
  const t=i/10;
  if(!inside({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t},ring))return false;
 }
 return true;
}
function distance(p,q){return Math.hypot(p.x-q.x,p.z-q.z)}
function distinctCandidate(ring,blocked,previous,preferred=0,halfExtent=49){
 const xs=ring.map(p=>p.x),zs=ring.map(p=>p.z);
 const box={l:Math.max(-halfExtent,Math.min(...xs)),r:Math.min(halfExtent,Math.max(...xs)),
  t:Math.max(-halfExtent,Math.min(...zs)),b:Math.min(halfExtent,Math.max(...zs))};
 const candidates=[];
 for(let i=1;i<20;i++)for(let j=1;j<20;j++){
  const p={x:box.l+(box.r-box.l)*i/20,z:box.t+(box.b-box.t)*j/20};
  if(!inside(p,ring))continue;
  if(blocked.some(b=>distance(p,b)<(b.r||3)))continue;
  if(previous.some(b=>distance(p,b)<2.3))continue;
  if(Math.abs(p.x)>halfExtent||Math.abs(p.z)>halfExtent)continue;
  candidates.push(p);
 }
 return candidates.length?candidates[hash(preferred)%candidates.length]:null;
}
function getPolygon(features){
 const p=(features||[]).filter(f=>f.type==='playground'&&f.geometry==='polygon'&&f.polygon?.length>=4);
 const area=(ring)=>Math.abs(ring.reduce((s,v,i)=>{const q=ring[(i+1)%ring.length];return s+v.x*q.z-q.x*v.z},0))/2;
 return p.sort((a,b)=>area(b.polygon)-area(a.polygon))[0]?.polygon||null;
}
/**
 * Spatial input is tile-local and data-driven. Each zone supplies the polygon
 * and model interaction definitions; NO animation code references Ycoor names.
 *
 * Later, village tiles can independently instantiate this planner with their
 * own provider results; maxActors prevents unbounded density per loaded tile.
 */
export function planPopulationForZones({walkPaths=[],zones=[],maxActors=12,tileHalfSize=50}={}){
 const people=[];
 const quota=Math.max(0,Math.floor(maxActors));
 const extent=Math.max(3,tileHalfSize-.5);
 const add=(kind,role,x,z,more={})=>{
  if(people.length>=quota||!Number.isFinite(x)||!Number.isFinite(z))return false;
  // Pilot limit applies to the current tile; future regions use their own
  // tile-local 100m/other extent and can pass a different maxLocalExtent.
  if(Math.abs(x)>extent||Math.abs(z)>extent)return false;
  people.push({kind,role,x,z,id:people.length+1,...more});return true;
 };
 const validRoutes=(walkPaths||[]).filter(w=>Array.isArray(w.points)&&w.points.length>=2&&w.length>=5)
  .filter(w=>w.points.every(p=>Number.isFinite(p.x+p.z)&&Math.abs(p.x)<=tileHalfSize&&Math.abs(p.z)<=tileHalfSize))
  .slice(0,2);
 validRoutes.forEach((way,i)=>{
  const start=way.points[0];
  add('adulte','walk',start.x,start.z,{
   route:way.points,pathSource:way.id,speed:i?.86:1.05
  });
 });
 for(const zone of zones){
  if(people.length>=quota)break;
  const polygon=zone.polygon;
  if(!Array.isArray(polygon)||polygon.length<4)continue;
  const models=Array.isArray(zone.models)?zone.models:[];
  const blocked=models.map(m=>({
   x:m.center.x,z:m.center.z,
   r:m.key==='bench'?2.1:Math.max(2.6,3.6*(m.scale||1))
  }));
  // Every actual modeled play item provides its own interaction anchors.
  // A slide action can only happen if the entire return circuit stays
  // inside the mapped playground polygon.
  for(const model of models){
   if(people.length>=quota)break;
   for(const item of model.interactions||[]){
    if(people.length>=quota)break;
    if(item.role==='sit')continue; // reserved for adult below
    const scale=model.scale||1;
    const world=(p)=>({
     x:model.center.x+p.x*scale,z:model.center.z+p.z*scale,
     y:(p.y||0)*scale
    });
    let point=item.point?world(item.point):null;
    const track=Array.isArray(item.track)?item.track.map(world):null;
    if(track){
     if(track.some(p=>!inside(p,polygon)||Math.abs(p.x)>=extent||Math.abs(p.z)>=extent))continue;
     point=track[0];
    }
    if(!point||!inside(point,polygon))continue;
    add('enfant',item.role,point.x,point.z,{
     modelKey:model.key,zoneId:zone.id,modelSource:'photo',
     offsetY:point.y,facing:item.facing||0,
     track,minY:typeof item.minY==='number'?item.minY*scale:undefined,
     maxY:typeof item.maxY==='number'?item.maxY*scale:undefined
    });
   }
  }
  const occupied=people.map(p=>({x:p.x,z:p.z}));
  // Supervising parents are anchored in free parts of the playground.
  for(let i=0;i<2&&people.length<quota;i++){
   const p=distinctCandidate(polygon,blocked,occupied,i+12+hash(zone.id?.length||0),extent);
   if(!p)continue;
   if(add('adulte',i?'chat':'supervise',p.x,p.z,{zoneId:zone.id})){
    occupied.push(p);
   }
  }
  // A single ground-play child per zone, jumping occasionally, not jogging
  // in place. Additional children belong to actual prefabs.
  if(people.length<quota){
   const p=distinctCandidate(polygon,blocked,occupied,29+hash(zone.id?.length||0),extent);
   if(p)add('enfant','play-ground',p.x,p.z,{zoneId:zone.id});
  }
  for(const model of models){
   if(people.length>=quota)break;
   const seat=(model.interactions||[]).find(i=>i.role==='sit'&&i.point);
   if(!seat)continue;
   const scale=model.scale||1;
   const x=model.center.x+seat.point.x*scale,z=model.center.z+seat.point.z*scale;
   if(!inside({x,z},polygon))continue;
   if(people.filter(p=>p.kind==='adulte').length>=4)continue;
   add('adulte','sit',x,z,{zoneId:zone.id,modelKey:model.key,
    offsetY:seat.point.y*scale,facing:seat.facing||0});
  }
 }
 return {people,source:'OSM paths + per-prefab authored interaction anchors',
  zones:zones.length,routes:validRoutes.length,
  hasPolygon:zones.some(z=>Array.isArray(z.polygon)&&z.polygon.length>=4),
  adults:people.filter(p=>p.kind==='adulte').length,
  children:people.filter(p=>p.kind==='enfant').length};
}
export function planPopulation({walkPaths=[],furnitureFeatures=[],photoDrawn=[],
 zones=null,maxActors=12,tileHalfSize=50}={}){
 let resolvedZones=zones;
 if(!resolvedZones){
  const playgrounds=(furnitureFeatures||[]).filter(f=>
   f.type==='playground'&&f.geometry==='polygon'&&Array.isArray(f.polygon)&&f.polygon.length>=4);
  resolvedZones=playgrounds.map(g=>({
   id:g.id,polygon:g.polygon,
   models:photoDrawn.filter(m=>m.polygonId===g.id)
  }));
 }
 return planPopulationForZones({walkPaths,zones:resolvedZones,maxActors,tileHalfSize});
}
function createBody(library,kind,season,index){
 const style=outfitFor(kind,season,index);
 const root=library[style.file].clone(true);
 root.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const update=material=>{
   const m=material.clone(),name=(m.name||'').toLowerCase();
   if(name==='haut')m.color.set(style.top);
   if(name==='bas')m.color.set(style.bottom);
   if(name==='coiffe'||name==='coiffe2')m.color.set(style.hatColor);
   m.flatShading=true;m.needsUpdate=true;return m;
  };
  mesh.material=Array.isArray(mesh.material)?mesh.material.map(update):update(mesh.material);
 });
 return {root,style};
}
function buildActors(T,lib,planned,season,height,enabled){
 const group=new T.Group();group.name='Animated GLB people (tile-local, reusable)';
 group.visible=enabled;
 const actors=[];
 let photoVisible=true;
 for(const spec of planned.people){
  const {root,style}=createBody(lib,spec.kind,season,spec.id);
  const anchor=new T.Group();anchor.name=spec.kind+' '+spec.role;
  anchor.position.set(spec.x,height(spec.x,spec.z)+.25+(spec.offsetY||0),spec.z);
  anchor.rotation.y=spec.facing??(spec.kind==='adulte'?.9:-.5);
  root.scale.setScalar((spec.kind==='enfant'?.98:1)*(.94+(hash(spec.id+103)%13)/100));
  anchor.add(root);group.add(anchor);
  const parts={leftArm:root.getObjectByName('Bras_G'),rightArm:root.getObjectByName('Bras_D'),
   leftLeg:root.getObjectByName('Jambe_G'),rightLeg:root.getObjectByName('Jambe_D'),
   head:root.getObjectByName('Tete')};
  const neutral={};
  for(const [name,obj] of Object.entries(parts))neutral[name]=obj?.rotation?.x||0;
  const meta={title:(spec.kind==='enfant'?'Enfant':'Adulte')+' · '+spec.role,
   desc:'Modèle fourni : '+style.file+'. Tenue '+style.season+
    ' ; animation comportementale. '+(spec.role==='walk'?
     'Déplacement sur voie OSM '+spec.pathSource:
     spec.modelKey?'Interaction au modèle de jeu '+spec.modelKey+
      ' ; géométrie de jeu photographiquement documentée, position indicative.':
      'Personnage illustratif dans la zone cartographiée.'),
   source:'people',asset:style.file};
  root.traverse(o=>{if(o.isMesh)o.userData={...meta}});
  actors.push({
   spec,root,anchor,parts,neutral,elapsed:0,
   cache:{path:spec.route?compileWalkPath(spec.route):null},
   lastPhase:'initial'
  });
 }
 function update(dt){
  const step=Math.max(0,Math.min(.06,Number(dt)||0));
  for(const actor of actors){
   actor.elapsed+=step;
   const pose=motionAt(actor.spec,actor.elapsed,height,actor.cache);
   const {anchor,parts,neutral,spec}=actor;
   anchor.position.set(pose.x,pose.y,pose.z);
   anchor.rotation.y=pose.heading;
   anchor.rotation.z=pose.bodyZ;
   // Important: playing child is hidden when its PHOTO illustration is hidden.
   // A tube slide also hides its rider while inside the opaque tube.
   anchor.visible=pose.visible&&(!spec.modelKey||photoVisible);
   if(parts.leftArm)parts.leftArm.rotation.x=neutral.leftArm+pose.armL;
   if(parts.rightArm)parts.rightArm.rotation.x=neutral.rightArm+pose.armR;
   if(parts.leftLeg)parts.leftLeg.rotation.x=neutral.leftLeg+pose.legL;
   if(parts.rightLeg)parts.rightLeg.rotation.x=neutral.rightLeg+pose.legR;
   if(parts.head)parts.head.rotation.y=pose.headY;
   actor.lastPhase=pose.phase;
  }
 }
 function dispose(){
  group.traverse(o=>{
   if(!o.isMesh)return;
   for(const material of Array.isArray(o.material)?o.material:[o.material]){
    material?.dispose?.();
   }
  });
  group.removeFromParent();
 }
 function setPhotoVisible(show){
  photoVisible=!!show;
  for(const a of actors){
   if(a.spec.modelKey)a.anchor.visible=photoVisible&&a.lastPhase!=='insideTube';
  }
 }
 // Populate actors once; subsequent frames are small O(visible actors).
 update(0);
 return {group,actors,update,dispose,setPhotoVisible,
  adults:planned.adults,children:planned.children,plan:planned};
}
export async function createPopulation({THREE,season='summer',height,furnitureData,photoDrawn=[],visible=true,tileHalfSize=50,maxActors=12}){
 const plan=planPopulation({walkPaths:furnitureData?.walkPaths||[],
  furnitureFeatures:furnitureData?.features||[],photoDrawn,tileHalfSize,maxActors});
 if(!plan.people.length){
  const group=new THREE.Group();group.visible=visible;
  return {group,actors:[],adults:0,children:0,plan,update(){},setPhotoVisible(){},dispose(){group.removeFromParent()}};
 }
 const library=await loadTemplates();
 return buildActors(THREE,library,plan,season,height,visible);
}
