(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.CardOptions=api;})(globalThis,()=>{
 'use strict';
 function key(value){return String(value??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/\s+/g,' ').trim().toLocaleLowerCase('es-AR');}
 function unique(names){const seen=new Set();return names.map(value=>String(value??'').trim()).filter(value=>{const normalized=key(value);if(!normalized||seen.has(normalized))return false;seen.add(normalized);return true;});}
 return {key,unique};
});
