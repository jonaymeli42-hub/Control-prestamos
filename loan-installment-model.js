(function(root){
  'use strict';
  const round=value=>Math.round((Number(value)+Number.EPSILON)*100)/100;
  const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(`${value}T12:00:00Z`))&&new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)===value;
  function recalculate(old,proposed){
    if(!old)return {...proposed,calculatedAmount:proposed.amount,customAmount:false,customDate:false,paid:0,status:'Pendiente',payments:[]};
    const paid=Number(old.paid)||0,protect=old.customAmount===true||paid>0.005,amount=protect?Number(old.amount):Number(proposed.amount);
    return {...old,dueDate:old.customDate===true||paid>0.005?old.dueDate:proposed.dueDate,calculatedAmount:protect?Number(old.calculatedAmount??old.amount):Number(proposed.amount),amount,status:paid>=amount-0.005?'Pagado':paid>0.005?'Parcial':'Pendiente'};
  }
  function edit(row,{amount,dueDate}){
    if(Number(row.paid)>0.005)throw Error('La cuota tiene pagos; hay que deshacerlos antes de editarla.');
    const nextAmount=round(Number(amount));
    if(!Number.isFinite(nextAmount)||nextAmount<=0||!validDate(dueDate))throw Error('Importe o vencimiento inválido.');
    return {...row,amount:nextAmount,dueDate,customAmount:nextAmount!==Number(row.calculatedAmount??row.amount),customDate:dueDate!==row.dueDate,status:'Pendiente'};
  }
  function createExtra({id,loanId,number,position,amount,dueDate,note=''}){
    const value=round(Number(amount));if(!Number.isFinite(value)||value<=0||!validDate(dueDate)||!Number.isInteger(position)||position<1)throw Error('Cuota adicional inválida.');
    return {id,loanId,number,extra:true,extraIndex:position,note:String(note),dueDate,amount:value,calculatedAmount:value,customAmount:true,customDate:true,paid:0,status:'Pendiente',payments:[]};
  }
  function balance(rows){return round(rows.reduce((sum,row)=>sum+Math.max(0,Number(row.amount||0)-Number(row.paid||0)),0));}
  root.LoanInstallmentModel={round,validDate,recalculate,edit,createExtra,balance};
  if(typeof module==='object'&&module.exports)module.exports=root.LoanInstallmentModel;
})(globalThis);
