/* Received financing: fixed monthly interest, principal returned at maturity. */
(() => {
  const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const dateParts = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [y,m,d] = value.split('-').map(Number), date = new Date(y,m-1,d);
    return date.getFullYear() === y && date.getMonth() === m-1 && date.getDate() === d ? [y,m,d] : null;
  };
  function nextMonthDate(value) {
    const parts=dateParts(value);if(!parts)return '';
    const [y,m,d]=parts,target=new Date(y,m,1),day=Math.min(d,new Date(target.getFullYear(),target.getMonth()+1,0).getDate());
    return `${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  const isMonthly = f => f?.repaymentMode === 'monthly-bullet';
  const valid = f => !!dateParts(f.firstDueDate) && !!dateParts(f.receivedDate) && f.firstDueDate >= f.receivedDate && Number.isFinite(f.receivedAmount) && f.receivedAmount > 0 && Number.isFinite(f.interestValue) && f.interestValue >= 0 && Number.isInteger(f.monthCount) && f.monthCount >= 1 && f.monthCount <= 240 && typeof f.card === 'string' && f.card.trim().length > 0 && f.card.length <= 100 && Number.isSafeInteger(Math.round((f.receivedAmount + round(f.receivedAmount * f.interestValue / 100) * f.monthCount) * 100));
  function schedule(f) {
    if (!isMonthly(f) || !valid(f)) return [];
    const [y,m,d] = dateParts(f.firstDueDate), interest = round(f.receivedAmount * f.interestValue / 100);
    let paidCents = Math.max(0,Math.round(Number(f.paid || 0)*100));
    return Array.from({length:f.monthCount},(_,index) => {
      const target = new Date(y,m-1+index,1), day = Math.min(d,new Date(target.getFullYear(),target.getMonth()+1,0).getDate());
      const date = `${target.getFullYear()}-${String(target.getMonth()+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const capital = index === f.monthCount-1 ? round(f.receivedAmount) : 0, amount = round(interest+capital);
      const cents = Math.round(amount*100), applied = Math.min(paidCents,cents);paidCents -= applied;
      return {number:index+1,date,interest,capital,amount,paid:applied/100,remaining:(cents-applied)/100};
    });
  }
  function totals(f) {const rows=schedule({...f,paid:0});return {interest:round(rows.reduce((n,r)=>n+r.interest,0)),total:round(rows.reduce((n,r)=>n+r.amount,0)),monthlyInterest:rows[0]?.interest || 0};}
  globalThis.ReceivedFinancing = {isMonthly,valid,schedule,totals,nextMonthDate};
})();
