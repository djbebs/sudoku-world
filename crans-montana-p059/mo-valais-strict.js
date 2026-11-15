/* Ycoor P0.5.9: ONLY official cadastral vector features from Etat du Valais.
 * Screen recordings, orthophotos, OSM features and guessed geometries are
 * strictly forbidden as coordinate sources. LV95 EPSG:2056, metres.
 * The web visualization is not a legally certified survey extract.
 */
export const MO_SERVICE='https://sit.vs.ch/arcgis/rest/services/MO/MapServer';
export const ORIGIN={e:2603036,n:1128849};
export const BBOX=[2602986,1128799,2603086,1128899];
export const LAYERS=[
 {id:270,name:'Surfaces de couverture du sol',geom:'rings',render:true},
 {id:180,name:'Objets divers linéaires',geom:'paths',render:true},
 {id:190,name:'Objets divers surfaciques',geom:'rings',render:true},
 {id:260,name:'Bâtiments cadastraux (contrôle)',geom:'rings',render:false}
];
export const TYPES={
 270:{
 '6':['route','Route / chemin','#77736a'],
 '7':['trottoir','Trottoir','#d2c3a3'],
 '11':['bassin','Bassin','#6c9aa9'],
 '12':['dur','Autre revêtement dur','#ada48d'],
 '13':['prairie','Champ / pré / pâturage','#80a16d'],
 '14':['prairie','Champ / pré / pâturage','#80a16d'],
 '17':['jardin','Jardin','#769969'],
 '19':['vert','Autre surface verte','#8a9e6e'],
 '20':['eau','Eau stagnante','#6696ac'],
 '21':['ruisseau',"Cours d'eau",'#699ba9'],
 '29':['sable','Éboulis / sable','#c4b18d'],
 '31':['nu','Autre sans végétation','#ada78c']},
 180:{
 '4':['escalier','Escalier important','#d2c1a7',1.1],
 '6':['pont','Pont / passerelle','#ac916c',1.4],
 '26':['sentier','Sentier','#dac8a1',1.1]},
 190:{
 '4':['escalier','Escalier important','#d2c1a7'],
 '6':['pont','Pont / passerelle','#ad936d'],
 '7':['quai','Quai','#c8b596'],
 '8':['fontaine','Fontaine','#75a3b1'],
 '26':['sentier','Sentier','#dac8a1']}
};
function valid(pair){return Array.isArray(pair)&&pair.length>=2&&Number.isFinite(pair[0])&&Number.isFinite(pair[1])}
function lv95(p){return {x:p[0]-ORIGIN.e,z:ORIGIN.n-p[1]}}
function localGeometry(feature,layer){
 const raw=feature.geometry?.[layer.geom];
 if(!Array.isArray(raw))return null;
 const parts=raw.filter(a=>Array.isArray(a)&&a.length>=(layer.geom==='rings'?4:2)&&a.every(valid))
   .map(a=>a.map(lv95));
 if(!parts.length)return null;
 return layer.geom==='rings'?{rings:parts}:{paths:parts};
}
export function parseLayer(data,layer){
 if(data?.error)throw Error('ArcGIS '+layer.id+': '+String(data.error.message||'API error'));
 if(!Array.isArray(data?.features))throw Error('ArcGIS '+layer.id+': réponse sans tableau features');
 if(data.exceededTransferLimit||data.features.length>=2000)
  throw Error('ArcGIS '+layer.id+': résultat tronqué, valeur non confirmée');
 const byGenre={},shapes=[];
 for(const item of data.features){
  const a=item.attributes||{},code=String(a.GENRE??'').trim();
  const group=byGenre[code]??(byGenre[code]={label:a.GENRE_FR||'Autre',count:0,objectIDs:[]});
  group.count++;
  if(a.OBJECTID!=null)group.objectIDs.push(a.OBJECTID);
  if(!layer.render||!TYPES[layer.id]?.[code])continue;
  const geometry=localGeometry(item,layer);
  if(!geometry)continue;
  const [kind,label,color,displayWidth]=TYPES[layer.id][code];
  shapes.push({layer:layer.id,objectID:a.OBJECTID??null,gid:a.GID??null,
   genre:code,kind,label,color,displayWidth:displayWidth||null,
   geometry,source:MO_SERVICE+'/'+layer.id});
 }
 return {layer:layer.id,name:layer.name,status:'verified',
  total:data.features.length,byGenre,shapes,error:null};
}
export function queryURL(layer){
 const params=new URLSearchParams({
  where:'1=1',geometry:BBOX.join(','),geometryType:'esriGeometryEnvelope',
  spatialRel:'esriSpatialRelIntersects',inSR:'2056',outSR:'2056',
  outFields:'OBJECTID,GID,GENRE,GENRE_FR',
  returnGeometry:layer.render?'true':'false',
  resultRecordCount:'2000',f:'json'
 });
 return MO_SERVICE+'/'+layer.id+'/query?'+params.toString();
}
export async function loadLayer(layer){
 const url=queryURL(layer),ctrl=new AbortController();
 const timer=setTimeout(()=>ctrl.abort(),16000);
 try{
  const r=await fetch(url,{signal:ctrl.signal,mode:'cors',cache:'no-store'});
  if(!r.ok)throw Error('HTTP '+r.status);
  return {...parseLayer(await r.json(),layer),url};
 }catch(e){
  return {layer:layer.id,name:layer.name,status:'unavailable',total:null,
   byGenre:{},shapes:[],error:String(e.message||e),url};
 }finally{clearTimeout(timer)}
}
export async function loadAll(onStatus=()=>{}){
 onStatus('Données officielles du Valais : 4 couches en cours…');
 const results=await Promise.all(LAYERS.map(loadLayer));
 const good=results.filter(r=>r.status==='verified');
 const state=good.length===4?'verified':good.length?'partial':'unavailable';
 onStatus(good.length+'/4 couches cadastrales disponibles');
 return {results,state,checkedAt:new Date().toISOString(),source:MO_SERVICE,
  shapes:good.flatMap(r=>r.shapes),
  note:'Données cadastrales officielles, rendu pixel-art non certifié juridiquement.'};
}
