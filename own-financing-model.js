/* Schedule for purchases the app owner must repay. */
(function (root) {
  'use strict';
  const round = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const cents = value => Math.round((Number(value) + Number.EPSILON) * 100);
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
  function calculate(capital, interestPercent, count) {
    if (!Number.isFinite(capital) || capital <= 0 || !Number.isFinite(interestPercent) || interestPercent < 0 || !Number.isInteger(count) || count < 1 || count > 600) throw Error('Revisá capital, interés y cantidad de cuotas.');
    const principal = cents(capital), interest = cents(round(capital * interestPercent / 100)), total = principal + interest;
    const base = Math.round(total / count);
    const amounts = Array.from({ length: count }, (_, i) => i === count - 1 ? total - base * (count - 1) : base);
    return { capital: principal / 100, interest: interest / 100, interestPercent, total: total / 100, amounts: amounts.map(value=>value/100) };
  }
  function dateAfterMonths(value, count) {
    if (!validDate(value)) throw Error('Revisá la fecha del primer vencimiento.');
    const [year, month, day] = value.split('-').map(Number), target = new Date(year, month - 1 + count, 1), last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
  }
  function schedule(financing, ids = () => crypto.randomUUID()) {
    const values = calculate(Number(financing.capital), Number(financing.interestPercent), Number(financing.count));
    if (!validDate(financing.purchaseDate) || !validDate(financing.firstDueDate) || !Array.isArray(financing.installments) || financing.installments.length !== financing.count) throw Error('La financiación no tiene un cronograma válido.');
    return financing.installments.map((item, index) => ({ id: item.id || ids(), financingId: financing.id, number: index + 1, amount: round(Number(item.amount)), dueDate: item.dueDate, paid: round(Number(item.paid || 0)), status: item.status || 'Pendiente', payments: Array.isArray(item.payments) ? item.payments : [], customAmount: item.customAmount === true, customDate: item.customDate === true }));
  }
  root.OwnFinancingModel = { round, cents, validDate, calculate, dateAfterMonths, schedule };
  if (typeof module === 'object' && module.exports) module.exports = root.OwnFinancingModel;
})(globalThis);
