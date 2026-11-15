/* Ycoor P0.6 | Street furniture observations (NOT cadastral survey data).
 * Coordinates: OpenStreetMap nodes and closed polygon ways only.
 * No photographic tracing, no invented objects or point locations.
 * Provenance for each object: OSM element type/id, tags, source URL.
 *
 * Local map centre LV95 2603036 / 1128849. WGS84 origin and linearized
 * ENU-to-LV95 Jacobian were computed with PROJ EPSG:4326 -> EPSG:2056.
 * On the 100m pilot, the local linear approximation is well below 1 metre.
 */
export const OSM_CREDIT='© OpenStreetMap contributors (ODbL)';
export const ORIGIN_WGS84={lon:7.478054985916397,lat:46.311038174695724};
// Request a slightly larger WGS84 envelope to cover every rotated LV95 corner;
// exact 100m clipping happens only after conversion to local LV95.
export const PILOT_BBOX={south:46.310568,west:7.477380,north:46.311508,east:7.478730};
export const CATEGORIES=[
 {key:'bench',label:'Bancs',emoji:'🪑'},
 {key:'playground',label:'Aires de jeux',emoji:'🛝'},
 {key:'slide',label:'Toboggans',emoji:'🛝'},
 {key:'swing',label:'Balançoires',emoji:'🎠'},
 {key:'climbing',label:'Jeux à grimper',emoji:'🧗'},
 {key:'structure',label:'Structures multi-jeux',emoji:'🏗️'},
 {key:'seesaw',label:'Balançoires à bascule',emoji:'⚖️'},
 {key:'springy',label:'Jeux à ressort',emoji:'🐴'},
 {key:'roundabout',label:'Tourniquets',emoji:'🎠'},
 {key:'zipwire',label:'Tyroliennes',emoji:'🧗'},
 {key:'sandpit',label:'Bacs à sable',emoji:'🏖️'},
 {key:'waste',label:'Poubelles',emoji:'🗑️'},
 {key:'lamp',label:'Lampadaires',emoji:'💡'},
 {key:'bus',label:'Arrêts de bus',emoji:'🚏'},
 {key:'picnic',label:'Tables de pique-nique',emoji:'🧺'},
 {key:'fountain',label:'Fontaines',emoji:'⛲'},
 {key:'water',label:'Eau potable',emoji:'🚰'},
 {key:'bicycle',label:'Arceaux vélos',emoji:'🚲'},
 {key:'bollard',label:'Bornes',emoji:'📍'}
];
const TYPE_NAMES=Object.fromEntries(CATEGORIES.map(x=>[x.key,x.label]));
export function wgs84ToLocal(lat,lon){
 const dlo=lon-ORIGIN_WGS84.lon,dla=lat-ORIGIN_WGS84.lat;
 return {x:dlo*77033.50156+dla*(-54.56545),
         z:-(dlo*37.86101+dla*111165.18930)};
}
export function withinPilot(p,margin=.15){
 return Number.isFinite(p.x)&&Number.isFinite(p.z)&&Math.abs(p.x)<=50+margin&&Math.abs(p.z)<=50+margin;
}
export function overpassQuery(){
 const b=PILOT_BBOX,[s,w,n,e]=[b.south,b.west,b.north,b.east];
 const bbox=[s,w,n,e].map(n=>n.toFixed(8)).join(',');
 return '[out:json][timeout:20];('+
 'node["amenity"~"^(bench|waste_basket|fountain|drinking_water|bicycle_parking)$"]('+bbox+');'+
 'node["highway"~"^(street_lamp|bus_stop)$"]('+bbox+');'+
 'node["public_transport"="platform"]('+bbox+');'+
 'node["leisure"~"^(playground|picnic_table)$"]('+bbox+');'+
 'node["playground"]('+bbox+');'+
 'node["barrier"="bollard"]('+bbox+');'+
 'way["leisure"="playground"]('+bbox+');'+
 'way["playground"]('+bbox+');'+
 'way["highway"~"^(footway|path|pedestrian|living_street)$"]('+bbox+');'+
 ');out body geom;';
}
export const ENDPOINTS=[
 'https://overpass.osm.ch/api/interpreter',
 'https://overpass.kumi.systems/api/interpreter',
 'https://overpass-api.de/api/interpreter'
];
function category(tags){
 if(tags.playground==='slide')return 'slide';
 if(['swing','baby_swing','basketswing','tire_swing'].includes(tags.playground))return 'swing';
 if(['structure','play_structure'].includes(tags.playground))return 'structure';
 if(tags.playground==='seesaw')return 'seesaw';
 if(['springy','spring_rider'].includes(tags.playground))return 'springy';
 if(['roundabout','carousel'].includes(tags.playground))return 'roundabout';
 if(['zipwire','aerialway'].includes(tags.playground))return 'zipwire';
 if(tags.playground==='sandpit')return 'sandpit';
 if(['climbingframe','climbing_frame','climbingwall','climbing_wall'].includes(tags.playground))return 'climbing';
 if(tags.amenity==='bench')return 'bench';
 if(tags.amenity==='waste_basket')return 'waste';
 if(tags.amenity==='fountain')return 'fountain';
 if(tags.amenity==='drinking_water')return 'water';
 if(tags.amenity==='bicycle_parking')return 'bicycle';
 if(tags.highway==='street_lamp')return 'lamp';
 if(tags.highway==='bus_stop'||(tags.public_transport==='platform'&&tags.bus==='yes'))return 'bus';
 if(tags.leisure==='picnic_table')return 'picnic';
 if(tags.leisure==='playground')return 'playground';
 if(tags.barrier==='bollard')return 'bollard';
 return null;
}
function ignored(tags){
 return tags.access==='private'||tags.access==='no'||
  tags.disused==='yes'||tags.demolished==='yes'||
  tags.abandoned==='yes'||tags['disused:amenity']||
  tags['disused:leisure']||tags.construction;
}
const same=(a,b)=>Math.abs(a.lat-b.lat)<1e-9&&Math.abs(a.lon-b.lon)<1e-9;

