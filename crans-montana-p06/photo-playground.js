/**
 * P0.6.2 Ycoor: photo-REFERENCED / user-APPROVED illustrative playground.
 *
 * Five models are reconstructed from the approved pixel-art reference.
 * Their existence/appearance is supported to differing extents by a tourism
 * gallery, BUT THEIR INDIVIDUAL COORDINATES ARE NOT SURVEYED.
 *
 * IMPORTANT: Only activate if a georeferenced OSM leisure=playground polygon
 * is available. Every indicative placement MUST be fully inside this polygon.
 * The output is a separate visible/hidden group with explicit provenance.
 *
 * No photo is loaded into Three.js. No OSM/cadastral geometry is modified.
 */
export const PHOTO_SOURCE='https://www.crans-montana.ch/fr/?idcmt=Partenaire_Activite_4ff811345b2094222f969b680bb9ac78';
export const APPROVED=[
 {key:'complex',name:'Grande structure + tunnel',w:6.7,d:5.1,preferred:[.26,.32],match:['structure'],evidence:'Équipement de type structure et tunnel illustré dans la galerie touristique'},
 {key:'tube',name:'Grand toboggan tubulaire courbe',w:6.3,d:5.6,preferred:[.77,.30],match:['slide'],evidence:'Type de toboggan visible dans la galerie touristique'},
 {key:'small',name:'Petite structure bleue + toboggan rouge',w:4.1,d:5.4,preferred:[.24,.76],match:['structure','slide'],evidence:'Forme approuvée comme modèle illustratif, détails à vérifier sur place'},
 {key:'ropes',name:'Cordes et boules d’escalade',w:4.7,d:3.8,preferred:[.69,.72],match:['climbing'],evidence:'Catégorie d’équipement ludique à confirmer équipement par équipement'},
 {key:'bench',name:'Banc en bois',w:2.7,d:1.6,preferred:[.88,.83],match:['bench'],evidence:'Modèle approuvé par l’utilisateur ; présence sur ce polygone non vérifiée'}
];
/**
 * Animation anchors are written in LOCAL COORDINATES of the approved 3D model,
 * not geographic guesses. Every future playground prefab can define its own
 * interactions with this same schema, independent of the district or village.
 *
 * point/track units: model units, relative to model origin; y above model base.
 * Track positions are the visible geometry of the *specific* rendered slide.
 */
/**
 * Authoritative positions are for the RENDERED illustrative model only.
 * A child's foot is anchored to each modeled step, never to a made-up
 * geographic stair. Every game may provide track + sequence without changing
 * the reusable motion engine.
 */
