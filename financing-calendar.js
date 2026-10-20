/* Calendar dates represent obligations. Cash movements retain actual payment dates. */
(function(root){
 const cents=n=>Math.max(0,Math.round((Number(n)||0)*100));
 const valid=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
 function build(financings,payments,model){
  const events=[],coveredFinancingIds=new Set();
  for(const f of financings){
   if(f.received===false)continue;
   const rows=model.isMonthly(f)?model.schedule(f):[{date:f.nextPaymentDate,amount:f.totalToRepay,remaining:Math.max(0,Number(f.totalToRepay||0)-Number(f.paid||0)),paid:f.paid}];
   const dues=rows.filter(r=>valid(r.date)&&cents(r.amount)>0);if(!dues.length)continue;coveredFinancingIds.add(f.id);
   const actual=payments.filter(p=>p.financingId===f.id).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.createdAt||'').localeCompare(String(b.createdAt||''))).map(p=>({...p,left:cents(p.amount)}));
   let legacy=cents(f.legacyPaid??Math.max(0,Number(f.paid||0)-actual.reduce((s,p)=>s+Number(p.amount||0),0)));
   for(const row of dues){
    let capacity=cents(row.paid),prior=Math.min(capacity,legacy);capacity-=prior;legacy-=prior;const applied=[];
    for(const p of actual){const used=Math.min(capacity,p.left);if(used){applied.push({id:p.id,date:p.date,amount:used/100});p.left-=used;capacity-=used;}if(!capacity)break;}
    const remaining=cents(row.remaining),paid=cents(row.paid);
    events.push({id:model.isMonthly(f)?`${f.id}::${row.number}`:f.id,kind:'card-payment',date:row.date,amount:remaining?remaining/100:cents(row.amount)/100,originalAmount:cents(row.amount)/100,paidAmount:paid/100,remaining:remaining/100,status:remaining===0?'Pagada':paid>0?'Parcial':'Pendiente',label:model.isMonthly(f)?`Pago de financiación · mes ${row.number}`:'Pago de tarjeta',detail:`${f.card} · ${model.isInstallments(f)?'cuotas normales':model.isMonthly(f)?'interés mensual + capital final':'vencimiento de financiación'}`,paymentDetails:applied,legacyPaid:prior/100});
   }
  }
  return {events,coveredFinancingIds};
 }
 const api={build};if(typeof module==='object'&&module.exports)module.exports=api;else root.FinancingCalendar=api;
})(typeof window==='object'?window:globalThis);
