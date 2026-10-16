const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../app.js'),'utf8');
const scheduleSource=source.slice(source.indexOf('  function calculateSchedule('),source.indexOf('  function formatIntegerInput('));
const ctx=vm.createContext({id:()=> 'test',addDate:(date,days=0,months=0)=>{const d=new Date(date+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+months);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}});
vm.runInContext(scheduleSource+';this.calculate=calculateSchedule;',ctx);
const base={capital:100000,rate:15,count:1,mode:'Préstamo corto semanal',deliveryDate:'2026-10-16',firstDue:'2026-11-06'};
test('S38: three weeks at 15% monthly means 111250, not 115000',()=>{
 assert.equal(ctx.calculate(base)[0].amount,111250);
});
test('short loan prorates elapsed weeks and zero interest',()=>{
 for(const [date,total] of [['2026-10-23',103750],['2026-10-30',107500],['2026-11-13',115000]])assert.equal(ctx.calculate({...base,firstDue:date})[0].amount,total);
 assert.equal(ctx.calculate({...base,rate:0})[0].amount,100000);
});
test('weekly installments use the last due date and divide the total without losing pesos',()=>{
 const rows=ctx.calculate({...base,firstDue:'2026-10-23',count:3});
 assert.equal(rows.reduce((s,r)=>s+r.amount,0),111250);
 assert.equal(rows[2].dueDate,'2026-11-06');
});
test('other modes retain their previous totals',()=>{
 assert.equal(ctx.calculate({...base,mode:'1 cuota'})[0].amount,115000);
 assert.equal(ctx.calculate({...base,mode:'Cuotas normales',count:3}).reduce((s,r)=>s+r.amount,0),145000);
 assert.equal(ctx.calculate({...base,mode:'Interés mensual + capital final',count:3}).reduce((s,r)=>s+r.amount,0),145000);
});
