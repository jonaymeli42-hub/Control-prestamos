/* Read-only monthly cash flows; actual payments use their real dates. */
(function(root){
 const cents=n=>Math.max(0,Math.round((Number(n)||0)*100));
 const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
 function build(data,month,financingOverview,model){
  const rows=[];let undated=0;
  const add=(kind,state,date,amount,label)=>{const value=cents(amount);if(!value)return;if(!validDate(date)){undated+=value;return;}if(date.slice(0,7)===month)rows.push({kind,state,date,amount:value/100,label});};
  const loans=new Map((data.loans||[]).map(l=>[l.id,l]));
  for(const c of data.collections||[]){const l=loans.get(c.loanId);add('collections','actual',c.date,c.amount,l?`${l.code} · ${l.person}`:'Cobro de préstamo');}
  for(const i of data.installments||[]){const l=loans.get(i.loanId);if(l&&l.disbursed!==false)add('collections','pending',i.dueDate,Math.max(0,Number(i.amount||0)-Number(i.paid||0)),`${l.code} · ${l.person} · Cuota ${i.number}`);}
  for(const p of data.cardPayments||[])add('financing','actual',p.date,p.amount,p.card||'Pago de financiación');
  for(const r of financingOverview.build(data.cardFinancings||[],month+'-01',model).rows)add('financing','pending',r.date,r.amount,`${r.label}${r.number?' · Cuota '+r.number:''}`);
  for(const m of data.movements||[]){if(m.loanId&&['Préstamo dado','Préstamo entregado'].includes(m.type))add('lent',['Pendiente','Programado'].includes(m.status)?'pending':'actual',(['Pendiente','Programado'].includes(m.status)?m.scheduledDate||m.date:m.date),m.amount,m.person||m.description||'Préstamo dado');}
  const total=(kind,state)=>rows.filter(r=>r.kind===kind&&r.state===state).reduce((n,r)=>n+cents(r.amount),0)/100;
  const totals={};for(const kind of ['collections','financing','lent'])totals[kind]={actual:total(kind,'actual'),pending:total(kind,'pending')};
  return {rows:rows.sort((a,b)=>a.date.localeCompare(b.date)||a.label.localeCompare(b.label)),totals,actualDifference:(Math.round(totals.collections.actual*100)-Math.round(totals.financing.actual*100))/100,projectedDifference:(Math.round((totals.collections.actual+totals.collections.pending)*100)-Math.round((totals.financing.actual+totals.financing.pending)*100))/100,undated:undated/100};
 }
 const api={build};if(typeof module==='object'&&module.exports)module.exports=api;else root.MonthlySummary=api;
})(typeof window==='object'?window:globalThis);
