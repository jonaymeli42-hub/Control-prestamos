const test=require('node:test'),assert=require('node:assert/strict');require('../financing-model.js');const F=globalThis.ReceivedFinancing,{build}=require('../financing-overview.js');
const bullet={id:'bullet',card:'Persona de prueba',repaymentMode:'monthly-bullet',receivedAmount:5000000,receivedDate:'2026-09-15',firstDueDate:'2026-10-15',monthCount:3,interestValue:10,totalToRepay:6500000,paid:750000,received:true};
const installments={id:'normal',card:'Cuotas de prueba',repaymentMode:'installments',receivedAmount:100000,receivedDate:'2026-09-20',firstDueDate:'2026-10-20',monthCount:3,interestValue:0,totalToRepay:100000,paid:40000,received:true};
const single={id:'single',card:'Tarjeta de prueba',repaymentMode:'single',receivedAmount:100000,totalToRepay:110000,paid:10000,nextPaymentDate:'2026-10-23',received:true};
test('monthly pending uses remaining installments, keeps principal at maturity and honors advances',()=>{
 const r=build([bullet,installments,single],'2026-10-19',F),month=m=>r.months.find(g=>g.month===m);
 assert.equal(month('2026-10').total,100000);assert.equal(month('2026-11').total,276666.67);assert.equal(month('2026-12').total,5533333.33);assert.equal(r.total,5910000);
 assert.equal(month('2026-11').items.find(r=>r.financingId==='bullet').number,2);assert.equal(month('2026-12').items.find(r=>r.financingId==='bullet').capital,5000000);
});
test('older unpaid and undated balances remain visible and never get assigned to the current month',()=>{
 const rows=[single,{...single,id:'old',nextPaymentDate:'2026-09-10',totalToRepay:5000,paid:0},{...single,id:'no-date',nextPaymentDate:'',totalToRepay:15000,paid:0},{...single,id:'bad-date',nextPaymentDate:'2026-02-30',totalToRepay:100,paid:0}];
 const r=build(rows,'2026-10-19',F);assert.equal(r.overdue.length,1);assert.equal(r.undated.length,2);assert.equal(r.months.find(g=>g.month==='2026-10').total,100000);assert.equal(r.total,120100);
});
test('paid single financing appears in its actual payment month; pending totals remain unchanged',()=>{
 const source=[{...single,paid:110000,nextPaymentDate:''},{...bullet,received:false},{...single,id:'year',nextPaymentDate:'2027-01-05'}],payments=[{id:'payment',financingId:'single',amount:110000,date:'2026-10-23'}],snapshot=JSON.stringify([source,payments]);
 const report=build(source,'2026-12-19',F,payments),october=report.months.find(g=>g.month==='2026-10');
 assert.equal(report.rows.length,2);assert.equal(october.items[0].kind,'payment');assert.equal(october.items[0].paidAmount,110000);assert.equal(october.total,0);assert.equal(report.months.find(g=>g.month==='2027-01').total,100000);assert.equal(JSON.stringify([source,payments]),snapshot);assert.deepEqual(build([],'2026-12-19',F).months,[]);
});
test('fully paid monthly dues remain visible by due month and do not inflate what remains to pay',()=>{
 const paidOctober={...bullet,paid:500000},report=build([paidOctober],'2026-12-19',F),october=report.months.find(g=>g.month==='2026-10');
 assert.ok(october);assert.equal(october.total,0);assert.equal(october.items.length,1);assert.equal(october.items[0].kind,'due');assert.equal(october.items[0].paidAmount,500000);assert.equal(october.items[0].amount,0);assert.equal(report.total,6000000);
});
test('undoing a partial payment restores the correct month and totals keep centavos',()=>{
 const paid=build([installments],'2026-10-19',F),undone=build([{...installments,paid:0}],'2026-10-19',F);
 assert.equal(paid.total,60000);assert.equal(undone.total,100000);assert.equal(undone.months.find(g=>g.month==='2026-10').total,33333.34);
});
