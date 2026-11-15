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
export const PILOT_BBOX={south:46.31058861,west:7.47740560,north:46.31148774,east:7.47870438};
export const CATEGORIES=[
 {key:'bench',label:'Bancs',emoji:'🪑'},
 {key:'playground',label:'Aires de jeux',emoji:'🛝'},
 {key:'slide',label:'Toboggans',emoji:'🛝'},
 {key:'swing',label:'Balançoires',emoji:'🎠'},
 {key:'climbing',label:'Jeux à grimper',emoji:'🧗'},
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
 ');out body geom;';
}
export const ENDPOINTS=[
 'https://overpass.osm.ch/api/interpreter',
 'https://overpass.kumi.systems/api/interpreter',
 'https://overpass-api.de/api/interpreter'
];
function category(tags){
 if(tags.playground==='slide')return 'slide';
 if(tags.playground==='swing')return 'swing';
 if(['climbingframe','climbing_frame','climbingwall','climbing_wall'].includes(tags.playground))return 'climbing';
 if(tags.amenity==='bench')return 'bench';
 if(tags.amenity==='waste_basket')return 'waste';
 if(tags.amenity==='fountain')return 'fountain';
 if(tags.amenity==='drinking_water')return 'water';
 if(tags.amenity==='bicycle_parking')return 'bicycle';
 if(tags.highway==='street_lamp')return 'lamp';
 if(tags.highway==='bus_stop'||tags.public_transport==='platform')return 'bus';
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
export function parseOverpass(data){
 if(!Array.isArray(data?.elements))throw Error('Réponse OSM sans tableau elements');
 if(data.remark&&/error|timeout|too many|rate limit/i.test(data.remark))throw Error('Overpass: '+data.remark);
 const features=[],seen=new Set();
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
   features.push({...root,geometry:'point',point:p});
  }else if(type==='playground'&&Array.isArray(element.geometry)){
   // Ways are accepted only as real closed polygon boundaries. No centroid
   // is used as a fabricated equipment point.
   const geom=element.geometry;
   if(geom.length<4||!same(geom[0],geom[geom.length-1]))continue;
   const polygon=geom.map(g=>wgs84ToLocal(g.lat,g.lon));
   if(polygon.some(p=>!Number.isFinite(p.x+p.z)))continue;
   const extents={xmin:Math.min(...polygon.map(p=>p.x)),xmax:Math.max(...polygon.map(p=>p.x)),
     zmin:Math.min(...polygon.map(p=>p.z)),zmax:Math.max(...polygon.map(p=>p.z))};
   if(extents.xmax< -50||extents.xmin>50||extents.zmax< -50||extents.zmin>50)continue;
   features.push({...root,geometry:'polygon',polygon});
  }
 }
 const counts=Object.fromEntries(CATEGORIES.map(c=>[c.key,0]));
 for(const f of features)counts[f.type]++;
 return {features,counts,osmTimestamp:data.osm3s?.timestamp_osm_base||null};
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
 return {features:[],counts:null,status:'unavailable',endpoint:null,requestURL:null,
   checkedAt:new Date().toISOString(),osmTimestamp:null,errors:issues};
}
