/* Explicit, idempotent links between the local Préstamos and Tarjetas stores. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FinancingLink=api;})(globalThis,()=>{
 'use strict';
 const SOURCE='control-prestamos-data',TARGET='tarjetas_app_v3',key=id=>'financing:'+id;
 const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
 const month=value=>typeof value==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(value);
 const validLink=l=>!!l&&l.version===1&&typeof l.card==='string'&&l.card.trim().length>0&&date(l.date)&&month(l.month);
 const validOwnedLink=l=>!!l&&l.version===2&&typeof l.card==='string'&&l.card.trim().length>0&&date(l.date);
 const validCards=s=>!!s&&Array.isArray(s.cards)&&s.cards.every(c=>c&&typeof c.name==='string')&&Array.isArray(s.onePayments)&&Array.isArray(s.expenses)&&Array.isArray(s.onePaymentCategories);
 const validSource=s=>!!s&&Array.isArray(s.cardFinancings)&&Array.isArray(s.ownFinancings||[])&&(s.cardLinkRemovals===undefined||Array.isArray(s.cardLinkRemovals)&&s.cardLinkRemovals.every(id=>typeof id==='string'));
 function expected(f){if(!validLink(f.cardLink)||f.repaymentMode!=='single'||!Number.isFinite(f.totalToRepay)||f.totalToRepay<=0||typeof f.id!=='string')throw Error('Vínculo de financiación inválido.');return {id:key(f.id),financingId:f.id,linkOrigin:'control-prestamos-v1',linkType:'single-payment',description:'Financiación para préstamos · '+f.card,amount:Math.round(f.totalToRepay*100)/100,date:f.cardLink.date,month:f.cardLink.month,card:f.cardLink.card,category:'Préstamos',responsible:'Préstamos'};}
 function expectedOwned(f){if(!validOwnedLink(f.cardLink)||typeof f.id!=='string'||typeof f.description!=='string'||!Array.isArray(f.installments)||f.installments.length!==f.count||!f.installments.length)throw Error('Vínculo de cuotas de financiación inválido.');const rows=f.installments;if(!rows.every(row=>date(row.dueDate)&&Number.isFinite(Number(row.amount))&&Number(row.amount)>0))throw Error('El cronograma vinculado no es válido.');const months=rows.map(row=>row.dueDate.slice(0,7));if(months.some((value,index)=>index&&value<=months[index-1]))throw Error('Los vencimientos deben estar ordenados, uno por mes.');return {id:key(f.id),financingId:f.id,linkOrigin:'control-prestamos-v1',linkType:'installment-financing',description:f.description,card:f.cardLink.card,purchaseDate:f.cardLink.date,monthly:Math.round(Number(rows[0].amount)*100)/100,installments:rows.length,start:months[0],installmentMonths:months,installmentAmounts:rows.map(row=>Math.round(Number(row.amount)*100)/100),installmentDueDates:rows.map(row=>row.dueDate),financedCapital:Math.round(Number(f.capital)*100)/100,interestPercent:Number(f.interestPercent)||0,interestAmount:Math.round(Number(f.interestAmount||0)*100)/100,financingTotal:Math.round(rows.reduce((sum,row)=>sum+Number(row.amount),0)*100)/100,responsible:'Préstamos'};}
 const linked=row=>row?.linkOrigin==='control-prestamos-v1'&&typeof row.financingId==='string'&&row.id===key(row.financingId);
 function same(row,want){return Object.keys(want).every(k=>Array.isArray(want[k])?JSON.stringify(row?.[k])===JSON.stringify(want[k]):row?.[k]===want[k]);}
 function status(storage,f){try{const own=f?.cardLink?.version===2,s=JSON.parse(storage.getItem(TARGET));if(!validCards(s))return 'Pendiente: abrí Control Tarjetas en este navegador con tus datos.';const want=own?expectedOwned(f):expected(f),rows=(own?s.expenses:s.onePayments).filter(r=>r.id===want.id);return rows.length===1&&same(rows[0],want)?`Registrada en Tarjetas · ${own?want.installments+' cuotas':'1 pago'}`:'Pendiente de registrar o actualizar en Tarjetas.';}catch{return 'Pendiente: no se pudo comprobar Tarjetas.';}}
 function markBackup(storage){const k='private-drive-backup:tarjetas',raw=storage.getItem(k),state=raw===null?{}:JSON.parse(raw);if(!state||typeof state!=='object'||Array.isArray(state))throw Error('Estado de respaldo inválido');storage.setItem(k,JSON.stringify({...state,pending:true,revision:(Number(state.revision)||0)+1}));}
 function reconcile(storage){
  const result={changed:false,backupPending:false,pending:[],error:''};
  try{
   const source=JSON.parse(storage.getItem(SOURCE));if(!source)return result;if(!validSource(source))throw Error('No se pudo leer la financiación; no se modificó Tarjetas.');
   const activeSingles=source.cardFinancings.filter(f=>f.cardLink),activeOwned=(source.ownFinancings||[]).filter(f=>f.cardLink),removals=source.cardLinkRemovals||[];
   if(!activeSingles.length&&!activeOwned.length&&!removals.length)return result;
   const original=storage.getItem(TARGET),s=JSON.parse(original);if(!validCards(s)){result.pending=[...activeSingles,...activeOwned].map(f=>f.id);result.error='Abrí Control Tarjetas en este navegador con tus datos. No se creó ni reemplazó su base.';return result;}
   const next=structuredClone(s);
   const upsert=(collection,f,build)=>{let want;try{want=build(f);}catch{result.pending.push(f.id);return;}if(!s.cards.some(c=>c.name===want.card)){result.pending.push(f.id);return;}const matches=collection.filter(row=>row.id===want.id);if(matches.length>1||matches.some(row=>!linked(row))){result.pending.push(f.id);return;}const row=matches[0];if(!row)collection.push({...want,createdAt:f.createdAt||new Date().toISOString()});else Object.assign(row,want);};
   activeSingles.forEach(f=>upsert(next.onePayments,f,expected));
   activeOwned.forEach(f=>upsert(next.expenses,f,expectedOwned));
   if(activeSingles.length&&!next.onePaymentCategories.includes('Préstamos'))next.onePaymentCategories.push('Préstamos');
   const activeIds=new Set([...activeSingles,...activeOwned].map(f=>f.id));
   for(const collection of [next.onePayments,next.expenses])for(let index=collection.length-1;index>=0;index--){const row=collection[index];if(linked(row)&&removals.includes(row.financingId)&&!activeIds.has(row.financingId))collection.splice(index,1);}
   const serialized=JSON.stringify(next);if(serialized!==original){if(storage.getItem(TARGET)!==original)throw Error('Tarjetas cambió. Reintentá la vinculación.');storage.setItem(TARGET,serialized);result.changed=true;}
   markBackup(storage);result.backupPending=true;
  }catch(error){result.error=error.message||'No se pudo completar el registro en Tarjetas.';}
  return result;
 }
 return {SOURCE,TARGET,key,validLink,validOwnedLink,validCards,validSource,expected,expectedOwned,linked,status,reconcile};
});
