(function(root){
 'use strict';
 const cents=value=>Math.max(0,Math.round((Number(value)||0)*100));
 const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
 function build(financings,today,model,payments=[]){
  const rows=[],paymentsByFinancing=new Map();
  for(const payment of payments){if(!payment||typeof payment.financingId!=='string')continue;const list=paymentsByFinancing.get(payment.financingId)||[];list.push(payment);paymentsByFinancing.set(payment.financingId,list);}
  for(const f of financings){
   if(f.received===false)continue;
   const monthly=model.isMonthly(f),dues=monthly?model.schedule(f):[{date:f.nextPaymentDate||'',remaining:Math.max(0,(Number(f.totalToRepay)||0)-(Number(f.paid)||0)),amount:f.totalToRepay,paid:f.paid}];
   for(const due of dues){
    const remaining=cents(due.remaining),paid=cents(due.paid),original=cents(due.amount);
    if(!remaining&&(!monthly||!paid))continue;
    rows.push({kind:'due',financingId:f.id,label:f.card||'Financiación',date:validDate(due.date)?due.date:'',number:due.number||null,count:monthly?f.monthCount:null,amount:remaining/100,originalAmount:original/100,paidAmount:paid/100,interest:due.interest,capital:due.capital});
   }
   if(!monthly)for(const payment of paymentsByFinancing.get(f.id)||[]){
    const amount=cents(payment.amount);if(!amount||!validDate(payment.date))continue;
    rows.push({kind:'payment',financingId:f.id,label:f.card||payment.card||'Financiación',date:payment.date,number:null,count:null,amount:0,originalAmount:amount/100,paidAmount:amount/100,paid:amount/100,note:payment.note||''});
   }
  }
  rows.sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||(a.kind==='payment'?1:0)-(b.kind==='payment'?1:0)||a.label.localeCompare(b.label));
  const groups=new Map();for(const row of rows){if(!row.date)continue;const month=row.date.slice(0,7);if(!groups.has(month))groups.set(month,{month,items:[],total:0});const g=groups.get(month);g.items.push(row);g.total+=cents(row.amount);}
  const months=[...groups.values()].map(g=>({...g,total:g.total/100}));
  const sum=items=>items.reduce((total,row)=>total+cents(row.amount),0)/100;
  return {months,rows,total:sum(rows),overdue:rows.filter(row=>row.kind==='due'&&row.amount>0&&row.date&&row.date.slice(0,7)<today.slice(0,7)),undated:rows.filter(row=>row.kind==='due'&&!row.date&&row.amount>0)};
 }
 const api={build};if(typeof module==='object'&&module.exports)module.exports=api;else root.FinancingOverview=api;
})(typeof window==='object'?window:globalThis);
