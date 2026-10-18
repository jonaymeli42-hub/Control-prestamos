(function(root){
 'use strict';
 const IN='Sueldo → Préstamos',OUT='Préstamos → Sueldo';
 function isTransfer(row){return !!row&&[IN,OUT].includes(row.type);}
 function valid(row){return isTransfer(row)&&row.direction===(row.type===IN?'in':'out')&&Number.isFinite(row.amount)&&row.amount>0&&Number.isSafeInteger(Math.round(row.amount*100))&&/^\d{4}-\d{2}-\d{2}$/.test(row.date||'')&&Number.isFinite(Date.parse(row.date+'T12:00:00Z'))&&new Date(row.date+'T12:00:00Z').toISOString().slice(0,10)===row.date;}
 function monthly(rows,month){
  const items=rows.filter(row=>valid(row)&&row.date.slice(0,7)===month&&!['Pendiente','Programado'].includes(row.status)).slice().sort((a,b)=>a.date.localeCompare(b.date)||(a.createdAt||'').localeCompare(b.createdAt||'')||a.id.localeCompare(b.id));
  let received=0,returned=0;for(const row of items){if(row.type===IN)received+=Math.round(row.amount*100);else returned+=Math.round(row.amount*100);}
  return {received:received/100,returned:returned/100,net:(received-returned)/100,items};
 }
 const api={IN,OUT,isTransfer,valid,monthly};if(typeof module==='object'&&module.exports)module.exports=api;else root.SalarySavings=api;
})(typeof window==='object'?window:globalThis);
