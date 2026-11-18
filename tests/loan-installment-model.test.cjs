const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../loan-installment-model.js');

test('recalculation preserves individually customized amount and date while updating default rows',()=>{
 const custom={id:'i1',number:1,amount:130000,calculatedAmount:143000,customAmount:true,dueDate:'2026-12-05',customDate:true,paid:0,status:'Pendiente',payments:[]};
 const unchanged=M.recalculate(custom,{id:'i1',number:1,amount:160000,dueDate:'2027-01-05'});
 const standard=M.recalculate({id:'i2',number:2,amount:143000,calculatedAmount:143000,paid:0,status:'Pendiente',payments:[]},{id:'i2',number:2,amount:160000,dueDate:'2027-01-05'});
 assert.equal(unchanged.amount,130000);assert.equal(unchanged.dueDate,'2026-12-05');assert.equal(unchanged.calculatedAmount,143000);
 assert.equal(standard.amount,160000);assert.equal(standard.dueDate,'2027-01-05');
});

test('an edited installment changes only itself and retains centavos',()=>{
 const rows=[{id:'1',amount:100000,calculatedAmount:100000,dueDate:'2026-12-05',paid:0},{id:'2',amount:100000,calculatedAmount:100000,dueDate:'2027-01-05',paid:0}];
 rows[0]=M.edit(rows[0],{amount:'130000.45',dueDate:'2026-12-10'});
 assert.equal(rows[0].amount,130000.45);assert.equal(rows[0].customAmount,true);assert.equal(rows[0].customDate,true);
 assert.equal(rows[1].amount,100000);assert.equal(rows[1].dueDate,'2027-01-05');
});

test('paid installments protect both historical amount and due date',()=>{
 const paid={id:'1',number:1,amount:100000,calculatedAmount:100000,dueDate:'2026-12-05',paid:50000,status:'Parcial',payments:['p']};
 const next=M.recalculate(paid,{id:'1',number:1,amount:130000,dueDate:'2027-01-05'});
 assert.equal(next.amount,100000);assert.equal(next.dueDate,'2026-12-05');assert.equal(next.status,'Parcial');
 assert.throws(()=>M.edit(paid,{amount:110000,dueDate:'2026-12-05'}),/pagos/);
});

test('extra installments keep separate identity, custom amount and due date',()=>{
 const extra=M.createExtra({id:'extra-1',loanId:'loan-1',number:1000001,position:1,amount:112000,dueDate:'2027-01-31',note:'Acuerdo'});
 assert.equal(extra.extra,true);assert.equal(extra.number,1000001);assert.equal(extra.extraIndex,1);assert.equal(extra.amount,112000);assert.equal(extra.customAmount,true);assert.equal(extra.dueDate,'2027-01-31');
 assert.equal(M.balance([{amount:100,paid:25},extra]),112075);
});
