/* Read-only monthly cash flows; actual payments use their real dates. */
(function(root){
 const cents=n=>Math.max(0,Math.round((Number(n)||0)*100));
 const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
 function projectionHistory(data,today,cancellation,salary){
  if(!validDate(today))return [];
  const active=cancellation.activeData(data),currentMonth=today.slice(0,7),dates=[];
  const actualMovements=(active.movements||[]).filter(row=>!['Pendiente','Programado'].includes(row.status)&&validDate(row.date));
  for(const row of actualMovements)dates.push(row.date);
  for(const key of ['collections','loans','installments','cardFinancings','cardPayments','futureHistory'])for(const row of data[key]||[]){const date=key==='loans'?row.deliveryDate:key==='installments'?row.dueDate:key==='cardFinancings'?row.receivedDate:key==='cardPayments'||key==='collections'||key==='futureHistory'?row.date:'';if(validDate(date))dates.push(date);}
  const previous=new Date(Number(currentMonth.slice(0,4)),Number(currentMonth.slice(5,7))-2,1),last=previous.getFullYear()*12+previous.getMonth();
  const past=dates.filter(date=>date.slice(0,7)<currentMonth).map(date=>Number(date.slice(0,4))*12+Number(date.slice(5,7))-1);
  if(!past.length)return [];
  const first=Math.min(...past),loanMap=new Map((active.loans||[]).map(loan=>[loan.id,loan]));
  const records=(data.cardFinancings||[]).filter(item=>item.received!==false),paymentsByFinancing=new Map(),collectionsByInstallment=new Map();
  for(const payment of data.cardPayments||[]){const items=paymentsByFinancing.get(payment.financingId)||[];items.push(payment);paymentsByFinancing.set(payment.financingId,items);}
  for(const collection of active.collections||[]){const items=collectionsByInstallment.get(collection.installmentId)||[];items.push(collection);collectionsByInstallment.set(collection.installmentId,items);}
  const periods=[];
  for(let serial=first;serial<=last;serial++){
   const year=Math.floor(serial/12),month=serial%12,start=new Date(year,month,1),end=new Date(year,month+1,0),endDate=`${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`;
   const movements=actualMovements.filter(row=>row.date<=endDate),cashCents=Math.round((Number(data.settings?.initialBalance)||0)*100)+movements.reduce((sum,row)=>sum+(row.direction==='in'?cents(row.amount):-cents(row.amount)),0);
   let receivableCents=0;
   for(const installment of active.installments||[]){
    const loan=loanMap.get(installment.loanId);if(!loan||loan.disbursed===false||(validDate(loan.deliveryDate)&&loan.deliveryDate>endDate))continue;
    const baseline=validDate(installment.dueDate)&&installment.dueDate<=endDate?cents(installment.paidBeforeApp):0;
    const collected=(collectionsByInstallment.get(installment.id)||[]).filter(row=>validDate(row.date)&&row.date<=endDate).reduce((sum,row)=>sum+cents(row.amount),0);
    receivableCents+=Math.max(0,cents(installment.amount)-Math.min(cents(installment.amount),baseline+collected));
   }
   let debtCents=0;
   for(const financing of records){
    if(!validDate(financing.receivedDate)||financing.receivedDate>endDate)continue;
    const payments=paymentsByFinancing.get(financing.id)||[],paidByDate=payments.filter(row=>validDate(row.date)&&row.date<=endDate).reduce((sum,row)=>sum+cents(row.amount),0),paymentTotal=payments.reduce((sum,row)=>sum+cents(row.amount),0),legacyPaid=cents(financing.legacyPaid??Math.max(0,(Number(financing.paid)||0)-paymentTotal));
    debtCents+=Math.max(0,cents(financing.totalToRepay)-Math.min(cents(financing.totalToRepay),legacyPaid+paidByDate));
   }
   for(const financing of data.ownFinancings||[]){
    if(!validDate(financing.purchaseDate)||financing.purchaseDate>endDate)continue;
    const total=(financing.installments||[]).reduce((sum,row)=>sum+cents(row.amount),0),paid=(financing.installments||[]).flatMap(row=>row.payments||[]).filter(row=>row.status!=='Anulado'&&validDate(row.date)&&row.date<=endDate).reduce((sum,row)=>sum+cents(row.amount),0);
    debtCents+=Math.max(0,total-Math.min(total,paid));
   }
   const salaryPending=cents(salary.reconcile(movements).pending),availableCents=cashCents+receivableCents+salaryPending-debtCents;
   periods.push({month:`${year}-${String(month+1).padStart(2,'0')}`,label:new Intl.DateTimeFormat('es-AR',{month:'long',year:'numeric'}).format(start).replace(/^./,letter=>letter.toLocaleUpperCase('es-AR')),current:cashCents/100,receivable:receivableCents/100,salaryPending:salaryPending/100,obligations:debtCents/100,available:availableCents/100});
  }
  return periods.reverse();
 }
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
 const api={build,projectionHistory};if(typeof module==='object'&&module.exports)module.exports=api;else root.MonthlySummary=api;
})(typeof window==='object'?window:globalThis);
