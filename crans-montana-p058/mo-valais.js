/* Ycoor P0.5.8
 * Strict source: Etat du Valais, mensuration officielle (MO),
 * public ArcGIS MapServer layers 270 (Couverture du sol surfaces)
 * and 180 (Objets divers - éléments linéaires).
 *
 * Source is official cadastral surveying data. Its *display* in a browser
 * is not a legally certified signed survey extract. Never mix OSM or
 * image-traced coordinates into this module.
 *
 * Native SR: Swiss LV95 EPSG:2056. x=East difference, z=South difference.
 */
export const MO_SOURCE='https://sit.vs.ch/arcgis/rest/services/MO/MapServer';
export const MO_LAYERS={
 surfaces:{id:270,name:'MO - Couverture du sol surfaces'},
 paths:{id:180,name:'MO - Objets divers éléments linéaires'}
};
export const MO_CATEGORIES={
 '6':{kind:'road_path_surface',label:'Route / chemin'},
 '7':{kind:'sidewalk',label:'Trottoir'},
 '11':{kind:'basin',label:'Bassin'},
 '12':{kind:'hard_surface',label:'Autre revêtement dur'},
 '17':{kind:'garden',label:'Jardin'},
 '19':{kind:'green',label:'Autre surface verte'},
 '20':{kind:'water',label:'Eau stagnante'}
};
const isFiniteXY=(p)=>Array.isArray(p)&&p.length>=2&&Number.isFinite(Number(p[0]))&&Number.isFinite(Number(p[1]));
const genre=(a)=>String(a?.GENRE??'').trim();
function toLocal(pt,origin){return {x:Number(pt[0])-origin.e,z:origin.n-Number(pt[1])}}
// ArcGIS intersects the requested 100 m envelope on the server. Do not
// require a source vertex within the square: a polygon may enclose the entire
// pilot, or a long straight segment may cross it with both vertices outside.
function mapGeometry(item,origin,type){
 const a=item.attributes||item.properties||{},code=genre(a);
 if(type==='surfaces'){
  const category=MO_CATEGORIES[code];if(!category)return null;
  const rings=item.geometry?.rings;
  if(!Array.isArray(rings)||!rings.length)return null;
  const validRings=rings.filter(r=>r.length>=4&&r.every(isFiniteXY)).map(r=>r.map(pt=>toLocal(pt,origin)));
  if(!validRings.length)return null;
  return {
   source:'Etat du Valais - mensuration officielle',layer:270,
   id:String(a.GID??a.OBJECTID??''),category:category.kind,label:category.label,
   kind:'polygon',rings:validRings,
   complex:validRings.length!==1,
   evidence:{layer:270,object_id:a.OBJECTID??null,genre:code,genre_fr:a.GENRE_FR??category.label}
  };
 }
 if(type==='paths'){
  // GENRE=26 is "Sentier" in the public layer definition. No other
  // miscellaneous features are mislabelled as a footpath.
  if(code!=='26')return null;
  const paths=item.geometry?.paths;
  if(!Array.isArray(paths))return null;
  const validPaths=paths.filter(p=>p.length>=2&&p.every(isFiniteXY)).map(p=>p.map(pt=>toLocal(pt,origin)));
  if(!validPaths.length)return null;
  return {
   source:'Etat du Valais - mensuration officielle',layer:180,
   id:String(a.GID??a.OBJECTID??''),category:'footpath',label:'Sentier',
   kind:'line',paths:validPaths,
   evidence:{layer:180,object_id:a.OBJECTID??null,genre:code,genre_fr:a.GENRE_FR??'Sentier'}
  };
 }
 return null;
}
export function parseMOResponse(data,origin,type){
 if(data?.error)throw Error('Service MO: '+(data.error.message||'erreur API'));
 if(data?.exceededTransferLimit)throw Error('MO: résultat tronqué. Aucun dessin incomplet autorisé.');
 if(!Array.isArray(data?.features))throw Error('Réponse cadastrale invalide (features absentes)');
 return data.features.map(f=>mapGeometry(f,origin,type)).filter(Boolean);
}
async function queryLayer(id,origin,signal){
 const envelope=[
  origin.e-50,origin.n-50,origin.e+50,origin.n+50
 ].join(',');
 const params=new URLSearchParams({
  where:'1=1',
  geometry:envelope,
  geometryType:'esriGeometryEnvelope',
  spatialRel:'esriSpatialRelIntersects',
  inSR:'2056',outSR:'2056',
  outFields:'OBJECTID,GID,GENRE,GENRE_FR',
  returnGeometry:'true',
  resultRecordCount:'1000',
  f:'json'
 });
 const url=MO_SOURCE+'/'+id+'/query?'+params.toString();
 const response=await fetch(url,{method:'GET',mode:'cors',signal,cache:'no-store'});
 if(!response.ok)throw Error('HTTP '+response.status+' pour couche MO '+id);
 return response.json();
}
export async function fetchMO(origin,{onStatus=()=>{},timeoutMs=14000}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
 const found={surfaces:[],paths:[],errors:[],source:MO_SOURCE,status:'loading',downloadedAt:null};
 try{
  onStatus('Lecture des données cadastrales officielles du Valais…');
  const outcomes=await Promise.allSettled([
   queryLayer(270,origin,controller.signal),
   queryLayer(180,origin,controller.signal)
  ]);
  for(let i=0;i<outcomes.length;i++){
   const key=i===0?'surfaces':'paths',value=outcomes[i];
   if(value.status==='fulfilled'){
    try{found[key]=parseMOResponse(value.value,origin,key)}
    catch(e){found.errors.push(key+' : '+String(e.message||e))}
   }else found.errors.push(key+' : '+String(value.reason?.message||value.reason||'service inaccessible'));
  }
  found.downloadedAt=new Date().toISOString();
  found.status=found.errors.length===2?'unavailable':found.errors.length?'partial':'loaded';
  onStatus(found.status==='unavailable'?'Mensuration officielle indisponible : aucun tracé ajouté':
    'MO Valais : '+found.surfaces.length+' surfaces et '+found.paths.length+' sentiers chargés');
  return found;
 }finally{clearTimeout(timer)}
}
