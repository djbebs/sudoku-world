/* Official swisstopo SWISSIMAGE aerial photo, 100m square around Ycoor.
   Not a replacement for georeferenced vector footpaths. MIT-style project code.
   Local x=east, z=south. Photo remains available when OSM paths are absent. */
export function attachAerial({THREE,origin,world,height,button,status}){
 let on=true,texture=null,mesh=null,loading=false;
 const label=(t)=>{status.textContent=t};
 function pixel(lon,lat,z){
  const n=256*2**z,r=lat*Math.PI/180;
  return {x:(lon+180)/360*n,y:(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n};
 }
 function tiles(){
  const dlat=50/111320,dlon=50/(111320*Math.cos(origin.lat*Math.PI/180));
  const nw=pixel(origin.lon-dlon,origin.lat+dlat,19);
  const se=pixel(origin.lon+dlon,origin.lat-dlat,19);
  return {nw,se};
 }
 function loadTile(url){
  return new Promise((resolve,reject)=>{
   const im=new Image();im.crossOrigin='anonymous';
   const timeout=setTimeout(()=>{im.src='';reject(new Error('délai dépassé'))},12500);
   im.onload=()=>{clearTimeout(timeout);resolve(im)};
   im.onerror=()=>{clearTimeout(timeout);reject(new Error('image inaccessible'))};
   im.src=url;
  });
 }
 function attach(){
  if(mesh?.parent)mesh.parent.remove(mesh);
  if(!texture)return;
  const n=30,pos=[],uv=[],idx=[];
  for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){
   const x=-50+i*100/n,z=-50+j*100/n;
   pos.push(x,height(x,z)+.12,z);
   uv.push(i/n,1-j/n);
  }
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
   const a=j*(n+1)+i,b=a+1,c=a+n+1,d=c+1;
   idx.push(a,c,b,b,c,d);
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(idx);geo.computeVertexNormals();
  const mat=new THREE.MeshBasicMaterial({
   map:texture,transparent:true,opacity:.9,depthWrite:false,
   side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2
  });
  mesh=new THREE.Mesh(geo,mat);
  mesh.name='Official swisstopo SWISSIMAGE draped on Ycoor';
  mesh.renderOrder=1;mesh.visible=on;
  world.add(mesh);
 }
 async function load(){
  if(texture||loading)return;
  loading=true;label('Photographie swisstopo : chargement…');
  try{
   const {nw,se}=tiles(),spanX=se.x-nw.x,spanY=se.y-nw.y;
   if(spanX<=0||spanY<=0)throw Error('coordonnées invalides');
   const size=512,canvas=document.createElement('canvas');
   canvas.width=size;canvas.height=size;
   const context=canvas.getContext('2d',{alpha:false});
   context.fillStyle='#91a486';context.fillRect(0,0,size,size);
   const list=[];
   for(let y=Math.floor(nw.y/256);y<=Math.floor((se.y-.001)/256);y++){
    for(let x=Math.floor(nw.x/256);x<=Math.floor((se.x-.001)/256);x++){
     list.push({x,y,url:'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/19/'+x+'/'+y+'.jpeg'});
    }
   }
   if(!list.length||list.length>16)throw Error('emprise tuiles incorrecte');
   const images=await Promise.allSettled(list.map(t=>loadTile(t.url)));
   if(images.some(r=>r.status!=='fulfilled'))throw Error('tuiles SWISSIMAGE indisponibles');
   list.forEach((t,i)=>context.drawImage(images[i].value,
    (t.x*256-nw.x)/spanX*size,(t.y*256-nw.y)/spanY*size,
    256/spanX*size,256/spanY*size));
   texture=new THREE.CanvasTexture(canvas);
   texture.colorSpace=THREE.SRGBColorSpace;
   texture.magFilter=THREE.NearestFilter;
   texture.minFilter=THREE.LinearMipmapLinearFilter;
   attach();
   label('Photo réelle au sol : chemins visibles, non vectorisés');
  }catch(e){
   console.warn('Orthophoto swisstopo:',e);
   label('Photo indisponible. Ouvre « Carte 2D ».');
  }finally{loading=false}
 }
 button.onclick=()=>{
  on=!on;button.classList.toggle('active',on);
  button.setAttribute('aria-pressed',String(on));
  if(mesh)mesh.visible=on;
  if(on&&!texture)load();
  if(!on)label('Photo masquée : terrain pixel-art');
  else if(texture)label('Photo réelle au sol : chemins non vectorisés');
 };
 button.classList.add('active');
 return {attach,load};
}
