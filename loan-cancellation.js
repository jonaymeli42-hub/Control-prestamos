/* Reversible cancellation. Stored loan/payment records are never removed. */
(function(root){
 'use strict';
 function context(data){
  const loans=new Map((data.loans||[]).map(l=>[l.id,l]));
  const installments=new Map((data.installments||[]).map(i=>[i.id,i]));
  const collections=new Map((data.collections||[]).map(c=>[c.id,c]));
  const loanFor=record=>{
   if(!record)return undefined;
   const collection=record.collectionId&&collections.get(record.collectionId);
   const installment=installments.get(record.installmentId||collection?.installmentId);
   return loans.get(record.loanId||collection?.loanId||installment?.loanId);
  };
  return {loanFor,isCancelled:record=>loanFor(record)?.cancelled===true};
 }
 function activeData(data){
  if(!(data.loans||[]).some(l=>l.cancelled===true))return data;
  const c=context(data);
  return {...data,loans:data.loans.filter(l=>l.cancelled!==true),installments:(data.installments||[]).filter(i=>!c.isCancelled(i)),collections:(data.collections||[]).filter(i=>!c.isCancelled(i)),movements:(data.movements||[]).filter(i=>!c.isCancelled(i))};
 }
 function withCancelled(data,loanId,cancelled){
  if(typeof cancelled!=='boolean')throw Error('Estado de anulación inválido.');
  if(!(data.loans||[]).some(l=>l.id===loanId))throw Error('No se encontró el préstamo.');
  const next=structuredClone(data),loan=next.loans.find(l=>l.id===loanId);
  if(cancelled)loan.cancelled=true;else delete loan.cancelled;
  return next;
 }
 const valid=loan=>loan.cancelled===undefined||typeof loan.cancelled==='boolean';
 const api={context,activeData,withCancelled,valid};if(typeof module==='object'&&module.exports)module.exports=api;else root.LoanCancellation=api;
})(typeof window==='object'?window:globalThis);
