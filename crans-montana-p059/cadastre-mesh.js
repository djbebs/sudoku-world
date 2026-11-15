/* P0.5.9 cadastral mesh builder. Actual LV95 vectors in, pixel-art 3D out.
 * No imagery or hand-digitised points.
 *
 * All actual polygon edges are preserved. Triangles are clipped to P0 and
 * subdivided internally for altitude, without changing source-boundary points.
 * Holes, disjoint rings and islands are handled by nesting parity.
 */
export const PILOT_HALF=50;
export function pointInsideRing(p,ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;
 }
 return inside;
}
function signedArea(r){
 let area=0;
 for(let i=0;i<r.length;i++){
  const a=r[i],b=r[(i+1)%r.length];
  area+=a.x*b.z-b.x*a.z;
 }
 return area/2;
}
function samePoint(a,b){return Math.abs(a.x-b.x)<1e-8&&Math.abs(a.z-b.z)<1e-8}
export function shapeNesting(rings){
 const sorted=rings.map((input,origIndex)=>{
  const r=input.slice();
  if(r.length>3&&samePoint(r[0],r[r.length-1]))r.pop();
  return {ring:r,absArea:Math.abs(signedArea(r)),origIndex,parent:-1,depth:0}
 }).filter(o=>o.ring.length>=3&&o.absArea>1e-8)
   .sort((a,b)=>b.absArea-a.absArea);
 for(let i=0;i<sorted.length;i++){
  const ring=sorted[i];
  for(let j=i-1;j>=0;j--){
   const candidate=sorted[j];
   if(pointInsideRing(ring.ring[0],candidate.ring)){
    if(ring.parent<0||candidate.absArea<sorted[ring.parent].absArea)ring.parent=j;
   }
  }
  if(ring.parent>=0)ring.depth=sorted[ring.parent].depth+1;
 }
 return sorted;
}
export function clipPolygon(polygon,half=PILOT_HALF){
 let out=polygon;
 for(const bound of [
  {axis:'x',value:-half,dir:1},{axis:'x',value:half,dir:-1},
  {axis:'z',value:-half,dir:1},{axis:'z',value:half,dir:-1}
 ]){
  const input=out;out=[];
  for(let i=0;i<input.length;i++){
   const a=input[i],b=input[(i+1)%input.length];
   const av=(a[bound.axis]-bound.value)*bound.dir;
   const bv=(b[bound.axis]-bound.value)*bound.dir;
   const ina=av>=-1e-8,inb=bv>=-1e-8;
   if(ina&&inb){out.push(b)}
   else if(ina!==inb){
    const denom=b[bound.axis]-a[bound.axis];
    const t=Math.abs(denom)>1e-12?(bound.value-a[bound.axis])/denom:0;
    const cross={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
    out.push(cross);if(inb)out.push(b)
   }
  }
  if(!out.length)break;
 }
 return out;
}
function ringShape(THREE,ring){
 const shape=new THREE.Shape();
 shape.moveTo(ring[0].x,-ring[0].z);
 for(let i=1;i<ring.length;i++)shape.lineTo(ring[i].x,-ring[i].z);
 shape.closePath();
 return shape;
}
export function triangulateOfficialPolygon(THREE,rings,height,{offset=.22,maxEdge=2.5}={}){
 const indexed=shapeNesting(rings);
 const vertices=[];
 const emitTriangle=(A,B,C)=>{
  const len=Math.max(Math.hypot(B.x-A.x,B.z-A.z),
    Math.hypot(C.x-B.x,C.z-B.z),Math.hypot(A.x-C.x,A.z-C.z));
  const n=Math.max(1,Math.ceil(len/maxEdge));
  // Every tessellated triangle is within official boundary, after clipping.
  const vertex=(i,j)=>{
   const x=A.x+(B.x-A.x)*i/n+(C.x-A.x)*j/n;
   const z=A.z+(B.z-A.z)*i/n+(C.z-A.z)*j/n;
   return [x,height(x,z)+offset,z];
  };
  for(let i=0;i<n;i++)for(let j=0;j<n-i;j++){
   const a=vertex(i,j),b=vertex(i+1,j),c=vertex(i,j+1);
   vertices.push(...a,...b,...c);
   if(i+j+1<n){
    const d=vertex(i+1,j+1);vertices.push(...b,...d,...c);
   }
  }
 };
 for(let i=0;i<indexed.length;i++){
  const item=indexed[i];
  if(item.depth%2!==0)continue;
  const shape=ringShape(THREE,item.ring);
  for(let j=i+1;j<indexed.length;j++){
   const hole=indexed[j];
   if(hole.parent!==i||hole.depth!==item.depth+1)continue;
   const path=new THREE.Path();
   path.moveTo(hole.ring[0].x,-hole.ring[0].z);
   for(let k=1;k<hole.ring.length;k++)path.lineTo(hole.ring[k].x,-hole.ring[k].z);
   path.closePath();shape.holes.push(path);
  }
  const geometry=new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI/2);
  const att=geometry.getAttribute('position'),index=geometry.getIndex();
  const length=index?index.count:att.count;
  for(let t=0;t<length;t+=3){
   const triangle=[];
   for(let k=0;k<3;k++){
    const q=index?index.getX(t+k):t+k;
    triangle.push({x:att.getX(q),z:att.getZ(q)});
   }
   const clipped=clipPolygon(triangle);
   for(let k=1;k<clipped.length-1;k++)
    emitTriangle(clipped[0],clipped[k],clipped[k+1]);
  }
  geometry.dispose();
 }
 if(!vertices.length)return null;
 const buffer=new THREE.BufferGeometry();
 buffer.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
 buffer.computeVertexNormals();
 return buffer;
}
export function renderMOFeatures(THREE,features,height,parent,objectArray,lineGeom){
 const drawn=[],materials=new Map();
 const material=(c)=>{
  if(!materials.has(c))materials.set(c,new THREE.MeshLambertMaterial({
   color:c,flatShading:true,side:THREE.DoubleSide
  }));
  return materials.get(c);
 };
 // First ground cover, then miscellaneous official surfaces above it.
 const surfaces=features.filter(f=>f.geometry.rings).sort((a,b)=>a.layer-b.layer);
 const lines=features.filter(f=>f.geometry.paths);
 for(const f of surfaces){
  const geo=triangulateOfficialPolygon(THREE,f.geometry.rings,height,{
   offset:f.layer===190?.42:.27,maxEdge:2.5});
  if(!geo)continue;
  const mesh=new THREE.Mesh(geo,material(f.color));
  mesh.receiveShadow=true;mesh.castShadow=false;
  mesh.userData={title:'Mensuration officielle : '+f.label,
   desc:'État du Valais, couche '+f.layer+', OBJECTID '+f.objectID+'. Contours cadastraux officiels. Couleurs et représentation de terrain illustratives, non certifiées juridiquement.'};
  parent.add(mesh);objectArray.push(mesh);drawn.push({id:f.objectID,layer:f.layer,genre:f.genre});
 }
 for(const f of lines){
  for(const points of f.geometry.paths){
   if(points.length<2)continue;
   // Width conveys line visibly, NOT a measured cadastral path width.
   lineGeom(points,f.displayWidth||1.2,material(f.color),.54,parent);
   drawn.push({id:f.objectID,layer:f.layer,genre:f.genre});
  }
 }
 return drawn;
}
