import { triangulateOfficialPolygon } from './cadastre-mesh.js?v=2';
/* Crans-Montana P0.6.1: symbolic low-poly assets at REAL OSM coordinates.
 * The source gives position/category, not the exact design/dimensions.
 * Objects are explicitly labelled "symbolic asset" in UI.
 * There are no hard-coded coordinates or procedural/random furniture rows.
 */
const MATERIALS=new Map();
function mat(T,c){
 if(!MATERIALS.has(c))MATERIALS.set(c,new T.MeshLambertMaterial({color:c,flatShading:true,side:T.DoubleSide}));
 return MATERIALS.get(c);
}
function orientation(tags){
 const raw=String(tags?.direction||'').trim();
 const dir=Number(raw);
 if(!Number.isFinite(dir)||dir<-360||dir>360||!raw)return 0;
 return -dir*Math.PI/180;
}
function makeBuilder(T,g){
 const wood=mat(T,'#8e6242'),wood2=mat(T,'#a57a4a'),
  steel=mat(T,'#4f5b56'),dark=mat(T,'#273a33'),
  light=mat(T,'#e6ca85'),red=mat(T,'#cb5549'),
  blue=mat(T,'#416b8b'),pale=mat(T,'#dce7d9'),water=mat(T,'#6ea1b4'),
  gold=mat(T,'#e5c767'),green=mat(T,'#6e956a');
 function cube(w,h,d,m,x,y,z){
  const o=new T.Mesh(new T.BoxGeometry(w,h,d),m);
  o.position.set(x,y,z);g.add(o);o.castShadow=true;o.receiveShadow=true;return o;
 }
 function cylinder(r,h,m,x,y,z,faces=6){
  const o=new T.Mesh(new T.CylinderGeometry(r,r,h,faces),m);
  o.position.set(x,y,z);g.add(o);o.castShadow=true;o.receiveShadow=true;return o;
 }
 return {
  bench(tags){
   cube(1.8,.17,.55,wood,0,.57,0);
   for(const x of [-.65,.65])cube(.12,.55,.12,steel,x,.28,0);
   if(tags?.backrest!=='no'){
    cube(1.8,.60,.15,wood2,0,.94,-.27);
    for(const x of [-.7,.7])cube(.11,.49,.13,steel,x,.76,-.27);
   }
  },
  waste(){
   cylinder(.28,.77,steel,0,.39,0);cylinder(.3,.10,dark,0,.81,0);
   cube(.32,.14,.09,wood,0,.55,.27);
  },
  lamp(){
   cylinder(.11,4.8,steel,0,2.4,0);
   cube(.75,.22,.65,light,0,4.83,0);
   cube(.95,.13,.85,dark,0,5.02,0);
  },
  bus(){
   cylinder(.095,2.4,steel,0,1.2,0);
   cube(.72,.68,.12,blue,0,2.37,0);
   cube(.42,.15,.15,pale,0,2.47,.10);
  },
  picnic(){
   cube(1.45,.13,.86,wood2,0,.78,0);
   for(const x of [-.52,.52])cube(.12,.72,.12,steel,x,.36,0);
   for(const z of [-.76,.76]){
    cube(1.5,.13,.28,wood,0,.46,z);
    for(const x of [-.54,.54])cube(.10,.42,.12,steel,x,.22,z)
   }
  },
  fountain(){
   cylinder(.80,.30,steel,0,.15,0,8);
   cylinder(.65,.07,water,0,.34,0,8);
   cylinder(.10,.54,steel,0,.60,0);
   cylinder(.27,.09,water,0,.92,0,8);
  },
  water(){
   cylinder(.12,.9,steel,0,.46,0);
   cube(.44,.18,.28,pale,0,.94,0);
   cube(.24,.11,.14,blue,0,1.04,0);
  },
  bicycle(){
   for(const z of [-.38,.38]){
    cube(.09,.75,.09,steel,-.40,.4,z);
    cube(.09,.75,.09,steel,.40,.4,z);
    cube(.88,.09,.1,steel,0,.76,z);
   }
  },
  bollard(){
   cylinder(.15,.78,steel,0,.39,0);
   cylinder(.16,.13,light,0,.73,0);
  },
  playground(){
   // OSM node indicates an area, not precise locations of play equipment.
   // Sign only, no swing/slide unless an equipment node exists.
   cylinder(.12,1.6,wood,0,.80,0);
   cube(.92,.62,.10,green,0,1.65,0);
   cube(.20,.20,.13,light,-.21,1.70,.07);
   cube(.20,.20,.13,red,.21,1.70,.07);
  },
  slide(){
   cube(.68,.15,1.35,light,0,1.20,.30).rotation.x=.43;
   for(const x of [-.34,.34])cylinder(.10,1.75,steel,x,.89,-.38);
   cube(.78,.12,.78,red,0,1.76,-.40);
   cube(.12,.65,.12,steel,.32,.30,.9);
   cube(.12,.65,.12,steel,-.32,.30,.9);
  },
  swing(){
   for(const x of [-.98,.98])for(const z of [-.35,.35])
    cylinder(.10,2.2,steel,x,1.1,z);
   cube(2.2,.14,.15,red,0,2.24,0);
   for(const x of [-.3,.3])cylinder(.028,1.20,dark,x,1.57,0);
   cube(.78,.12,.42,wood,0,.97,0);
  },
  structure(){
   // Symbolic combined climbing tower with tube slide, wooden posts and red rails.
   // Shape inspired by documented Ycoor facilities, positioned ONLY at mapped
   // equipment OSM features; not a precise replica or assumed location.
   for(const x of [-.95,.95])for(const z of [-.55,.55])
    cylinder(.12,2.6,wood,x,1.3,z);
   cube(2.12,.14,1.35,red,0,1.48,0);
   cube(2.10,.15,1.30,light,0,2.65,0);
   cube(2.15,.11,.11,red,0,2.18,.59);
   cube(2.15,.11,.11,red,0,2.18,-.59);
   cube(1.04,.16,1.65,pale,1.35,1.25,1.30).rotation.x=.42;
   for(const z of [-.4,.4])cube(.09,1.15,.09,steel,-1.00,.64,z);
  },
  seesaw(){
   cylinder(.35,.40,steel,0,.20,0);
   cube(2.85,.15,.32,wood2,0,.67,0);
   for(const x of [-1.17,1.17]){
    cube(.12,.38,.12,red,x,.94,0);
    cube(.42,.13,.42,red,x,.84,0);
   }
  },
  springy(){
   cylinder(.15,.48,dark,0,.27,0);
   cube(.83,.33,.47,red,0,.71,0);
   cube(.12,.42,.12,wood2,.22,1,.0);
  },
  roundabout(){
   cylinder(.77,.17,blue,0,.3,0,8);
   cylinder(.12,.95,steel,0,.82,0,6);
   for(const x of [-.53,.53])cube(.13,.62,.13,red,x,.63,0);
  },
  zipwire(){
   for(const x of [-2.1,2.1])cylinder(.13,2.9,wood,x,1.45,0);
   cube(4.4,.09,.11,steel,0,2.89,0);
   cylinder(.11,.83,steel,0,2.40,0);
   cube(.65,.09,.37,red,0,1.95,0);
  },
  sandpit(){
   cube(2,.12,2,wood,0,.09,0);
   cube(1.8,.14,1.8,light,0,.22,0);
  },
  climbing(){
   for(const x of [-.7,.7])for(const z of [-.7,.7])
    cylinder(.10,1.8,wood,x,.9,z);
   cube(1.65,.13,1.65,red,0,1.87,0);
   for(const y of [.48,.98,1.48])
    cube(1.35,.09,.10,light,0,y,.70);
  }
 };
}
function clipSegment(a,b,extent=49.6){
 // Liang-Barsky against pilot square; vertex positions remain source-derived.
 let t0=0,t1=1;
 const dx=b.x-a.x,dz=b.z-a.z;
 const p=[-dx,dx,-dz,dz],q=[a.x+extent,extent-a.x,a.z+extent,extent-a.z];
 for(let i=0;i<4;i++){
  if(Math.abs(p[i])<1e-12){if(q[i]<0)return null;continue}
  const u=q[i]/p[i];
  if(p[i]<0)t0=Math.max(t0,u);else t1=Math.min(t1,u);
  if(t0>t1)return null;
 }
 return [{x:a.x+t0*dx,z:a.z+t0*dz},{x:a.x+t1*dx,z:a.z+t1*dz}];
}
export function drawFurniture(T,data,height,parent,objects,lineGeom){
 const group=new T.Group();group.name='OpenStreetMap street furniture, non-cadastral';
 parent.add(group);
 if(!data?.features?.length)return {group,drawn:[],counts:{},colliders:[]};
 const drawn=[],counts={},colliders=[];
 for(const item of data.features){
  if(item.geometry==='polygon'&&item.type==='playground'){
   const poly=item.polygon;
   const surface=(item.tags?.surface||'').toLowerCase();
   const surfaceColor={
    sand:'#d5c298',woodchips:'#ad8461',woodchip:'#ad8461',wood:'#ad8461',
    rubber:'#b78375',tartan:'#b78375',gravel:'#c3b8a0',fine_gravel:'#c3b8a0',
    grass:'#8aaf69',artificial_turf:'#8dc071',synthetic_turf:'#8dc071',
    ground:'#ad9f81',compacted:'#b9ae98'
   }[surface]||'#8fba76';
   // Source-mapped polygon, filled as stylised ground rather than a mere border.
   // Offset 0.18 is intentionally BELOW verified cadastral overlays (~0.27)
   // so official paved, sand or other classified sub-areas stay visible.
   const g=triangulateOfficialPolygon(T,[poly],height,{offset:.18,maxEdge:1.8});
   if(!g)continue;
   const ground=new T.Mesh(g,mat(T,surfaceColor));
   ground.receiveShadow=true;ground.castShadow=false;
   ground.userData={title:item.name||'Aire de jeux cartographiée',
    source:'osm',osmID:item.id,
    desc:'Contour de '+item.sourceURL+
    '. Surface pixel-art stylisée selon '+(surface?'surface='+surface:'la référence visuelle locale')+
    '. Aucun équipement n’est ajouté sans position OSM.'};
   group.add(ground);objects.push(ground);
   const lineMaterial=mat(T,'#ff6900');
   for(let i=1;i<poly.length;i++){
    const segment=clipSegment(poly[i-1],poly[i]);
    if(!segment)continue;
    lineGeom(segment,.48,lineMaterial,.72,group);
   }
   drawn.push(item);counts[item.type]=(counts[item.type]||0)+1;
   continue;
  }
  if(item.geometry!=='point')continue;
  const {x,z}=item.point;
  if(Math.abs(x)>49.6||Math.abs(z)>49.6)continue;
  const g=new T.Group();g.position.set(x,height(x,z)+.12,z);
  g.rotation.y=orientation(item.tags);group.add(g);
  const b=makeBuilder(T,g);
  if(typeof b[item.type]!=='function')continue;
  b[item.type](item.tags);
  const meta={title:item.name||item.label,
    desc:'Objet OSM '+item.osmType+'/'+item.osmId+' · '+item.label+
    '. Position '+(item.locationMethod==='way_geometry_representative'?
      'déduite de la géométrie de cet équipement OSM (symbole au centre représentatif)':
      'cartographiée directement dans OSM')+
    '. Forme, taille et orientation du modèle 3D : symboliques, non mesurées. '+
    item.sourceURL};
  g.traverse(o=>{
   if(o.isMesh){
    o.userData={...meta,source:'osm',osmID:item.id,atlasCollisionKind:'barrier'};
    objects.push(o);
   }
  });
  colliders.push({key:'osm-'+item.id,modelObject:g});
  drawn.push(item);counts[item.type]=(counts[item.type]||0)+1;
 }
 return {group,drawn,counts,colliders};
}
