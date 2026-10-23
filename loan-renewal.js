/* Renewal changes a receivable, never cash or payment records. */
(function(root){
 const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
 const cents=n=>Math.round(Number(n)*100);
 function eligible(loan,installments){return !!loan&&loan.cancelled!==true&&loan.mode==='1 cuota'&&loan.disbursed!==false&&installments.length===1&&installments[0].loanId===loan.id&&Number.isFinite(installments[0].amount)&&Number.isFinite(installments[0].paid)&&cents(installments[0].amount)>cents(installments[0].paid)&&validDate(installments[0].dueDate);}
 function renew(loan,installments,{interest,dueDate,createdAt,note='',renewalId}){
  if(!eligible(loan,installments))throw Error('La renovación está disponible para préstamos entregados de una cuota con saldo pendiente.');
  const row=installments[0],extra=cents(interest),total=cents(row.amount)+extra;
  if(!Number.isFinite(interest)||interest<0||!Number.isSafeInteger(extra)||!Number.isSafeInteger(total)||!validDate(dueDate)||dueDate<=row.dueDate||!renewalId||!Number.isFinite(Date.parse(createdAt)))throw Error('Revisá el interés y elegí un vencimiento posterior al actual.');
  const history=Array.isArray(loan.renewals)?loan.renewals:[];
  if(history.some(r=>r.id===renewalId))throw Error('Esta renovación ya fue registrada.');
  const record={id:renewalId,createdAt,installmentId:row.id,previousDueDate:row.dueDate,newDueDate:dueDate,previousAmount:row.amount,paidAtRenewal:row.paid,previousBalance:(cents(row.amount)-cents(row.paid))/100,addedInterest:extra/100,newBalance:(total-cents(row.paid))/100,note:String(note).trim().slice(0,1000)};
  return {loan:{...loan,firstDue:dueDate,firstDueManual:true,renewals:[...history,record]},installment:{...row,amount:total/100,dueDate,status:row.paid>0?'Parcial':'Pendiente'},record};
 }
 function validHistory(value){return value===undefined||(Array.isArray(value)&&value.every(r=>r&&typeof r.id==='string'&&typeof r.installmentId==='string'&&validDate(r.previousDueDate)&&validDate(r.newDueDate)&&r.newDueDate>r.previousDueDate&&Number.isFinite(Date.parse(r.createdAt))&&['previousAmount','paidAtRenewal','previousBalance','addedInterest','newBalance'].every(k=>Number.isFinite(r[k])&&r[k]>=0)&&typeof r.note==='string'&&r.note.length<=1000));}
 const api={eligible,renew,validHistory};if(typeof module==='object'&&module.exports)module.exports=api;else root.LoanRenewal=api;
})(typeof window==='object'?window:globalThis);

