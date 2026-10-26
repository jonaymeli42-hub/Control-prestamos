const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
const fn = source.slice(source.indexOf('  function undoLoanPayment('), source.indexOf('  function undoInstallmentPayment('));
function setup(confirm = true) {
  const data = {
    loans: [{id:'l',code:'12 Brasas 1',renewals:[{id:'renewal'}]}],
    installments: [{id:'i',loanId:'l',amount:4200000,paid:250000,paidBeforeApp:50000,payments:['a','b'],status:'Parcial'}, {id:'other',loanId:'other',amount:100,paid:100}],
    collections: [{id:'a',installmentId:'i',loanId:'l',amount:100000,date:'2026-10-20'}, {id:'b',installmentId:'i',loanId:'l',amount:100000,date:'2026-10-21'}],
    movements: [{id:'ma',collectionId:'a',amount:100000}, {id:'mb',collectionId:'b',amount:100000}, {id:'unrelated',amount:200}]
  };
  let persisted = 0;
  const context = {data,window:{confirm:()=>confirm},roundMoney:n=>Math.round(n*100)/100,money:String,formatDate:String,showToast:()=>{},persist:()=>persisted++,closeModal:()=>{},render:()=>{},openLoanDetail:()=>{}};
  vm.createContext(context);vm.runInContext(fn,context);
  return {data,undo:id=>context.undoLoanPayment(id),persisted:()=>persisted};
}
test('annuls only the selected 100000 payment, preserving other collections, historical amounts, installments and renewals',()=>{
  const {data,undo,persisted}=setup();const before=structuredClone(data);
  undo('a');assert.equal(data.installments[0].paid,150000);assert.equal(data.installments[0].status,'Parcial');
  assert.equal(data.installments[0].paidBeforeApp,50000);assert.deepEqual(data.installments[0].payments,['b']);
  assert.deepEqual(data.collections,[before.collections[1]]);assert.deepEqual(data.movements,before.movements.slice(1));
  assert.deepEqual(data.loans,before.loans);assert.deepEqual(data.installments[1],before.installments[1]);assert.equal(persisted(),1);
  undo('a');assert.equal(data.installments[0].paid,150000);assert.equal(persisted(),1);
  undo('b');assert.equal(data.installments[0].paid,50000);
});
test('cancelled confirmation and cancelled loan leave every record intact',()=>{
  for(const cancelled of [false,true]){const {data,undo,persisted}=setup(cancelled);if(cancelled)data.loans[0].cancelled=true;const before=JSON.stringify(data);undo('a');assert.equal(JSON.stringify(data),before);assert.equal(persisted(),0);}
});
test('rejects inconsistent amounts and marks the last reversed collection pending without changing due date or total',()=>{
  const {data,undo}=setup();data.installments[0].paid=50000;const before=JSON.stringify(data);undo('a');assert.equal(JSON.stringify(data),before);
  data.collections=data.collections.filter(item=>item.id==='a');data.installments[0].payments=['a'];
  data.installments[0].paid=100000;data.installments[0].paidBeforeApp=0;data.installments[0].dueDate='2026-11-16';undo('a');
  assert.equal(data.installments[0].paid,0);assert.equal(data.installments[0].status,'Pendiente');assert.equal(data.installments[0].amount,4200000);assert.equal(data.installments[0].dueDate,'2026-11-16');
});