function pointInPolygon(p,ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if((a.z>p.z)!==(b.z>p.z) && p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;
 }
 return inside;
}
function wayRepresentativePoint(poly,closed){
 // Position is derived from an existing mapped way, not manually placed.
 // Prefer geometric polygon centroid (if inside), otherwise distance midpoint
 // on the surveyed OSM outline/line. The symbol has NO measured footprint.
 if(closed&&poly.length>=4){
  let area=0,x=0,z=0;
  for(let i=0;i<poly.length-1;i++){
   const a=poly[i],b=poly[i+1],cross=a.x*b.z-b.x*a.z;
   area+=cross;x+=(a.x+b.x)*cross;z+=(a.z+b.z)*cross;
  }
  if(Math.abs(area)>1e-8){
   const center={x:x/(3*area),z:z/(3*area)};
   if(pointInPolygon(center,poly))return center;
  }
 }
 const distances=[];let total=0;
 for(let i=1;i<poly.length;i++){
  const len=Math.hypot(poly[i].x-poly[i-1].x,poly[i].z-poly[i-1].z);
  distances.push(len);total+=len;
 }
 if(total<1e-8)return poly[0];
 let remaining=total/2;
 for(let i=1;i<poly.length;i++){
  const len=distances[i-1];
  if(remaining<=len){
   const u=remaining/len;
   return {x:poly[i-1].x+(poly[i].x-poly[i-1].x)*u,
           z:poly[i-1].z+(poly[i].z-poly[i-1].z)*u};
  }
  remaining-=len;
 }
 return poly[poly.length-1];
}

function clipLine(a,b,extent=49.4){
 const dx=b.x-a.x,dz=b.z-a.z;
 let lower=0,upper=1;
 for(const [p,q] of [
  [-dx,a.x+extent],[dx,extent-a.x],[-dz,a.z+extent],[dz,extent-a.z]
 ]){
  if(Math.abs(p)<1e-12){if(q<0)return null;continue}
  const t=q/p;
  if(p<0)lower=Math.max(lower,t);else upper=Math.min(upper,t);
  if(lower>upper)return null;
 }
 return [{x:a.x+lower*dx,z:a.z+lower*dz},
         {x:a.x+upper*dx,z:a.z+upper*dz}];
}
function walksFromOSMWays(elements){
 const routes=[];
 for(const item of elements){
  const tags=item.tags||{};
  if(item.type!=='way'||!['footway','path','pedestrian','living_street'].includes(tags.highway)||ignored(tags))continue;
  if(tags.area==='yes'||tags.tunnel==='yes'||tags.access==='private')continue;
  const geometry=item.geometry;
  if(!Array.isArray(geometry)||geometry.length<2)continue;
  const points=geometry.map(p=>wgs84ToLocal(p.lat,p.lon));
  let curr=[];
  const push=()=>{
   if(curr.length>=2){
    const length=curr.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-curr[i].x,p.z-curr[i].z),0);
    if(length>=5)routes.push({id:'way/'+item.id,points:curr,length,source:'osm'});
   }
   curr=[];
  };
  for(let i=1;i<points.length;i++){
   const clipped=clipLine(points[i-1],points[i]);
   if(!clipped){push();continue}
   const [a,b]=clipped;
   if(curr.length&&Math.hypot(curr[curr.length-1].x-a.x,curr[curr.length-1].z-a.z)>.1)push();
   if(!curr.length)curr.push(a);
   if(Math.hypot(b.x-a.x,b.z-a.z)>.1)curr.push(b);
  }
  push();
 }
 routes.sort((a,b)=>b.length-a.length);
 return routes.slice(0,12);
}

