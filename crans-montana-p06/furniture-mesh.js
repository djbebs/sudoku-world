/* Crans-Montana P0.6: symbolic low-poly assets at REAL OSM coordinates.
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
 if(!data?.features?.length)return {group,drawn:[],counts:{}};
 const drawn=[],counts={};
 for(const item of data.features){
  if(item.geometry==='polygon'&&item.type==='playground'){
   const poly=item.polygon;
   const material=mat(T,'#7a9257');
   let visible=false;
   for(let i=1;i<poly.length;i++){
    const segment=clipSegment(poly[i-1],poly[i]);
    if(!segment)continue;
    lineGeom(segment,.37,material,.58,group);visible=true;
   }
   if(visible){drawn.push(item);counts[item.type]=(counts[item.type]||0)+1}
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
    '. Position cartographiée dans OpenStreetMap. Forme, taille et orientation de cette maquette : symboliques, non mesurées. '+
    item.sourceURL};
  g.traverse(o=>{
   if(o.isMesh){
    o.userData={...meta,source:'osm',osmID:item.id};
    objects.push(o);
   }
  });
  drawn.push(item);counts[item.type]=(counts[item.type]||0)+1;
 }
 return {group,drawn,counts};
}
