const test=require('node:test'),assert=require('node:assert/strict');
require('../financing-model.js');
const F=globalThis.ReceivedFinancing;
const base={repaymentMode:'monthly-bullet',card:'Amigo de prueba',receivedAmount:5000000,receivedDate:'2026-10-09',firstDueDate:'2026-11-09',monthCount:6,interestValue:10,paid:0};
test('5 millones al 10%: seis intereses, capital solo en el último mes',()=>{
 assert.equal(F.valid(base),true);assert.deepEqual(F.totals(base),{interest:3000000,total:8000000,monthlyInterest:500000});
 const r=F.schedule(base);assert.equal(r.length,6);assert.deepEqual(r.map(x=>x.amount),[500000,500000,500000,500000,500000,5500000]);assert.equal(r[5].date,'2027-04-09');
});
test('pagos parciales, anticipados y cancelación exacta conservan saldo',()=>{
 const rows=F.schedule({...base,paid:750000});assert.equal(rows[0].remaining,0);assert.equal(rows[1].remaining,250000);assert.equal(rows.reduce((s,r)=>s+r.remaining,0),7250000);
 assert.equal(F.schedule({...base,paid:8000000}).every(r=>r.remaining===0),true);
});
test('día 31 respeta fin de febrero y vuelve al 31, incluye año bisiesto',()=>{
 assert.deepEqual(F.schedule({...base,firstDueDate:'2028-01-31',monthCount:3}).map(r=>r.date),['2028-01-31','2028-02-29','2028-03-31']);
});
test('un mes devuelve capital más un interés; tasa cero solo capital final',()=>{
 assert.equal(F.schedule({...base,monthCount:1})[0].amount,5500000);
 assert.deepEqual(F.schedule({...base,interestValue:0,monthCount:2}).map(r=>r.amount),[0,5000000]);
});
test('centavos se redondean por vencimiento y no se pierden con pagos',()=>{
 const f={...base,receivedAmount:101,interestValue:1.5,monthCount:3,paid:1.52};
 assert.equal(F.totals(f).total,105.56);assert.equal(F.schedule(f).reduce((n,r)=>Math.round((n+r.remaining)*100)/100,0),104.04);
});
test('rechaza fechas inexistentes, antes de recepción, tasas negativas y plazos inválidos',()=>{
 for(const changes of [{firstDueDate:'2027-02-30'},{firstDueDate:'2026-09-09'},{interestValue:-1},{monthCount:0},{monthCount:241},{monthCount:1.5},{receivedAmount:0},{card:''},{interestValue:Infinity}])assert.equal(F.valid({...base,...changes}),false);
 assert.deepEqual(F.schedule({repaymentMode:'single'}),[]);
});

test('primer vencimiento: mes siguiente con fin de mes y cambio de año',()=>{
 assert.equal(F.nextMonthDate('2026-10-09'),'2026-11-09');
 assert.equal(F.nextMonthDate('2027-01-31'),'2027-02-28');
 assert.equal(F.nextMonthDate('2028-01-31'),'2028-02-29');
 assert.equal(F.nextMonthDate('2026-12-15'),'2027-01-15');
 assert.equal(F.nextMonthDate('2026-02-30'),'');
});