export function parseOverpass(data){
 if(!Array.isArray(data?.elements))throw Error('Réponse OSM sans tableau elements');
 if(data.remark&&/error|timeout|too many|rate limit/i.test(data.remark))throw Error('Overpass: '+data.remark);
 const features=[],seen=new Set();
 const walkPaths=walksFromOSMWays(data.elements);
 for(const element of data.elements){
  const t=element.tags||{},type=category(t);
  if(!type||ignored(t)||!['node','way'].includes(element.type))continue;
  const key=element.type+'/'+element.id;
  if(seen.has(key))continue;seen.add(key);
  const root={
   id:key,osmType:element.type,osmId:element.id,type,
   label:TYPE_NAMES[type],tags:t,
   name:typeof t.name==='string'?t.name:null,
   sourceURL:'https://www.openstreetmap.org/'+element.type+'/'+element.id,
   attribution:OSM_CREDIT
  };
  if(element.type==='node'){
   if(!Number.isFinite(element.lat)||!Number.isFinite(element.lon))continue;
   const p=wgs84ToLocal(element.lat,element.lon);
   if(!withinPilot(p))continue;
   features.push({...root,geometry:'point',point:p,locationMethod:'mapped_node'});
  }else if(Array.isArray(element.geometry)){
   const geom=element.geometry;
   if(geom.length<2||geom.some(pt=>!Number.isFinite(pt.lat)||!Number.isFinite(pt.lon)))continue;
   const points=geom.map(g=>wgs84ToLocal(g.lat,g.lon));
   if(points.some(p=>!Number.isFinite(p.x+p.z)))continue;
   const closed=geom.length>=4&&same(geom[0],geom[geom.length-1]);
   if(type==='playground'){
    // A mapped playground polygon is a precise boundary, not a toy location.
    if(!closed)continue;
    const extents={xmin:Math.min(...points.map(p=>p.x)),xmax:Math.max(...points.map(p=>p.x)),
      zmin:Math.min(...points.map(p=>p.z)),zmax:Math.max(...points.map(p=>p.z))};
    if(extents.xmax< -50||extents.xmin>50||extents.zmax< -50||extents.zmin>50)continue;
    features.push({...root,geometry:'polygon',polygon:points,locationMethod:'mapped_polygon'});
   }else if(['slide','swing','climbing','structure','seesaw','springy','roundabout','zipwire','sandpit'].includes(type)){
    // Equipment explicitly mapped as an OSM way/area: draw symbol at a
    // representative point derived from that geometry; never from area outline.
    const point=wayRepresentativePoint(points,closed);
    if(!withinPilot(point))continue;
    features.push({...root,geometry:'point',point,locationMethod:'way_geometry_representative'});
   }
  }
 }
 const counts=Object.fromEntries(CATEGORIES.map(c=>[c.key,0]));
 for(const f of features)counts[f.type]++;
 return {features,counts,walkPaths,osmTimestamp:data.osm3s?.timestamp_osm_base||null};
}
async function getEndpoint(endpoint,query,timeoutMs){
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);
 try{
  const url=endpoint+'?data='+encodeURIComponent(query);
  const res=await fetch(url,{cache:'no-store',mode:'cors',signal:ctrl.signal});
  if(!res.ok)throw Error('HTTP '+res.status);
  const data=await res.json();
  if(data.remark&&/runtime error|timeout|memory|rate limit/i.test(data.remark))throw Error(data.remark);
  return {...parseOverpass(data),endpoint,requestURL:url};
 }finally{clearTimeout(timer)}
}
export async function fetchFurniture(onStatus=()=>{}){
 const query=overpassQuery(),issues=[];
 for(let i=0;i<ENDPOINTS.length;i++){
  const endpoint=ENDPOINTS[i];
  try{
   onStatus('Mobilier OSM : vérification source '+(i+1)+'/'+ENDPOINTS.length);
   const parsed=await getEndpoint(endpoint,query,11000);
   return {...parsed,status:'verified',checkedAt:new Date().toISOString(),errors:issues};
  }catch(err){issues.push(endpoint+' : '+String(err.message||err))}
 }
 return {features:[],counts:null,walkPaths:[],status:'unavailable',endpoint:null,requestURL:null,
   checkedAt:new Date().toISOString(),osmTimestamp:null,errors:issues};
}