export const MODEL_INTERACTIONS={
 complex:[{
  role:'play-stairs',facing:0,
  track:[
   {x:-3.05,z:-1.70,y:.12},  // bottom approach
   {x:-3.05,z:-1.40,y:.34}, // stair 1
   {x:-3.05,z:-.90,y:.71},  // stair 2
   {x:-3.05,z:-.40,y:1.08},// stair 3
   {x:-3.05,z:.10,y:1.45}, // stair 4
   {x:-3.05,z:.60,y:1.82}, // stair 5
   {x:-1.90,z:.40,y:2.06}  // top wooden deck
  ],
  sequence:[
   ['waitBottom',0,0,1.5],
   ['stairs',0,1,.62],['stairs',1,2,.66],
   ['stairs',2,3,.66],['stairs',3,4,.66],['stairs',4,5,.66],
   ['stairs',5,6,.90],
   ['waitTop',6,6,2.3],
   ['stairs-down',6,5,.82],
   ['stairs-down',5,4,.66],['stairs-down',4,3,.66],
   ['stairs-down',3,2,.66],['stairs-down',2,1,.66],
   ['stairs-down',1,0,.62]
  ]
 }],
 tube:[{
  role:'play-tube',facing:0.8,
  track:[
   {x:-.45,z:0,y:2.45},       // entrance platform
   {x:1.10,z:.35,y:2.20},    // inside silver tube
   {x:2.38,z:2.13,y:.82},    // tube exit
   {x:2.70,z:2.56,y:.12},    // ground
   {x:-2.50,z:1.70,y:.12},   // return around structure
   {x:-2.55,z:-1.55,y:.12},  // bottom of real modeled staircase
   {x:-2.55,z:-1.20,y:.42},  // 1
   {x:-2.55,z:-.80,y:.79},   // 2
   {x:-2.55,z:-.40,y:1.16}, // 3
   {x:-2.55,z:0,y:1.53},    // 4
   {x:-2.55,z:.40,y:1.90},  // 5
   {x:-1.40,z:-.20,y:2.15}, // upper wooden deck
   {x:-.45,z:0,y:2.45}      // tube entry
  ],
  sequence:[
   ['waitTop',0,0,2.3],
   ['insideTube',0,1,1.05],['insideTube',1,2,1.15],
   ['land',2,3,.72],['rest',3,3,1.05],
   ['return',3,4,3.7],['return',4,5,2.4],
   ['stairs',5,6,.65],['stairs',6,7,.68],
   ['stairs',7,8,.68],['stairs',8,9,.68],
   ['stairs',9,10,.68],['stairs',10,11,.95],
   ['platformWalk',11,12,1.2]
  ]
 }],
 small:[{
  role:'play-slide',facing:0,
  track:[
   {x:.13,z:.72,y:1.48},     // top of red slide
   {x:.13,z:2.15,y:.37},    // red slide landing
   {x:.15,z:2.50,y:.12},    // ground
   {x:-1.50,z:2.48,y:.12},  // safe route to side
   {x:-1.50,z:-2.53,y:.12}, // approach rear stairs
   {x:-1.35,z:-2.30,y:.31}, // stair 1
   {x:-1.27,z:-2.05,y:.56}, // stair 2
   {x:-1.17,z:-1.80,y:.81}, // stair 3
   {x:-1.10,z:-1.55,y:1.06}, // stair 4
   {x:-1.02,z:-1.30,y:1.31}, // stair 5
   {x:-.90,z:-.95,y:1.43}, // deck
   {x:-.10,z:-.24,y:1.43},// walk to slide
   {x:.13,z:.72,y:1.48}   // slide entrance
  ],
  sequence:[
   ['waitTop',0,0,2.3],['slide',0,1,1.15],
   ['land',1,2,.7],['rest',2,2,1.2],
   ['return',2,3,1.5],['return',3,4,3.9],
   ['stairs',4,5,.60],['stairs',5,6,.63],
   ['stairs',6,7,.63],['stairs',7,8,.63],
   ['stairs',8,9,.63],['stairs',9,10,.75],
   ['platformWalk',10,11,1.15],['platformWalk',11,12,1.00]
  ]
 }],
 ropes:[{
  role:'climb-ropes',
  // Child stands just in front of the vertical z=-1.15 mesh.
  // Alternating x and y follows the actual x=-1.8+0.55*i / y=.27+.49*j grid.
  facing:Math.PI,
  track:[
   {x:-1.28,z:-.88,y:.34},
   {x:-1.28,z:-.88,y:.77},
   {x:-.75,z:-.88,y:1.03},
   {x:-.75,z:-.88,y:1.45},
   {x:-.20,z:-.88,y:1.70},
   {x:-.20,z:-.88,y:2.16},
   {x:.35,z:-.88,y:2.39},
   {x:.35,z:-.88,y:1.91},
   {x:-.20,z:-.88,y:1.46},
   {x:-.75,z:-.88,y:.95},
   {x:-1.28,z:-.88,y:.34}
  ],
  sequence:[
   ['net-up',0,1,.76],['net-up',1,2,.82],
   ['net-up',2,3,.82],['net-up',3,4,.82],
   ['net-up',4,5,.84],['net-up',5,6,.84],
   ['holdNet',6,6,1.2],
   ['net-down',6,7,.82],['net-down',7,8,.88],
   ['net-down',8,9,.86],['net-down',9,10,.92],
   ['rest',10,10,1.2]
  ]
 }],
 bench:[{
  role:'sit',point:{x:0,z:0,y:.65},facing:0
 }]
};
const COLORS={yellow:'#f5b62c',red:'#d94137',metal:'#aeb9bf',metalLight:'#d1dadd',
  dark:'#262c2d',wood:'#906337',woodLight:'#ba8750',blue:'#176cbd',
  rope:'#26292a',climbing:'#555b5b',grip:'#ec4f3b',grass:'#78b250'};
