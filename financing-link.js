/* Only explicitly linked financing records cross app boundaries. No cloud credentials are shared. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FinancingLink=api;})(globalThis,()=>{
 'use strict';
 const SOURCE='control-prestamos-data',TARGET='tarjetas_app_v3';
 const key=id=>'financing:'+id;
 const date=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(value+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;};
 const month=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value);
 const validLink=l=>!!l&&l.version===1&&typeof l.card==='string'&&l.card.trim().length>0&&date(l.date)&&month(l.month);
 const validCards=s=>!!s&&Array.isArray(s.cards)&&s.cards.every(c=>c&&typeof c.name==='string')&&Array.isArray(s.onePayments)&&Array.isArray(s.expenses)&&Array.isArray(s.onePaymentCategories);
 const validSource=s=>!!s&&Array.isArray(s.cardFinancings)&&(s.cardLinkRemovals===undefined||Array.isArray(s.cardLinkRemovals)&&s.cardLinkRemovals.every(id=>typeof id==='string'));
 function expected(f){if(!validLink(f.cardLink)||f.repaymentMode!=='single'||!Number.isFinite(f.totalToRepay)||f.totalToRepay<=0||typeof f.id!=='string')throw Error('Vínculo de financiación inválido.');return {id:key(f.id),financingId:f.id,linkOrigin:'control-prestamos-v1',description:'Financiación para préstamos · '+f.card,amount:Math.round(f.totalToRepay*100)/100,date:f.cardLink.date,month:f.cardLink.month,card:f.cardLink.card,category:'Préstamos',responsible:'Préstamos'};}
 const linked=row=>row?.linkOrigin==='control-prestamos-v1'&&typeof row.financingId==='string'&&row.id===key(row.financingId);
 function same(row,want){return Object.keys(want).every(k=>row?.[k]===want[k]);}
 function status(storage,f){try{const want=expected(f),s=JSON.parse(storage.getItem(TARGET));if(!validCards(s))return 'Pendiente: abrí Control Tarjetas en este navegador con tus datos.';const rows=s.onePayments.filter(r=>r.id===want.id);return rows.length===1&&same(rows[0],want)?'Registrado en Tarjetas · 1 pago':'Pendiente de registrar o actualizar en Tarjetas.';}catch{return 'Pendiente: no se pudo comprobar Tarjetas.';}}
 function markBackup(storage){const k='private-drive-backup:tarjetas';const raw=storage.getItem(k);const state=raw===null?{}:JSON.parse(raw);if(!state||typeof state!=='object'||Array.isArray(state))throw Error('Estado de respaldo inválido');storage.setItem(k,JSON.stringify({...state,pending:true,revision:(Number(state.revision)||0)+1}));}
 function reconcile(storage){
  const result={changed:false,backupPending:false,pending:[],error:''};
  try{
   const source=JSON.parse(storage.getItem(SOURCE));if(!source)return result;if(!validSource(source))throw Error('No se pudo leer la financiación; no se modificó Tarjetas.');
   const active=source.cardFinancings.filter(f=>f.cardLink);const removals=source.cardLinkRemovals||[];
   if(!active.length&&!removals.length)return result;
   const original=storage.getItem(TARGET),s=JSON.parse(original);if(!validCards(s)){result.pending=active.map(f=>f.id);result.error='Abrí Control Tarjetas en este navegador con tus datos. No se creó ni reemplazó su base.';return result;}
   const next=structuredClone(s);
   for(const f of active){
    let want;try{want=expected(f);}catch{result.pending.push(f.id);continue;}
    if(!s.cards.some(c=>c.name===want.card)){result.pending.push(f.id);continue;}
    const matches=next.onePayments.filter(row=>row.id===want.id);
    if(matches.length>1||matches.some(row=>!linked(row))){result.pending.push(f.id);continue;}
    const row=matches[0];
    if(!row)next.onePayments.push({...want,createdAt:f.createdAt||new Date().toISOString()});
    else Object.assign(row,want);
    if(!next.onePaymentCategories.includes('Préstamos'))next.onePaymentCategories.push('Préstamos');
   }
   const activeIds=new Set(active.map(f=>f.id));
   next.onePayments=next.onePayments.filter(row=>!(linked(row)&&removals.includes(row.financingId)&&!activeIds.has(row.financingId)));
   const serialized=JSON.stringify(next);
   if(serialized!==original){
    // No awaited operation between read/check/write: never overwrite a known newer target.
    if(storage.getItem(TARGET)!==original)throw Error('Tarjetas cambió. Reintentá la vinculación.');
    storage.setItem(TARGET,serialized);result.changed=true;
   }
   // Retry the backup marker even after a previous quota failure: the finance remains durable.
   markBackup(storage);result.backupPending=true;
  }catch(error){result.error=error.message||'No se pudo completar el registro en Tarjetas.';}
  return result;
 }
 return {SOURCE,TARGET,key,validLink,validCards,validSource,expected,linked,status,reconcile};
});
