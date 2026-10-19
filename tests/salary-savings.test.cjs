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
const vm=require('node:vm'),fs=require('node:fs');
function dated(id,type,amount,date,time='12:00:00'){return {...row(id,type,amount,date),createdAt:date+'T'+time+'.000Z',direction:type===S.OUT?'out':'in'};}
const actualFutureSource=fs.readFileSync(require.resolve('../app.js'),'utf8');
function future(rows,initial=500000){const ctx=vm.createContext({S,data:{movements:rows},roundMoney:n=>Math.round(n*100)/100,movementBalance:()=>initial+rows.filter(r=>!['Pendiente','Programado'].includes(r.status)).reduce((s,r)=>s+r.amount*(r.direction==='in'?1:-1),0),receivableTotal:()=>0,cardDebtTotal:()=>0});vm.runInContext(actualFutureSource.slice(actualFutureSource.indexOf('  function futureMoney()'),actualFutureSource.indexOf('  function validFutureRecord('))+';this.amount=futureMoney();',ctx);return ctx.amount;}
test('cash withdrawn for salary stays in future; returning it does not increase future twice',()=>{
 const out=dated('out',S.OUT,100000,'2026-10-01'),partial=dated('partial',S.RETURN,50000,'2026-10-02'),extra=dated('extra',S.RETURN,100000,'2026-10-03');
 assert.equal(future([out]),500000);assert.equal(S.reconcile([out]).pending,100000);
 assert.equal(future([partial,out]),500000);assert.equal(S.reconcile([partial,out]).pending,50000);
 const complete=[extra,partial,out];assert.equal(future(complete),550000);assert.equal(S.reconcile(complete).pending,0);assert.deepEqual(S.reconcile(complete).allocations.find(r=>r.id==='extra'),{id:'extra',date:'2026-10-03',returned:50000,saved:50000,withdrawn:0,pending:0});
});
test('the approved 150000 example splits 100000 return and 50000 new savings',()=>{
 const rows=[dated('in',S.RETURN,150000,'2026-10-02'),dated('out',S.OUT,100000,'2026-10-01')];
 assert.equal(S.monthly(rows,'2026-10').repaid,100000);assert.equal(S.monthly(rows,'2026-10').saved,50000);assert.equal(future(rows),550000);
});
test('new savings stay separate even when salary owes money; balances carry across months',()=>{
 const rows=[dated('return',S.RETURN,50000,'2026-11-03'),dated('new',S.SAVE,30000,'2026-10-03'),dated('out',S.OUT,100000,'2026-10-01')];
 const oct=S.monthly(rows,'2026-10'),nov=S.monthly(rows,'2026-11');assert.equal(oct.saved,30000);assert.equal(oct.pending,100000);assert.equal(nov.repaid,50000);assert.equal(nov.saved,0);assert.equal(nov.pending,50000);assert.equal(future(rows),530000);
});
test('legacy incoming transfers allocate by date without changing records, and editing or deleting recalculates',()=>{
 const out=dated('out',S.OUT,100000,'2026-10-01'),incoming=dated('legacy',S.IN,150000,'2026-10-02'),rows=[incoming,out],snapshot=JSON.stringify(rows);
 assert.equal(S.monthly(rows,'2026-10').saved,50000);assert.equal(JSON.stringify(rows),snapshot);
 assert.equal(S.reconcile([out]).pending,100000);assert.equal(future([out]),500000);
 assert.equal(S.monthly([incoming,{...out,amount:50000}],'2026-10').saved,100000);
 assert.equal(S.monthly([incoming,{...out,date:'2026-10-03'}],'2026-10').saved,150000);assert.equal(S.reconcile([incoming,{...out,date:'2026-10-03'}]).pending,100000);
});
test('pending, programmed, unrelated records do not create a salary receivable; centavos stay exact',()=>{
 const rows=[dated('r',S.RETURN,0.2,'2026-10-02'),dated('o',S.OUT,0.3,'2026-10-01')];assert.equal(S.reconcile(rows).pending,0.1);assert.equal(future(rows,100),100);
 for(const status of ['Pendiente','Programado']){const pending={...dated('p',S.OUT,100,'2026-10-01'),status};assert.equal(S.reconcile([pending]).pending,0);assert.equal(future([pending]),500000);}
 assert.equal(S.reconcile([row('expense','Gasto general',100)]).pending,0);
});
test('same-day old records retain oldest-first order and new types survive JSON backup',()=>{
 const out=row('o',S.OUT,100),incoming={...row('r',S.RETURN,100),direction:'in'};assert.equal(S.reconcile([incoming,out]).pending,0);assert.equal(S.monthly([incoming,out],'2026-10').saved,0);
 const rows=[dated('new',S.SAVE,100,'2026-10-03'),dated('return',S.RETURN,100,'2026-10-02'),dated('out',S.OUT,100,'2026-10-01')];const restored=JSON.parse(JSON.stringify(rows));assert(restored.every(S.valid));assert.deepEqual(S.reconcile(restored),S.reconcile(rows));
});
test('monthly projection includes the pending salary once, not once again every month',()=>{
 const rows=[dated('out',S.OUT,100000,'2026-10-01')],ctx=vm.createContext({S,Date,data:{movements:rows,cardFinancings:[]},roundMoney:n=>Math.round(n*100)/100,todayKey:()=> '2026-10-19',parseDate:value=>value instanceof Date?new Date(value):new Date(value+'T12:00:00Z'),dateKey:value=>new Date(value).toISOString().slice(0,10),movementBalance:()=>400000,pendingInstallments:()=>[],financingDues:()=>[],dueLeft:()=>0});
 vm.runInContext(actualFutureSource.slice(actualFutureSource.indexOf('  function futureProjection()'),actualFutureSource.indexOf('  function movementCategory('))+';this.periods=futureProjection();',ctx);
 assert.equal(ctx.periods.length,12);assert(ctx.periods.every(period=>period.salaryPending===100000&&period.available===500000&&period.current===400000));
});
