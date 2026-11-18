const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../own-financing-model.js');

test('zero interest allocates the rounding cent to the last installment',()=>{
  const result=M.calculate(571000,0,3);
  assert.equal(result.interest,0);
  assert.equal(result.total,571000);
  assert.deepEqual(result.amounts,[190333.33,190333.33,190333.34]);
  assert.equal(Math.round(result.amounts.reduce((sum,value)=>sum+value,0)*100),57100000);
});

test('total interest percent is applied once over principal',()=>{
  const result=M.calculate(571000,10,3);
  assert.equal(result.interest,57100);
  assert.equal(result.total,628100);
  assert.equal(Math.round(result.amounts.reduce((sum,value)=>sum+value,0)*100),62810000);
});

test('date schedule clamps month end and validates unrestricted installment counts',()=>{
  assert.equal(M.dateAfterMonths('2026-01-31',1),'2026-02-28');
  assert.equal(M.dateAfterMonths('2026-01-31',2),'2026-03-31');
  assert.equal(M.calculate(100,0,37).amounts.length,37);
  assert.throws(()=>M.calculate(0,0,3));
});

test('recording an own financing adds its capital once as current cash, independent from customer loans',()=>{
  const financing={id:'fin-1',description:'Ropa',card:'VISA Galicia mia',capital:571000,purchaseDate:'2026-11-17'};
  const first=M.syncCashReceipt(financing,[],true,()=> 'movement-1'),movement=first.movement;
  assert.equal(movement.ownFinancingId,'fin-1');
  assert.equal(movement.type,'Financiación propia recibida');
  assert.equal(movement.direction,'in');
  assert.equal(movement.amount,571000);
  assert.equal(movement.date,'2026-11-17');
  assert.equal(movement.status,'Realizado');
  assert.equal(movement.loanId,undefined);
  assert.throws(()=>M.cashReceipt({...financing,capital:0},'movement-2'));
  const edited=M.syncCashReceipt({...financing,capital:600000,description:'Ropa ajustada'},first.movements,false,()=>{throw Error('No debe crear otro movimiento');});
  assert.equal(edited.movements.length,1);
  assert.equal(edited.movement.id,'movement-1');
  assert.equal(edited.movement.amount,600000);
  assert.match(edited.movement.description,/Ropa ajustada/);
  assert.equal(M.syncCashReceipt(financing,[],false,()=>{throw Error('No debe registrar capital retroactivo');}).movements.length,0);
});