const mats=new Map();
function material(T,c){
 if(!mats.has(c))mats.set(c,new T.MeshLambertMaterial({color:c,side:T.DoubleSide,flatShading:true}));
 return mats.get(c);
}
function polygonArea(p){
 let a=0;
 for(let i=0,j=p.length-1;i<p.length;j=i++)a+=p[j].x*p[i].z-p[i].x*p[j].z;
 return Math.abs(a/2);
}
export function pointInPolygon(p,poly){
 let inside=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];
  if((a.z>p.z)!==(b.z>p.z) && p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;
 }
 return inside;
}
function distToSegment(p,a,b){
 const dx=b.x-a.x,dz=b.z-a.z,dsq=dx*dx+dz*dz;
 if(dsq<1e-12)return Math.hypot(p.x-a.x,p.z-a.z);
 const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/dsq));
 return Math.hypot(p.x-(a.x+t*dx),p.z-(a.z+t*dz));
}
export function footprintContained(center,w,d,poly,margin=.25){
 const hx=w/2+margin,hz=d/2+margin;
 // Include full footprint edges, not only its center. Additional edge-distance
 // check guards against concave notches cutting between grid samples.
 for(let i=0;i<=6;i++)for(let j=0;j<=6;j++){
  const p={x:center.x+hx*(i/3-1),z:center.z+hz*(j/3-1)};
  if(Math.abs(p.x)>49.8||Math.abs(p.z)>49.8||!pointInPolygon(p,poly))return false;
 }
 return true;
}
function overlap(a,b,pad=0.85){
 return Math.abs(a.x-b.x)<(a.w+b.w)/2+pad &&
        Math.abs(a.z-b.z)<(a.d+b.d)/2+pad;
}
function nearMappedFeature(p,w,d,mapped){
 const safety=Math.max(w,d)/2+.9;
 return mapped.some(f=>f.geometry==='point'&&f.point&&
   Math.hypot(f.point.x-p.x,f.point.z-p.z)<safety &&
   !['playground'].includes(f.type));
}
export function planPhotoPlacements(features){
 const polygons=features.filter(f=>f.type==='playground'&&f.geometry==='polygon'&&Array.isArray(f.polygon));
 if(!polygons.length)return {planned:[],reason:'missing-playground-polygon',polygonId:null};
 const winner=polygons.slice().sort((a,b)=>polygonArea(b.polygon)-polygonArea(a.polygon))[0];
 const poly=winner.polygon.slice();
 if(poly.length<4||polygonArea(poly)<25)return {planned:[],reason:'playground-too-small',polygonId:winner.id};
 const xs=poly.map(p=>p.x),zs=poly.map(p=>p.z);
 const minX=Math.max(-49.8,Math.min(...xs)),maxX=Math.min(49.8,Math.max(...xs));
 const minZ=Math.max(-49.8,Math.min(...zs)),maxZ=Math.min(49.8,Math.max(...zs));
 const W=maxX-minX,D=maxZ-minZ;
 // Fit-to-site symbolic scale, not measured dimensions.
 const scale=Math.max(.42,Math.min(1,Math.min(W/18,D/17)));
 const placements=[];
 // Deterministic grid, ordered by intended composition; no randomness.
 const candidates=[];
 for(let i=1;i<=19;i++)for(let j=1;j<=19;j++){
  candidates.push({x:minX+W*i/20,z:minZ+D*j/20,u:i/20,v:j/20});
 }
 const mapped=features.filter(f=>f.geometry==='point');
 for(const spec of APPROVED){
  // Avoid duplicate mapped features in the same category. OSM point takes
  // precedence; photo model only fills objects missing from mapped inventory.
  if(mapped.some(m=>spec.match.includes(m.type)))continue;
  const w=spec.w*scale,d=spec.d*scale;
  const sorted=candidates.slice().sort((a,b)=>{
   const da=(a.u-spec.preferred[0])**2+(a.v-spec.preferred[1])**2;
   const db=(b.u-spec.preferred[0])**2+(b.v-spec.preferred[1])**2;
   return da-db;
  });
  const chosen=sorted.find(c=>footprintContained(c,w,d,poly,.32*scale)&&
    !placements.some(p=>overlap({...c,w,d},p,.55*scale))&&
    !nearMappedFeature(c,w,d,mapped));
  if(!chosen)continue; // Never place outside surveyed playground extent.
  placements.push({...spec,x:chosen.x,z:chosen.z,w,d,scale,
   locationAccuracy:'position indicative, calculée dans le polygone OSM',
   footprintSource:winner.id});
 }
 return {planned:placements,polygonId:winner.id,
  polygonArea:polygonArea(poly),reason:placements.length?'placed':'no-space-or-duplicate'};
}
function builder(T,group){
 const c=COLORS;
 function cube(w,h,d,color,x,y,z){
  const m=new T.Mesh(new T.BoxGeometry(w,h,d),material(T,color));
  m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;
 }
 function cyl(r,h,color,x,y,z,faces=8){
  const m=new T.Mesh(new T.CylinderGeometry(r,r,h,faces),material(T,color));
  m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;
 }
 function link(x1,y1,z1,x2,y2,z2,r,color,faces=7){
  const a=new T.Vector3(x1,y1,z1),b=new T.Vector3(x2,y2,z2);
  const v=new T.Vector3().subVectors(b,a),length=v.length();
  if(length<.01)return null;
  const mesh=new T.Mesh(new T.CylinderGeometry(r,r,length,faces),material(T,color));
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v.normalize());
  mesh.castShadow=true;group.add(mesh);return mesh;
 }
 function posts(coords,h=2.8,color=c.yellow){
  for(const [x,z] of coords)cyl(.12,h,color,x,h/2,z,6);
 }
 function rails(x1,x2,z,y=2.4){
  link(x1,y,z,x2,y,z,.075,c.red,6);
  for(let x=x1+.35;x<x2-.1;x+=.35)link(x,y-.55,z,x,y,z,.045,c.red,5);
 }
 return {cube,cyl,link,posts,rails,c};
}
function buildComplex(T,g){
 const {cube,cyl,link,posts,rails,c}=builder(T,g);
 posts([[-2.85,-1.8],[-2.85,1.5],[-.75,-1.8],[-.75,1.5],[1.2,-1.8],[1.2,1.5],[2.9,-1.8],[2.9,1.5]],3.7);
 cube(2.4,.18,3.2,c.wood,-1.9,2.05,-.13);
 cube(2.7,.18,3.2,c.wood,1.8,2.05,-.13);
 rails(-2.85,-.75,-1.76,2.85);rails(1.20,2.9,-1.76,2.85);
 rails(-2.85,-.75,1.48,2.85);rails(1.20,2.9,1.48,2.85);
 // Horizontal tube connecting the two towers.
 link(-.7,2.65,-.1,1.3,2.65,-.1,.62,c.metal,11);
 for(const x of [-.66,.15,1.2])cyl(.66,.07,c.metalLight,x,2.65,-.1,12).rotation.z=Math.PI/2;
 // Wall with red climbing grips
 const wall=cube(1.85,2.45,.15,c.climbing,1.98,1.35,1.55);
 for(let i=0;i<3;i++)for(let j=0;j<4;j++)
  cube(.16,.14,.16,c.grip,1.3+i*.55,.45+j*.51,1.68);
 // Stairs on one end, no exact dimensions are implied.
 for(let i=0;i<5;i++)cube(.95,.11,.42,c.metalLight,-3.05,.27+i*.37,-1.4+i*.5);
 for(const x of [-3.58,-2.52])link(x,.3,-1.55,x,2.25,.55,.08,c.red);
 // Yellow roof / visual accents.
 cube(.75,.18,.8,c.yellow,-2.60,3.35,-1.05);
}
function buildTubeSlide(T,g){
 const {cube,cyl,link,posts,c}=builder(T,g);
 posts([[-2,-1.45],[-2,1.0],[-.4,-1.45],[-.4,1.0]],3.4);
 cube(2.15,.17,2.45,c.wood,-1.20,2.15,-.20);
 for(let i=0;i<5;i++)cube(.82,.12,.33,c.metalLight,-2.55,.36+i*.37,-1.2+i*.4);
 link(-2.0,2.93,1.02,-.45,2.93,1.02,.06,c.red);
 link(-2.0,2.93,-1.46,-.45,2.93,-1.46,.06,c.red);
 // Curved tube slide made of low-sided silver metal segments.
 const path=[[-.45,2.44,0],[.25,2.40,.10],[1.10,2.2,.35],[1.80,1.87,.87],[2.25,1.38,1.55],[2.33,.82,2.12]];
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i];
  link(a[0],a[1],a[2],b[0],b[1],b[2],.54,c.metal,12);
  cyl(.57,.07,c.metalLight,a[0],a[1],a[2],12).rotation.z=.7;
 }
 cyl(.58,.16,c.metalLight,2.35,.77,2.13,12).rotation.x=.62;
 // Dark open exit and bright rim indicate a hollow slide.
 cyl(.45,.02,c.dark,2.39,.72,2.24,12).rotation.x=.65;
}
function buildSmall(T,g){
 const {cube,link,posts,c}=builder(T,g);
 posts([[-1.4,-1.25],[-1.4,.75],[1.1,-1.25],[1.1,.75]],2.75);
 cube(2.35,.17,1.86,c.wood,-.15,1.43,-.23);
 cube(1.17,.78,.12,c.blue,-1.31,2.20,-.28);
 cube(1.14,.78,.12,c.blue,1.05,2.20,-.28);
 cube(1.6,.7,.11,c.blue,-.05,2.43,-1.27);
 // Five visible pixel-art stair treads. These are the SAME locations used by
 // MODEL_INTERACTIONS.small, so a child's foot reaches each physical step.
 const stepX=[-1.35,-1.27,-1.17,-1.10,-1.02];
 const stepZ=[-2.30,-2.05,-1.80,-1.55,-1.30];
 for(let i=0;i<5;i++){
  const top=.31+.25*i;
  cube(.52,.11,.24,c.metalLight,stepX[i],top-.055,stepZ[i]);
 }
 for(const x of [-1.73,-.70]){
  link(x,.29,-2.47,x,1.70,-1.22,.055,c.red,6);
 }
 // Red open straight slide from platform to the ground.
 link(.13,1.48,.72,.13,.37,2.15,.56,c.red,9);
 cube(1.18,.13,.35,c.red,.13,.33,2.19);
 for(const x of [-.49,.75])link(x,1.46,.74,x,.39,2.14,.065,c.red);
}
function buildRopes(T,g){
 const {cube,cyl,link,posts,c}=builder(T,g);
 posts([[-2.05,-1.25],[-2.05,1.15],[2.05,-1.25],[2.05,1.15]],3.2);
 for(const z of [-1.18,1.14])link(-2.1,3.22,z,2.1,3.22,z,.08,c.red);
 for(const x of [-1.95,1.95])link(x,3.22,-1.23,x,3.22,1.18,.08,c.red);
 // Net of dark cords with distinct red junctions.
 for(let i=0;i<=5;i++){
  const x=-1.8+i*.55;
  link(x,.18,-1.15,x,2.95,-1.15,.028,c.rope,5);
 }
 for(let j=0;j<=5;j++){
  const y=.27+j*.49;
  link(-1.8,y,-1.15,.95,y,-1.15,.027,c.rope,5);
 }
 for(let i=0;i<=5;i++)for(let j=0;j<=5;j++)
  cyl(.07,.10,c.red,-1.8+i*.55,.27+j*.49,-1.15,6).rotation.x=Math.PI/2;
 // Hanging climbing orbs.
 for(const x of [1.05,1.70]){
  link(x,3.11,.22,x,.45,.22,.035,c.rope,5);
  for(const y of [.9,1.55,2.25]){
   const ball=new T.Mesh(new T.IcosahedronGeometry(.19,0),material(T,c.dark));
   ball.position.set(x,y,.22);g.add(ball);
  }
 }
}
function buildBench(T,g){
 const {cube,c}=builder(T,g);
 for(const x of [-.91,.91]){
  cube(.14,.57,.16,c.dark,x,.33,-.22);
  cube(.14,.53,.16,c.dark,x,.28,.23);
 }
 cube(2.30,.16,.72,c.woodLight,0,.65,0);
 cube(2.30,.21,.14,c.woodLight,0,1.07,-.34);
 cube(2.30,.19,.14,c.woodLight,0,1.37,-.34);
}
const BUILDERS={complex:buildComplex,tube:buildTubeSlide,small:buildSmall,ropes:buildRopes,bench:buildBench};
export function drawPhotoModels(T,features,height,parent,pickable,visible=true){
 const group=new T.Group();group.name='Photo-referenced indicative Ycoor playground; NOT surveyed';
 parent.add(group);group.visible=visible;
 const plan=planPhotoPlacements(features||[]);
 const drawn=[];
 for(const p of plan.planned){
  const part=new T.Group();
  part.name='PHOTO-ILLUSTRATION: '+p.name;
  part.position.set(p.x,height(p.x,p.z)+.27,p.z);
  part.scale.set(p.scale,p.scale,p.scale);
  group.add(part);
  BUILDERS[p.key](T,part);
  const desc='Modèle pixel-art approuvé par l’utilisateur, inspiré des photos de Ycoor. '+
    p.evidence+'. Position indicative calculée à l’intérieur du polygone OSM '+plan.polygonId+
    ' ; ce n’est pas un emplacement mesuré ni une reproduction exacte des dimensions. '+
    'Documentation : '+PHOTO_SOURCE;
  part.traverse(obj=>{
   if(!obj.isMesh)return;
   obj.userData={title:p.name,desc,source:'photo',photoReference:PHOTO_SOURCE,
      positionQuality:'approximate',id:p.key,playgroundOSM:plan.polygonId};
   pickable.push(obj);
  });
  drawn.push({key:p.key,name:p.name,center:{x:p.x,z:p.z},
   scale:p.scale,polygonId:plan.polygonId,
   interactions:MODEL_INTERACTIONS[p.key]||[]});
 }
 return {group,drawn,reason:plan.reason,polygonId:plan.polygonId};
}
