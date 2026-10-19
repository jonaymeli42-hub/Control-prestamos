(function(root){
 'use strict';
 const IN='Sueldo → Préstamos',OUT='Préstamos → Sueldo',RETURN='Devolución del sueldo',SAVE='Ahorro nuevo del sueldo';
 function isTransfer(row){return !!row&&[IN,OUT,RETURN,SAVE].includes(row.type);}
 function valid(row){return isTransfer(row)&&row.direction===(row.type===OUT?'out':'in')&&Number.isFinite(row.amount)&&row.amount>0&&Number.isSafeInteger(Math.round(row.amount*100))&&/^\d{4}-\d{2}-\d{2}$/.test(row.date||'')&&Number.isFinite(Date.parse(row.date+'T12:00:00Z'))&&new Date(row.date+'T12:00:00Z').toISOString().slice(0,10)===row.date;}
 function ordered(rows){return rows.map((row,index)=>({row,index})).filter(({row})=>valid(row)&&!['Pendiente','Programado'].includes(row.status)).sort((a,b)=>a.row.date.localeCompare(b.row.date)||(a.row.createdAt||'').localeCompare(b.row.createdAt||'')||b.index-a.index).map(({row})=>row);}
 function reconcile(rows){
  let pending=0;const allocations=[];
  for(const row of ordered(rows)){
   const amount=Math.round(row.amount*100);let returned=0,saved=0,withdrawn=0;
   if(row.type===OUT){pending+=amount;withdrawn=amount;}
   else if(row.type===SAVE)saved=amount;
   else{returned=Math.min(pending,amount);pending-=returned;saved=amount-returned;}
   allocations.push({id:row.id,date:row.date,returned:returned/100,saved:saved/100,withdrawn:withdrawn/100,pending:pending/100});
  }
  return {pending:pending/100,allocations};
 }
 function monthly(rows,month){
  const items=ordered(rows).filter(row=>row.date.slice(0,7)===month);
  let received=0,returned=0;for(const row of items){if(row.type!==OUT)received+=Math.round(row.amount*100);else returned+=Math.round(row.amount*100);}
  const calculated=reconcile(rows),period=calculated.allocations.filter(row=>row.date.slice(0,7)===month);
  const last=calculated.allocations.filter(row=>row.date.slice(0,7)<=month).at(-1);
  const sum=key=>period.reduce((total,row)=>total+Math.round(row[key]*100),0)/100;
  return {received:received/100,returned:returned/100,net:(received-returned)/100,items,repaid:sum('returned'),saved:sum('saved'),pending:last?.pending||0};
 }
 function allocationText(allocation,format){if(!allocation||allocation.withdrawn)return '';return [allocation.returned?`Devolución: ${format(allocation.returned)}`:'',allocation.saved?`Ahorro nuevo: ${format(allocation.saved)}`:''].filter(Boolean).join(' · ');}
 const api={IN,OUT,RETURN,SAVE,isTransfer,valid,monthly,reconcile,allocationText};if(typeof module==='object'&&module.exports)module.exports=api;else root.SalarySavings=api;
})(typeof window==='object'?window:globalThis);
