/**
 * Exact, unmodified user-supplied models in personnages_coiffes.zip.
 * Compressed as one gzip binary pack for GitHub Pages.
 * Source GLBs were inspected: Torse, Tete, Cheveux, Bras_G, Bras_D,
 * Jambe_G, Jambe_D; named materials haut, bas, coiffe, peau.
 *
 * Gzip pack: [u32 LE size][GLB bytes] repeated six times in names order.
 * Uncompressed SHA256: 4b095541e49c1861bca42bdfecad77c1ab37fde4974aa3b1f54f044ca4850bc8
 */
import { DATA_A } from './people-data-a.js';
import { DATA_B } from './people-data-b.js';
import { DATA_C7 } from './people-data-c7.js';
import { DATA_C8 } from './people-data-c8.js';
import { DATA_C9 } from './people-data-c9.js';
import { DATA_D } from './people-data-d.js';

export const CHARACTER_FILES=[
 'adulte_bonnet.glb','adulte_casquette.glb','adulte_chapeau.glb',
 'enfant_bonnet.glb','enfant_casquette.glb','enfant_chapeau.glb'
];
export const SOURCE='Fichiers GLB fournis par utilisateur : personnages_coiffes.zip';
const B64=DATA_A+DATA_B+DATA_C7+DATA_C8+DATA_C9+DATA_D;
let cache=null;
export async function originalGlbBuffers(){
 if(cache)return cache;
 cache=(async()=>{
  if(B64.length!==9368)throw Error('Archive des personnages incomplète : '+B64.length);
  if(typeof DecompressionStream==='undefined')throw Error('Navigateur non compatible avec la décompression gzip');
  const zipped=Uint8Array.from(atob(B64),char=>char.charCodeAt(0));
  const stream=new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip'));
  const decoded=await new Response(stream).arrayBuffer();
  if(decoded.byteLength!==100680)throw Error('Archive des personnages : taille inattendue');
  const view=new DataView(decoded),files={};
  let offset=0;
  for(const filename of CHARACTER_FILES){
   const size=view.getUint32(offset,true);offset+=4;
   if(size<100||offset+size>decoded.byteLength)throw Error('GLB tronqué : '+filename);
   const ab=decoded.slice(offset,offset+size);offset+=size;
   const h=new DataView(ab);
   if(h.getUint32(0,true)!==0x46546c67 || h.getUint32(4,true)!==2 || h.getUint32(8,true)!==size)
    throw Error('Fichier GLB invalide : '+filename);
   files[filename]=ab;
  }
  if(offset!==decoded.byteLength)throw Error('Archive : octets non lus');
  return files;
 })().catch(e=>{cache=null;throw e});
 return cache;
}
