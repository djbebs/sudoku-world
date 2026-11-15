/**
 * P0.6.3 - Ycoor people animation using exactly the six user-supplied GLB files.
 * No invented streets or off-footpath walking. Outfit materials and hats
 * respond to season. Rigless arms/legs animated using named GLB nodes.
 */
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { originalGlbBuffers, CHARACTER_FILES, SOURCE } from './characters-assets.js';

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
function distinctCandidate(ring,blocked,previous,preferred=0){
 const xs=ring.map(p=>p.x),zs=ring.map(p=>p.z);
 const box={l:Math.max(-49,Math.min(...xs)),r:Math.min(49,Math.max(...xs)),
  t:Math.max(-49,Math.min(...zs)),b:Math.min(49,Math.max(...zs))};
 const candidates=[];
 for(let i=1;i<20;i++)for(let j=1;j<20;j++){
  const p={x:box.l+(box.r-box.l)*i/20,z:box.t+(box.b-box.t)*j/20};
  if(!inside(p,ring))continue;
  if(blocked.some(b=>distance(p,b)<(b.r||3)))continue;
  if(previous.some(b=>distance(p,b)<2.3))continue;
  if(Math.abs(p.x)>49||Math.abs(p.z)>49)continue;
  candidates.push(p);
 }
 return candidates.length?candidates[hash(preferred)%candidates.length]:null;
}
function getPolygon(features){
 const p=(features||[]).filter(f=>f.type==='playground'&&f.geometry==='polygon'&&f.polygon?.length>=4);
 const area=(ring)=>Math.abs(ring.reduce((s,v,i)=>{const q=ring[(i+1)%ring.length];return s+v.x*q.z-q.x*v.z},0))/2;
 return p.sort((a,b)=>area(b.polygon)-area(a.polygon))[0]?.polygon||null;
}
export function planPopulation({walkPaths=[],furnitureFeatures=[],photoDrawn=[]}={}){
 const people=[],polygon=getPolygon(furnitureFeatures),blocked=photoDrawn.map(a=>({
  x:a.center.x,z:a.center.z,
  r:a.key==='bench'?2.1:a.key==='complex'||a.key==='tube'?4.4:3.2
 }));
 const add=(kind,role,x,z,more={})=>{
  if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>49.5||Math.abs(z)>49.5)return;
  people.push({kind,role,x,z,id:people.length+1,...more});
 };
 // Walking is permitted ONLY on real OSM walkway geometry supplied in LV95-local.
 const valid=(walkPaths||[]).filter(w=>Array.isArray(w.points)&&w.points.length>=2&&w.length>=5)
  .filter(w=>w.points.every(p=>Number.isFinite(p.x+p.z)&&Math.abs(p.x)<50&&Math.abs(p.z)<50))
  .slice(0,2);
 valid.forEach((way,i)=>{
  const p=way.points[0];add('adulte','walk',p.x,p.z,{route:way.points,pathSource:way.id,speed:i?0.85:1.05});
 });
 // For the five verified-by-photo illustrative structures, the positions below
 // are local offsets FROM THE ALREADY DISPLAYED, indicative model centers.
 const keys={};for(const p of photoDrawn)keys[p.key]=p;
 const k=(name,dx,dz,platform,role)=>{
  const p=keys[name];if(!p)return;
  const scale=p.scale||1;
  const x=p.center.x+dx*scale,z=p.center.z+dz*scale;
  if(polygon&&!inside({x,z},polygon))return;
  add('enfant',role,x,z,{modelKey:name,offsetY:platform*scale,
   modelSource:'photo',phase:hash(name.length+people.length)%11});
 };
 k('complex',-1.55,-.10,2.04,'play-platform');
 k('small',-.1,-.24,1.43,'play-platform');
 k('ropes',-.9,-.98,.73,'climb-ropes');
 // Alternative: waiting child at top of tubular slide, not inside the tube.
 if(!people.some(a=>a.modelKey==='complex'))k('tube',-1.25,-.25,2.10,'play-platform');
 const occupied=people.map(a=>({x:a.x,z:a.z}));
 if(polygon){
  // One adult supervising, looking toward children.
  for(let i=0;i<2;i++){
   const point=distinctCandidate(polygon,blocked,occupied,i+12);
   if(point){add('adulte',i===0?'supervise':'chat',point.x,point.z);occupied.push(point)}
  }
  // One or two children playing on ground, without crossing artificial structures.
  for(let i=0;i<2;i++){
   const point=distinctCandidate(polygon,blocked,occupied,i+29);
   if(point){add('enfant',i===0?'skip':'wave',point.x,point.z);occupied.push(point)}
  }
  // Optional real modeled bench yields a grounded seated adult.
  if(keys.bench){
   const b=keys.bench,scale=b.scale||1;
   const p={x:b.center.x,z:b.center.z};
   if(inside(p,polygon)){
    // Do not exceed 4 adults in pilot.
    if(people.filter(a=>a.kind==='adulte').length<4)
      add('adulte','sit',p.x,p.z,{modelKey:'bench',offsetY:.62*scale+.25});
   }
  }
 }
 return {people,source:'OSM walkways + photo-model indicative anchors',hasPolygon:!!polygon,
  routes:valid.length,adults:people.filter(p=>p.kind==='adulte').length,
  children:people.filter(p=>p.kind==='enfant').length};
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
 const group=new T.Group();group.name='Personnages 3D GLB fournis - animation illustrative';group.visible=enabled;
 const actors=[];
 for(const spec of planned.people){
  const {root,style}=createBody(lib,spec.kind,season,spec.id);
  const anchor=new T.Group();anchor.name=spec.kind+' '+spec.role;
  anchor.position.set(spec.x,height(spec.x,spec.z)+.25+(spec.offsetY||0),spec.z);
  anchor.rotation.y=spec.kind==='adulte'?.9:-.5;
  const size=spec.kind==='enfant'?.98:1;
  root.scale.setScalar(size*(.94+(hash(spec.id+103)%13)/100));
  anchor.add(root);group.add(anchor);
  const parts={leftArm:root.getObjectByName('Bras_G'),rightArm:root.getObjectByName('Bras_D'),
   leftLeg:root.getObjectByName('Jambe_G'),rightLeg:root.getObjectByName('Jambe_D'),
   head:root.getObjectByName('Tete')};
  const meta={title:(spec.kind==='enfant'?'Enfant':'Adulte')+' · '+spec.role,
   desc:'Modèle 3D fourni par l’utilisateur : '+style.file+
    '. Tenue '+style.season+' ('+style.sleeves+'), couleurs variées. '+
    (spec.role==='walk'?'Déplacement animé sur chemin OSM '+spec.pathSource:
      'Comportement illustratif; position indicative dans ou autour de l’aire de jeux.'),
   source:'people',asset:style.file};
  root.traverse(obj=>{if(obj.isMesh)obj.userData={...meta}});
  actors.push({spec,root,anchor,parts,phase:hash(spec.id)%600/100,elapsed:0});
 }
 function update(dt){
  const t=Math.max(0,Math.min(.08,dt));
  for(const a of actors){
   a.elapsed+=t;
   const v=a.elapsed,phase=v*3+a.phase,{spec,anchor,parts}=a;
   const base=height(spec.x,spec.z)+.25+(spec.offsetY||0);
   anchor.position.set(spec.x,base,spec.z);
   let swing=.07*Math.sin(phase),bob=.012*Math.sin(phase);
   if(spec.role==='walk'&&spec.route){
    const path=spec.route,segmentLengths=[];let total=0;
    for(let i=1;i<path.length;i++){const d=distance(path[i],path[i-1]);segmentLengths.push(d);total+=d}
    const distanceAlong=total>0?(spec.speed||.9)*v%Math.max(.01,2*total):0;
    let remaining=distanceAlong>total?2*total-distanceAlong:distanceAlong;
    let reverse=distanceAlong>total;
    let a0=path[0],b0=path[Math.min(1,path.length-1)];
    for(let i=1;i<path.length;i++){
     if(remaining<=segmentLengths[i-1]||i===path.length-1){a0=path[i-1];b0=path[i];break}
     remaining-=segmentLengths[i-1];
    }
    const segLength=Math.max(.001,distance(a0,b0)),f=remaining/segLength;
    const x=a0.x+(b0.x-a0.x)*f,z=a0.z+(b0.z-a0.z)*f;
    anchor.position.set(x,height(x,z)+.25+Math.abs(Math.sin(phase*2))*.035,z);
    anchor.rotation.y=Math.atan2(reverse?-(b0.x-a0.x):b0.x-a0.x,reverse?-(b0.z-a0.z):b0.z-a0.z);
    swing=.48*Math.sin(phase*2);bob=.04*Math.abs(Math.sin(phase*2));
   }else if(spec.role==='climb-ropes'){
    anchor.position.y=base+.16*Math.sin(v*2);
    swing=.45*Math.sin(phase);
   }else if(spec.role==='skip'){
    anchor.position.y=base+.13*Math.abs(Math.sin(phase*1.65));
    swing=.35*Math.sin(phase);
   }else if(spec.role==='sit'){
    swing=.025;bob=0;
   }else if(spec.role==='wave'){
    swing=.26*Math.sin(phase);
    anchor.rotation.y=.6+.20*Math.sin(v);
   }else if(spec.role==='chat'||spec.role==='supervise'){
    anchor.rotation.y=.6+.15*Math.sin(v*.6+a.phase);
    swing=.14*Math.sin(phase);
   }
   if(spec.role!=='walk'&&spec.role!=='climb-ropes'&&spec.role!=='skip')anchor.position.y=base+bob;
   if(parts.leftArm)parts.leftArm.rotation.x=spec.role==='sit'?.12:swing;
   if(parts.rightArm)parts.rightArm.rotation.x=spec.role==='wave'?-.9+.22*Math.sin(phase):(-swing*.88);
   if(parts.leftLeg)parts.leftLeg.rotation.x=spec.role==='sit'?1.14:swing*.75;
   if(parts.rightLeg)parts.rightLeg.rotation.x=spec.role==='sit'?1.14:-swing*.75;
   if(parts.head)parts.head.rotation.y=.11*Math.sin(v*.8+a.phase);
  }
 }
 function dispose(){
  group.traverse(o=>{
   if(!o.isMesh)return;
   const m=Array.isArray(o.material)?o.material:[o.material];
   for(const material of m)material?.dispose?.();
  });
  group.removeFromParent();
 }
 function setPhotoVisible(show){
  for(const a of actors){
   if(a.spec.modelKey&&a.spec.modelKey!=='bench')a.anchor.visible=show;
   if(a.spec.modelKey==='bench')a.anchor.visible=show;
  }
 }
 return {group,actors,update,dispose,setPhotoVisible,adults:planned.adults,children:planned.children,plan:planned};
}
export async function createPopulation({THREE,season='summer',height,furnitureData,photoDrawn=[],visible=true}){
 const plan=planPopulation({walkPaths:furnitureData?.walkPaths||[],
  furnitureFeatures:furnitureData?.features||[],photoDrawn});
 if(!plan.people.length){
  const group=new THREE.Group();group.visible=visible;
  return {group,actors:[],adults:0,children:0,plan,update(){},setPhotoVisible(){},dispose(){group.removeFromParent()}};
 }
 const library=await loadTemplates();
 return buildActors(THREE,library,plan,season,height,visible);
}
