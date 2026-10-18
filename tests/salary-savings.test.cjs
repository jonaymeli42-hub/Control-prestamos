const test=require('node:test'),assert=require('node:assert/strict'),S=require('../salary-savings.js');
const row=(id,type,amount,date='2026-10-13',status='Realizado')=>({id,type,amount,date,status,direction:type===S.IN?'in':'out'});
test('monthly savings count only salary transfers, separately from interest and client payments',()=>{
 const rows=[row('in',S.IN,200000),row('out',S.OUT,50000),row('future',S.IN,80000,'2026-10-20','Pendiente'),row('other',S.IN,20,'2026-11-01'),row('loan','Cobro préstamo',400000)];
 const result=S.monthly(rows,'2026-10');assert.equal(result.received,200000);assert.equal(result.returned,50000);assert.equal(result.net,150000);assert.equal(result.items.length,2);assert.equal(S.monthly(rows,'2026-11').net,20);
});
test('net can be negative, centavos stay exact and dates move entries to their real month',()=>{
 const rows=[row('a',S.IN,0.1),row('b',S.IN,0.2),row('c',S.OUT,10.01)];assert.equal(S.monthly(rows,'2026-10').net,-9.71);rows[2].date='2026-09-01';assert.equal(S.monthly(rows,'2026-10').net,0.3);assert.equal(S.monthly([],'2026-10').net,0);
});
test('invalid dates/directions and unrelated or scheduled records are excluded',()=>{
 for(const changed of [{date:'2026-99-99'},{date:'2026-02-30'},{direction:'out'},{amount:NaN},{amount:-10},{status:'Programado'}]){const r={...row('x',S.IN,100),...changed};assert.equal(S.monthly([r],'2026-10').net,0);}
});
