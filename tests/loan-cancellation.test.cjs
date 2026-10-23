const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../loan-cancellation.js'),renewal=require('../loan-renewal.js');
require('../financing-model.js');
const summary=require('../monthly-summary.js'),F=globalThis.ReceivedFinancing,overview=require('../financing-overview.js');
function fixture(){return {
 loans:[{id:'a',person:'Uno',code:'A1',capital:1000,disbursed:true,mode:'1 cuota'},{id:'b',person:'Dos',code:'B1',capital:500,disbursed:true,mode:'1 cuota'}],
 installments:[{id:'ia',loanId:'a',amount:1100,paid:100,dueDate:'2026-11-01',number:1},{id:'ib',loanId:'b',amount:600,paid:50,dueDate:'2026-11-02',number:1}],
 collections:[{id:'ca',installmentId:'ia',loanId:'a',date:'2026-10-15',amount:100},{id:'cb',installmentId:'ib',loanId:'b',date:'2026-10-16',amount:50}],
 movements:[{id:'ma',loanId:'a',type:'Préstamo dado',direction:'out',amount:1000,date:'2026-10-01'},{id:'mca',collectionId:'ca',type:'Cobro préstamo',direction:'in',amount:100,date:'2026-10-15'},{id:'mb',loanId:'b',type:'Préstamo dado',direction:'out',amount:500,date:'2026-10-01'},{id:'mcb',collectionId:'cb',type:'Cobro préstamo',direction:'in',amount:50,date:'2026-10-16'},{id:'funding',cardFinancingId:'f',direction:'in',amount:500,date:'2026-10-01'}],
 cardFinancings:[{id:'f',received:true,receivedAmount:500,totalToRepay:600,paid:0,nextPaymentDate:'2026-11-01'}],cardPayments:[],settings:{initialBalance:10000},futureHistory:[{date:'2026-10-01',amount:10000}],people:['Uno','Dos']
};}
function amounts(data){const d=C.activeData(data),cash=d.movements.filter(m=>!['Pendiente','Programado'].includes(m.status)).reduce((n,m)=>n+(m.direction==='in'?m.amount:-m.amount),d.settings.initialBalance),due=d.installments.filter(i=>d.loans.find(l=>l.id===i.loanId)?.disbursed!==false).reduce((n,i)=>n+i.amount-i.paid,0),debt=d.cardFinancings.reduce((n,f)=>n+f.totalToRepay-f.paid,0);return {cash,due,future:cash+due-debt};}
test('cancellation removes delivery, collections and future dues; reactivation restores the exact original data',()=>{
 const data=fixture(),snapshot=structuredClone(data);assert.deepEqual(amounts(data),{cash:9150,due:1550,future:10100});
 const cancelled=C.withCancelled(data,'a',true);assert.deepEqual(amounts(cancelled),{cash:10050,due:550,future:10000});
 assert.deepEqual(data,snapshot);assert.deepEqual(cancelled.installments,data.installments);assert.deepEqual(cancelled.collections,data.collections);assert.deepEqual(cancelled.movements,data.movements);assert.deepEqual(cancelled.futureHistory,data.futureHistory);assert.deepEqual(cancelled.cardFinancings,data.cardFinancings);
 const restored=C.withCancelled(cancelled,'a',false);assert.deepEqual(restored,data);assert.deepEqual(amounts(restored),amounts(data));
});
test('legacy collection and installment links resolve cancellation even without movement.loanId',()=>{
 const data=fixture();delete data.collections[0].loanId;
 const cancelled=C.withCancelled(data,'a',true),ctx=C.context(cancelled);
 assert(ctx.isCancelled({collectionId:'ca'}));assert(ctx.isCancelled({installmentId:'ia'}));assert(!ctx.isCancelled({collectionId:'cb'}));
 const active=C.activeData(cancelled);assert.equal(active.collections.length,1);assert.equal(active.movements.length,3);assert(!active.movements.some(m=>m.id==='mca'));
});
test('unrelated income, expenses, financing and unknown records keep their effects',()=>{
 const data=fixture();data.movements.push({id:'extra',direction:'in',amount:123},{id:'expense',direction:'out',amount:45},{id:'orphan',collectionId:'unknown',direction:'in',amount:7});
 const active=C.activeData(C.withCancelled(data,'a',true));for(const id of ['extra','expense','funding','orphan'])assert(active.movements.some(m=>m.id===id));assert.deepEqual(active.cardFinancings,data.cardFinancings);
});
test('historical loan without cash movements never invents a capital refund',()=>{
 const data=fixture();data.loans[0].historical=true;data.movements=data.movements.filter(m=>!['ma','mca'].includes(m.id));data.collections=data.collections.filter(c=>c.id!=='ca');
 assert.equal(amounts(C.withCancelled(data,'a',true)).cash,amounts(data).cash);
});
test('scheduled loan stays scheduled; cancelled pending movement never enters current cash',()=>{
 const data=fixture();data.loans[0].disbursed=false;data.movements[0].status='Pendiente';data.movements=data.movements.filter(m=>m.id!=='mca');data.collections=data.collections.filter(c=>c.id!=='ca');
 const cancelled=C.withCancelled(data,'a',true);assert.equal(amounts(cancelled).cash,amounts(data).cash);const restored=C.withCancelled(cancelled,'a',false);assert.equal(restored.loans[0].disbursed,false);assert.equal(restored.movements[0].status,'Pendiente');
});
test('multiple cancellations and repeated toggles do not duplicate or modify recorded payments',()=>{
 const data=fixture();let state=C.withCancelled(C.withCancelled(data,'a',true),'b',true);assert.equal(C.activeData(state).installments.length,0);
 for(let i=0;i<10;i++)state=C.withCancelled(C.withCancelled(state,'a',false),'a',true);
 assert.deepEqual(state.movements,data.movements);assert.deepEqual(state.collections,data.collections);assert.equal(state.loans.length,2);state=C.withCancelled(C.withCancelled(state,'a',false),'b',false);assert.deepEqual(state,data);
});
test('monthly reports drop cancelled lending and collections, leaving financing intact',()=>{
 const data=fixture(),before=summary.build(data,'2026-10',overview,F),after=summary.build(C.activeData(C.withCancelled(data,'a',true)),'2026-10',overview,F);
 assert.equal(before.totals.lent.actual,1500);assert.equal(after.totals.lent.actual,500);assert.equal(before.totals.collections.actual,150);assert.equal(after.totals.collections.actual,50);
 assert.deepEqual(after.totals.financing,before.totals.financing);
});
test('backup JSON preserves cancellations and renewal cannot operate on a cancelled loan',()=>{
 const data=C.withCancelled(fixture(),'a',true),restored=JSON.parse(JSON.stringify(data));assert(C.valid(restored.loans[0]));assert.deepEqual(amounts(restored),amounts(data));assert.equal(renewal.eligible(restored.loans[0],[restored.installments[0]]),false);
 assert(C.valid({}));assert(C.valid({cancelled:false}));assert(!C.valid({cancelled:'true'}));assert.throws(()=>C.withCancelled(data,'missing',true));assert.throws(()=>C.withCancelled(data,'a','true'));
});
