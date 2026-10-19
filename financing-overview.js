(function(root){
 'use strict';
 const cents=value=>Math.max(0,Math.round((Number(value)||0)*100));
 const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
 function build(financings,today,model){
  const rows=[];
  for(const f of financings){
   if(f.received===false)continue;
   const dues=model.isMonthly(f)?model.schedule(f):[{date:f.nextPaymentDate||'',remaining:Math.max(0,(Number(f.totalToRepay)||0)-(Number(f.paid)||0)),amount:f.totalToRepay,paid:f.paid}];
   for(const due of dues){const amount=cents(due.remaining);if(!amount)continue;rows.push({financingId:f.id,label:f.card||'Financiación',date:validDate(due.date)?due.date:'',number:due.number||null,count:model.isMonthly(f)?f.monthCount:null,amount:amount/100,originalAmount:Number(due.amount)||amount/100,paid:Number(due.paid)||0,interest:due.interest,capital:due.capital});}
  }
  rows.sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||a.label.localeCompare(b.label));
  const groups=new Map();for(const row of rows){const month=row.date.slice(0,7);if(!groups.has(month))groups.set(month,{month,items:[],total:0});const g=groups.get(month);g.items.push(row);g.total+=cents(row.amount);}
  const months=[...groups.values()].map(g=>({...g,total:g.total/100}));
  const sum=items=>items.reduce((total,row)=>total+cents(row.amount),0)/100;
  return {months,rows,total:sum(rows),overdue:rows.filter(row=>row.date&&row.date.slice(0,7)<today.slice(0,7)),undated:rows.filter(row=>!row.date)};
 }
 const api={build};if(typeof module==='object'&&module.exports)module.exports=api;else root.FinancingOverview=api;
})(typeof window==='object'?window:globalThis);
