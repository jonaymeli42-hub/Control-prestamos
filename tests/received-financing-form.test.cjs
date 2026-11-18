const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
test('received-financing form initializes its interest selector before rendering',()=>{
 const source=fs.readFileSync('app.js','utf8');const start=source.indexOf('function openFinancingForm(');const end=source.indexOf('function renderReceivedSchedule(',start);const form=source.slice(start,end);
 assert.match(form,/const interestType = existing\?\.interestType \|\| 'amount';/);
 assert.ok(form.indexOf("const interestType = existing?.interestType")<form.indexOf("interestType === 'percent'"));
});
