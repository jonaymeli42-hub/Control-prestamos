(() => {
  'use strict';

  const STORAGE_KEY = 'control-prestamos-data';
  const BACKUP_FORMAT = 'control-prestamos-backup';
  const BACKUP_VERSION = 1;
  const LOAN_TYPES = ['1 cuota', 'Cuotas normales', 'Interés mensual + capital final', 'Préstamo corto semanal'];
  const HISTORICAL_TOTALS = [
    { id: 'plata-recibida', label: 'Plata recibida', amount: 36376484.70 },
    { id: 'plata-devuelta', label: 'Plata devuelta', amount: 11274000.00 },
    { id: 'plata-para-prestamos', label: 'Plata para préstamos', amount: 31500000.00 },
    { id: 'plata-para-prestamos-semanales', label: 'Plata para préstamos semanales', amount: 4600000.00 },
    { id: 'plata-recibida-prestamos-semanales', label: 'Plata recibida préstamos semanales', amount: 4594500.00 },
    { id: 'plata-recibida-tarjetas', label: 'Plata recibida tarjetas', amount: 10200000.00 },
    { id: 'pagos-y-otros', label: 'Pagos y otros', amount: 1996984.70 }
  ];
  const INITIAL_DATA = {
    app: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    loans: [], installments: [], collections: [], movements: [], cardFinancings: [], cardPayments: [],
    historical: [...HISTORICAL_TOTALS],
    people: ['Harry', 'Semanal', 'Marcelo', 'Jano', '12 Brasas'],
    groups: ['H', 'S', 'M', 'J', '12B'],
    loanTypes: [...LOAN_TYPES],
    cards: ['VISA Galicia mia', 'Master Galicia mia', 'NARANJA', 'VISA BNA', 'MASTER BNA', 'Otra'],
    settings: { currency: 'ARS', locale: 'es-AR', initialBalance: 0, notificationsEnabled: false, notificationTime: '09:00', lastNotificationDate: '' }
  };

  let data = loadData();
  const startupParams = new URLSearchParams(window.location.search);
  let page = ['home', 'loans', 'collections', 'calendar', 'movements', 'cards', 'more'].includes(startupParams.get('page')) ? startupParams.get('page') : 'home';
  let calendarSelectedDate = parseDate(startupParams.get('date')) ? dateKey(startupParams.get('date')) : todayKey();
  let calendarMonth = new Date((parseDate(calendarSelectedDate) || new Date()).getFullYear(), (parseDate(calendarSelectedDate) || new Date()).getMonth(), 1);
  let loanFilter = 'Todos';
  let movementFilter = 'Todos';
  let toastTimer;

  const app = document.querySelector('#app');
  const modalRoot = document.querySelector('#modal-root');
  const toastNode = document.querySelector('#toast');

  function loadData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return normalizeData(saved);
    } catch (_) {
      return structuredClone(INITIAL_DATA);
    }
  }

  function normalizeData(value) {
    if (!value || typeof value !== 'object') return structuredClone(INITIAL_DATA);
    const result = { ...structuredClone(INITIAL_DATA), ...value };
    for (const key of ['loans', 'installments', 'collections', 'movements', 'cardFinancings', 'cardPayments', 'people', 'groups', 'loanTypes', 'cards', 'historical']) {
      if (!Array.isArray(result[key])) result[key] = [...INITIAL_DATA[key]];
    }
    result.settings = { ...INITIAL_DATA.settings, ...(value.settings || {}) };
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(result.settings.notificationTime)) result.settings.notificationTime = INITIAL_DATA.settings.notificationTime;
    result.loans = result.loans.map(loan => ({ ...loan, disbursed: loan.disbursed !== false }));
    result.cardFinancings = result.cardFinancings.map(financing => ({ ...financing, paid: Number(financing.paid) || 0, received: financing.received !== false }));
    result.app = BACKUP_FORMAT;
    result.version = BACKUP_VERSION;
    return result;
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function id() {
    return globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function money(value) {
    return new Intl.NumberFormat(data.settings.locale || 'es-AR', { style: 'currency', currency: data.settings.currency || 'ARS', maximumFractionDigits: 2 }).format(Number(value) || 0);
  }

  function parseDate(value) {
    if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    const parts = String(value || '').slice(0, 10).split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function dateKey(value) {
    const date = parseDate(value);
    if (!date || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function todayKey() { return dateKey(new Date()); }
  function formatDate(value, options = {}) {
    const date = parseDate(value);
    return date ? new Intl.DateTimeFormat('es-AR', options).format(date) : 'Sin fecha';
  }

  function addDate(value, days = 0, months = 0) {
    const date = parseDate(value) || new Date();
    if (months) {
      const originalDay = date.getDate();
      date.setDate(1);
      date.setMonth(date.getMonth() + months);
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      date.setDate(Math.min(originalDay, lastDay));
    }
    date.setDate(date.getDate() + days);
    return dateKey(date);
  }

  function loanInstallments(loanId) {
    return data.installments.filter(item => item.loanId === loanId).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.number - b.number);
  }

  function loanTotals(loan) {
    const installments = loanInstallments(loan.id);
    const total = installments.reduce((sum, item) => sum + item.amount, 0);
    const paid = installments.reduce((sum, item) => sum + item.paid, 0);
    const balance = Math.max(0, total - paid);
    const status = balance <= 0.005 ? 'Pagado' : paid > 0 ? 'Parcial' : 'Pendiente';
    return { installments, total, paid, balance, status, progress: total ? Math.min(100, paid / total * 100) : 0 };
  }

  function dueLeft(item) { return Math.max(0, item.amount - item.paid); }
  function pendingInstallments() {
    return data.installments.filter(item => {
      const loan = data.loans.find(record => record.id === item.loanId);
      return dueLeft(item) > 0.005 && (!loan || loan.disbursed !== false);
    });
  }
  function movementBalance() {
    return roundMoney(data.movements.reduce((total, item) => {
      if (item.status === 'Pendiente' || item.status === 'Programado') return total;
      return total + (item.direction === 'in' ? item.amount : -item.amount);
    }, Number(data.settings.initialBalance) || 0));
  }
  function financingBalance(financing) {
    return roundMoney(Math.max(0, Number(financing.totalToRepay || 0) - Number(financing.paid || 0)));
  }
  function cardDebtTotal() {
    return roundMoney(data.cardFinancings.filter(item => item.received !== false).reduce((sum, item) => sum + financingBalance(item), 0));
  }
  function receivableTotal() {
    return roundMoney(pendingInstallments().reduce((sum, item) => sum + dueLeft(item), 0));
  }
  function futureMoney() {
    return roundMoney(receivableTotal() - cardDebtTotal());
  }
  function movementCategory(item) {
    if (item.type === 'Cobro préstamo') return 'cobros';
    if (item.type === 'Préstamo dado' || item.type === 'Préstamo entregado') return 'loans-out';
    if (['Ingreso general', 'Aporte propio', 'Plata recibida'].includes(item.type)) return 'income';
    if (['Gasto general', 'Devolución', 'Pago/Otros'].includes(item.type)) return 'expenses';
    return 'cards';
  }
  function displayMovementType(item) {
    return item.type === 'Préstamo entregado' ? 'Préstamo dado' : item.type;
  }
  function movementDisplayDate(item) {
    return ['Pendiente', 'Programado'].includes(item.status) ? item.scheduledDate || item.dueDate || item.date : item.date;
  }

  function badge(status, dueDate) {
    const overdue = status !== 'Pagado' && dueDate && dueDate < todayKey();
    const className = status === 'Pagado' ? 'paid' : overdue ? 'overdue' : status === 'Parcial' ? 'partial' : 'pending';
    return `<span class="badge ${className}">${overdue ? 'Vencida' : escapeHtml(status)}</span>`;
  }

  function emptyState(icon, title, text, action = '') {
    return `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon}</div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p>${action}</div>`;
  }

  function pageHeading(title, subtitle, extra = '') {
    return `<div class="page-heading"><div><h2>${title}</h2><p>${subtitle}</p></div>${extra}</div>`;
  }

  function render() {
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.page === page));
    const views = { home: renderHome, loans: renderLoans, collections: renderCollections, calendar: renderCalendar, movements: renderMovements, cards: renderCards, more: renderMore };
    app.innerHTML = (views[page] || renderHome)();
  }

  function renderHome() {
    const allPending = pendingInstallments().sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const receivable = allPending.reduce((sum, item) => sum + dueLeft(item), 0);
    const payable = cardDebtTotal();
    const current = movementBalance();
    const future = futureMoney();
    const next = allPending.filter(item => item.dueDate >= todayKey()).slice(0, 3);
    const recentLoans = data.loans.filter(loan => loanTotals(loan).status !== 'Pagado').slice(0, 3);
    return `${pageHeading('Buen día', 'Este es el estado de tus préstamos.', `<span class="date-pill">${formatDate(todayKey(), { day: 'numeric', month: 'short', year: 'numeric' })}</span>`)}
      <section class="summary-grid" aria-label="Resumen de dinero">
        <article class="summary-card current"><span class="label">Dinero actual</span><span class="amount">${money(current)}</span><span class="hint">Según tus movimientos</span></article>
        <article class="summary-card future"><span class="label">Dinero a futuro</span><span class="amount">${money(future)}</span><span class="hint">Préstamos pendientes − deuda de tarjetas</span></article>
        <article class="summary-card receivable"><span class="label">A recibir</span><span class="amount">${money(receivable)}</span><span class="hint">Saldo de cuotas pendientes</span></article>
        <article class="summary-card payable"><span class="label">A pagar de tarjetas</span><span class="amount">${money(payable)}</span><span class="hint">Saldo pendiente de financiación</span></article>
      </section>
      <button class="primary-button full add-loan" data-action="new-loan"><span>＋</span>Agregar nuevo préstamo</button>
      <section class="section"><div class="section-head"><h3>Próximos cobros</h3><button class="text-button" data-page="collections">Ver todos</button></div>
        ${next.length ? `<div class="list">${next.map(item => renderInstallmentCard(item, true)).join('')}</div>` : emptyState('↗', 'Todavía no hay cobros', 'Al registrar un préstamo, sus próximas cuotas aparecerán acá.', '<button class="primary-button" data-action="new-loan">Crear préstamo</button>')}</section>
      <section class="section"><div class="section-head"><h3>Préstamos pendientes</h3><button class="text-button" data-page="loans">Ver todos</button></div>
        ${recentLoans.length ? `<div class="list">${recentLoans.map(renderLoanCard).join('')}</div>` : emptyState('▤', 'Sin préstamos pendientes', 'Tus préstamos activos aparecerán en esta sección.')}</section>`;
  }

  function renderLoanCard(loan) {
    const totals = loanTotals(loan);
    return `<article class="card loan-card" data-action="loan-detail" data-id="${escapeHtml(loan.id)}" tabindex="0" role="button" aria-label="Ver préstamo ${escapeHtml(loan.code)} de ${escapeHtml(loan.person)}">
      <div class="row-top"><div><div class="person">${escapeHtml(loan.person)} <span class="subtle">· ${escapeHtml(loan.code)}</span></div><div class="subtle">${escapeHtml(loan.mode)}${loan.group ? ` · Grupo ${escapeHtml(loan.group)}` : ''}</div></div>${badge(totals.status)}</div>
      <div class="inline-details"><span>Capital <b>${money(loan.capital)}</b></span><span>Total <b>${money(totals.total)}</b></span><span>Saldo <b>${money(totals.balance)}</b></span></div>
      <div class="progress"><span style="width:${totals.progress}%"></span></div><div class="progress-meta"><span>Cobrado ${money(totals.paid)}</span><span>${Math.round(totals.progress)}%</span></div></article>`;
  }

  function renderInstallmentCard(item, compact = false) {
    const loan = data.loans.find(record => record.id === item.loanId);
    if (!loan) return '';
    const left = dueLeft(item);
    return `<article class="card installment-card" data-action="pay-installment" data-id="${escapeHtml(item.id)}" tabindex="0" role="button" aria-label="Registrar cobro de ${escapeHtml(loan.person)}">
      <div class="row-top"><div><div class="person">${escapeHtml(loan.person)} <span class="subtle">· ${escapeHtml(loan.code)}</span></div><div class="subtle">Cuota ${item.number} · vence ${formatDate(item.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })}</div></div><div class="amount">${money(left)}</div></div>
      ${compact ? `<div class="row" style="margin-top:10px">${badge(item.paid > 0 ? 'Parcial' : 'Pendiente', item.dueDate)}<span class="subtle">Tocá para registrar un cobro ›</span></div>` : `<div class="row" style="margin-top:10px">${badge(item.paid > 0 ? 'Parcial' : 'Pendiente', item.dueDate)}<span class="subtle">Pagado ${money(item.paid)} de ${money(item.amount)}</span></div>`}</article>`;
  }

  function renderLoans() {
    const loans = data.loans.filter(loan => loanFilter === 'Todos' || loanTotals(loan).status === loanFilter);
    return `${pageHeading('Préstamos', `${data.loans.length} en total`, '<button class="primary-button" data-action="new-loan">＋ Nuevo</button>')}
      <div class="filter-row">${['Todos', 'Pendiente', 'Parcial', 'Pagado'].map(filter => `<button class="filter-chip ${loanFilter === filter ? 'active' : ''}" data-action="loan-filter" data-value="${filter}">${filter}</button>`).join('')}</div>
      ${loans.length ? `<div class="list">${loans.map(renderLoanCard).join('')}</div>` : emptyState('▤', 'No hay préstamos', 'Creá un préstamo para comenzar a seguir sus cuotas.', '<button class="primary-button" data-action="new-loan">Agregar préstamo</button>')}`;
  }

  function renderCollections() {
    const pending = pendingInstallments().sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.number - b.number);
    const total = pending.reduce((sum, item) => sum + dueLeft(item), 0);
    return `${pageHeading('Cobros', `${pending.length} cuotas pendientes`, `<span class="date-pill">${money(total)} por cobrar</span>`)}
      ${pending.length ? `<div class="list">${pending.map(item => renderInstallmentCard(item)).join('')}</div>` : emptyState('✓', 'Todo al día', 'No quedan cuotas pendientes de cobro.')}`;
  }

  function calendarEvents() {
    const events = [];
    pendingInstallments().forEach(item => {
      const loan = data.loans.find(record => record.id === item.loanId);
      if (loan) events.push({ id: item.id, kind: 'installment', date: item.dueDate, amount: dueLeft(item), label: `Cobro de cuota ${item.number}`, detail: `${loan.person} · ${loan.code}` });
    });
    data.movements.filter(item => item.status === 'Pendiente' || item.status === 'Programado').forEach(item => {
      const date = item.scheduledDate || item.dueDate;
      if (!date) return;
      events.push({ id: item.id, kind: 'movement', date, amount: item.amount, label: displayMovementType(item), detail: item.person || item.description || (item.direction === 'in' ? 'Ingreso general' : 'Gasto general') });
    });
    data.cardFinancings.filter(item => item.received !== false && financingBalance(item) > 0.005 && item.nextPaymentDate).forEach(item => {
      events.push({ id: item.id, kind: 'card-payment', date: item.nextPaymentDate, amount: financingBalance(item), label: 'Pago de tarjeta', detail: `${item.card} · saldo pendiente` });
    });
    return events.filter(event => parseDate(event.date)).sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
  }

  function calendarLoanInstallments(date) {
    return data.installments.filter(item => {
      if (item.dueDate !== date) return false;
      const loan = data.loans.find(record => record.id === item.loanId);
      return Boolean(loan && loan.disbursed !== false);
    }).sort((a, b) => a.number - b.number);
  }

  function renderCalendarInstallment(item) {
    const loan = data.loans.find(record => record.id === item.loanId);
    if (!loan) return '';
    const paid = dueLeft(item) <= 0.005;
    const left = dueLeft(item);
    return `<article class="card calendar-collection-card"><div class="row-top"><div><div class="person">${escapeHtml(loan.code || 'Préstamo')}</div><div class="subtle">${escapeHtml(loan.person)} · Cuota ${item.number} de ${loan.count || loanInstallments(loan.id).length}</div></div><span class="badge ${paid ? 'paid' : 'pending'}">${paid ? 'Cobrado' : 'Pendiente'}</span></div><div class="row calendar-collection-amount"><strong>${money(paid ? item.amount : left)}</strong>${item.paid > 0.005 && !paid ? `<span class="subtle">Pagado ${money(item.paid)} de ${money(item.amount)}</span>` : ''}</div>${!paid ? `<button class="primary-button full" data-action="calendar-collect" data-id="${escapeHtml(item.id)}">✓ Marcar como cobrado</button>` : ''}</article>`;
  }

  function renderCalendarEvent(event) {
    return `<article class="card installment-card" data-action="calendar-event" data-kind="${event.kind}" data-id="${escapeHtml(event.id)}" tabindex="0" role="button"><div class="row-top"><div><div class="person">${escapeHtml(event.label)}</div><div class="subtle">${escapeHtml(event.detail)} · ${formatDate(event.date, { day: 'numeric', month: 'short' })}</div></div><div class="amount">${money(event.amount)}</div></div><div class="row" style="margin-top:9px"><span class="badge pending">Pendiente</span><span class="subtle">Ver detalle ›</span></div></article>`;
  }

  function openCalendarEvent(kind, eventId) {
    if (kind === 'installment') {
      const item = data.installments.find(record => record.id === eventId);
      const loan = item && data.loans.find(record => record.id === item.loanId);
      if (!item || !loan || dueLeft(item) <= 0.005) return;
      openModal('Cobro de cuota', `${loan.person} · ${loan.code}`, `<div class="card kv-list"><div class="kv"><span>Vencimiento</span><b>${formatDate(item.dueDate, { day: 'numeric', month: 'long', year: 'numeric' })}</b></div><div class="kv"><span>Cuota</span><b>${item.number}</b></div><div class="kv"><span>Saldo</span><b>${money(dueLeft(item))}</b></div></div><button class="primary-button full" style="margin-top:14px" data-action="calendar-collect" data-id="${escapeHtml(item.id)}">Marcar cobrado</button>`);
    } else if (kind === 'movement') openMovementDetail(eventId);
    else if (kind === 'card-payment') {
      const financing = data.cardFinancings.find(record => record.id === eventId);
      if (!financing) return;
      openModal('Pago de tarjeta', financing.card, `<div class="card kv-list"><div class="kv"><span>Fecha prevista</span><b>${formatDate(financing.nextPaymentDate)}</b></div><div class="kv"><span>Saldo pendiente</span><b>${money(financingBalance(financing))}</b></div></div><button class="primary-button full" style="margin-top:14px" data-action="calendar-pay-card" data-id="${escapeHtml(financing.id)}">Marcar pagado</button>`);
    }
  }

  function renderCalendar() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    const slots = Math.ceil((offset + days) / 7) * 7;
    const events = calendarEvents();
    const paidInstallments = data.installments.filter(item => dueLeft(item) <= 0.005 && data.loans.some(loan => loan.id === item.loanId && loan.disbursed !== false)).map(item => ({ id: item.id, kind: 'paid-installment', date: item.dueDate }));
    const calendarItems = [...events, ...paidInstallments];
    const eventsByDate = new Map();
    calendarItems.forEach(event => {
      if (!eventsByDate.has(event.date)) eventsByDate.set(event.date, []);
      eventsByDate.get(event.date).push(event);
    });
    const cells = Array.from({ length: slots }, (_, index) => {
      const date = new Date(year, month, index - offset + 1);
      const key = dateKey(date);
      const inMonth = date.getMonth() === month;
      const dayEvents = eventsByDate.get(key) || [];
      const count = dayEvents.length;
      const loanItems = calendarLoanInstallments(key);
      const hasPending = dayEvents.some(event => event.kind === 'installment') || events.some(event => event.date === key && event.kind !== 'installment');
      const classes = ['calendar-day', !inMonth ? 'other' : '', key === todayKey() ? 'today' : '', key === calendarSelectedDate ? 'selected' : '', count ? `has-due ${hasPending ? (key < todayKey() ? 'overdue-dot' : '') : 'paid-dot'}` : ''].filter(Boolean).join(' ');
      return `<button class="${classes}" data-action="calendar-day" data-date="${key}" ${!inMonth ? 'disabled' : ''}><span class="calendar-date-number">${date.getDate()}</span>${loanItems.length ? `<span class="calendar-ref-list">${loanItems.map(item => { const loan = data.loans.find(record => record.id === item.loanId); return `<span class="calendar-ref">${escapeHtml(loan?.code || 'Cobro')}</span>`; }).join('')}</span>` : ''}${count > 1 && !loanItems.length ? `<span class="calendar-count">${count}</span>` : ''}</button>`;
    }).join('');
    const selectedEvents = events.filter(event => event.date === calendarSelectedDate && event.kind !== 'installment');
    const selectedInstallments = calendarLoanInstallments(calendarSelectedDate);
    const hasSelectedItems = selectedInstallments.length || selectedEvents.length;
    return `${pageHeading('Calendario', 'Eventos vinculados a préstamos, tarjetas y movimientos.', `<span class="date-pill">HOY · ${formatDate(todayKey(), { day: 'numeric', month: 'short' })}</span>`)}
      <section class="calendar"><div class="calendar-head"><button aria-label="Mes anterior" data-action="month-prev">‹</button><strong>${new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(calendarMonth)}</strong><button aria-label="Mes siguiente" data-action="month-next">›</button></div>
      <div class="calendar-grid">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(day => `<div class="weekday">${day}</div>`).join('')}${cells}</div>
      <div class="calendar-legend"><span class="legend-item"><i class="dot"></i>Evento pendiente</span><span class="legend-item"><i class="dot today"></i>Hoy</span></div></section>
      <section class="section"><div class="section-head"><h3>Agenda del ${calendarSelectedDate === todayKey() ? 'día de hoy' : formatDate(calendarSelectedDate, { day: 'numeric', month: 'long' })}</h3></div>${hasSelectedItems ? `<div class="list">${selectedInstallments.map(renderCalendarInstallment).join('')}${selectedEvents.map(renderCalendarEvent).join('')}</div>` : emptyState('▦', 'Sin eventos para este día', 'Las cuotas, pagos e ingresos programados aparecerán acá.')}</section>`;
  }

  function renderMovements() {
    const items = [...data.movements].filter(item => movementFilter === 'Todos' || movementCategory(item) === movementFilter).sort((a, b) => movementDisplayDate(b).localeCompare(movementDisplayDate(a)) || (b.createdAt || '').localeCompare(a.createdAt || ''));
    const directionLabel = direction => direction === 'in' ? 'Entrada' : 'Salida';
    const filters = [['Todos', 'Todos'], ['Cobros', 'cobros'], ['Préstamos dados', 'loans-out'], ['Ingresos generales', 'income'], ['Gastos generales', 'expenses']];
    return `${pageHeading('Movimientos', `${data.movements.length} registros`, '<button class="primary-button" data-action="new-movement">＋ Registrar</button>')}
      <div class="filter-row">${filters.map(([label, value]) => `<button class="filter-chip ${movementFilter === value ? 'active' : ''}" data-action="movement-filter" data-value="${value}">${label}</button>`).join('')}</div>
      ${items.length ? `<div class="list">${items.map(item => `<article class="card movement-card" data-action="movement-detail" data-id="${escapeHtml(item.id)}"><div class="row-top"><div><div class="person">${escapeHtml(displayMovementType(item))}</div><div class="subtle">${formatDate(movementDisplayDate(item), { day: 'numeric', month: 'short', year: 'numeric' })}${item.person ? ` · ${escapeHtml(item.person)}` : ''}</div></div><div class="amount ${item.direction === 'in' ? 'movement-in' : 'movement-out'}">${item.direction === 'in' ? '+' : '−'}${money(item.amount)}</div></div><div class="inline-details"><span>${directionLabel(item.direction)}</span>${item.description ? `<span>${escapeHtml(item.description)}</span>` : ''}${item.status === 'Pendiente' ? '<span class="badge pending">Programado</span>' : ''}</div></article>`).join('')}</div>` : emptyState('↔', 'Sin movimientos en esta categoría', 'Los movimientos de préstamos y los ingresos o gastos registrados aparecerán acá.', '<button class="primary-button" data-action="new-movement">Registrar movimiento</button>')}`;
  }

  function renderCards() {
    const received = data.cardFinancings.filter(item => item.received !== false);
    const totals = {
      received: received.reduce((sum, item) => sum + Number(item.receivedAmount || 0), 0),
      repay: received.reduce((sum, item) => sum + Number(item.totalToRepay || 0), 0),
      paid: received.reduce((sum, item) => sum + Number(item.paid || 0), 0),
      balance: cardDebtTotal()
    };
    const records = [...data.cardFinancings].sort((a, b) => (b.receivedDate || '').localeCompare(a.receivedDate || ''));
    return `${pageHeading('Tarjetas', `${records.length} financiaciones`, '<button class="primary-button" data-action="new-financing">＋ Nueva</button>')}
      <section class="summary-grid card-summary-grid"><article class="summary-card current"><span class="label">Total recibido</span><span class="amount">${money(totals.received)}</span></article><article class="summary-card future"><span class="label">Total a devolver</span><span class="amount">${money(totals.repay)}</span></article><article class="summary-card receivable"><span class="label">Total pagado</span><span class="amount">${money(totals.paid)}</span></article><article class="summary-card payable"><span class="label">Total pendiente</span><span class="amount">${money(totals.balance)}</span></article></section>
      <section class="section"><div class="section-head"><h3>Tarjetas disponibles</h3></div>${renderSettingGroup('Tarjetas', 'cards', data.cards)}</section>
      <section class="section"><div class="section-head"><h3>Financiaciones</h3></div>${records.length ? `<div class="list">${records.map(renderFinancingCard).join('')}</div>` : emptyState('▭', 'Sin financiaciones de tarjeta', 'Registrá el dinero recibido y sus cargos para seguir el saldo.', '<button class="primary-button" data-action="new-financing">Registrar financiación</button>')}</section>`;
  }

  function renderFinancingCard(financing) {
    const balance = financingBalance(financing);
    const status = financing.received === false ? 'Programada' : balance <= 0.005 ? 'Pagada' : financing.paid > 0 ? 'Parcial' : 'Pendiente';
    const badgeClass = status === 'Pagada' ? 'paid' : status === 'Parcial' ? 'partial' : 'pending';
    return `<article class="card" data-action="financing-detail" data-id="${escapeHtml(financing.id)}"><div class="row-top"><div><div class="person">${escapeHtml(financing.card)}</div><div class="subtle">${financing.received === false ? 'Recibir' : 'Recibido'} ${formatDate(financing.receivedDate, { day: 'numeric', month: 'short', year: 'numeric' })}</div></div><span class="badge ${badgeClass}">${status}</span></div><div class="inline-details"><span>Recibido <b>${money(financing.receivedAmount)}</b></span><span>Devolver <b>${money(financing.totalToRepay)}</b></span><span>Pagado <b>${money(financing.paid)}</b></span><span>Saldo <b>${money(balance)}</b></span></div>${financing.nextPaymentDate && balance > 0 ? `<div class="subtle" style="margin-top:9px">Próximo pago: ${formatDate(financing.nextPaymentDate)}</div>` : ''}</article>`;
  }

  function openFinancingForm() {
    const cardOptions = data.cards.length ? data.cards : ['Otra'];
    const body = `<form id="financing-form"><div class="form-grid"><div class="field"><label for="financing-card">Tarjeta</label><select id="financing-card" name="card" required>${cardOptions.map(card => `<option value="${escapeHtml(card)}">${escapeHtml(card)}</option>`).join('')}</select></div><div class="field"><label for="financing-date">Fecha en que recibí el dinero</label><input id="financing-date" name="receivedDate" type="date" value="${todayKey()}" required></div><div class="field"><label for="financing-amount">Monto recibido</label><input id="financing-amount" name="receivedAmount" type="number" min="0.01" step="0.01" inputmode="decimal" required></div><div class="field"><label for="financing-charges">Intereses / cargos</label><input id="financing-charges" name="charges" type="number" min="0" step="0.01" value="0" inputmode="decimal" required></div><div class="field full-span"><label for="financing-next-date">Próxima fecha de pago prevista (opcional)</label><input id="financing-next-date" name="nextPaymentDate" type="date" min="${todayKey()}"></div></div><p class="field-help">El dinero recibido actualiza el saldo disponible. Los cargos se suman a la deuda, no al dinero recibido.</p><div class="form-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancelar</button><button class="primary-button" type="submit">Guardar financiación</button></div></form>`;
    openModal('Nueva financiación', 'Registrá cuánto recibiste y cuánto debés devolver.', body);
    modalRoot.querySelector('#financing-form').addEventListener('submit', saveFinancing);
  }

  function saveFinancing(event) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const receivedAmount = roundMoney(Number(values.get('receivedAmount')));
    const charges = roundMoney(Number(values.get('charges')));
    const receivedDate = String(values.get('receivedDate'));
    const nextPaymentDate = String(values.get('nextPaymentDate'));
    if (!Number.isFinite(receivedAmount) || receivedAmount <= 0 || !Number.isFinite(charges) || charges < 0 || !parseDate(receivedDate) || (nextPaymentDate && (!parseDate(nextPaymentDate) || nextPaymentDate < receivedDate))) { showToast('Revisá el monto y las fechas de la financiación.'); return; }
    const financing = { id: id(), card: String(values.get('card')), receivedDate, receivedAmount, charges, totalToRepay: roundMoney(receivedAmount + charges), paid: 0, nextPaymentDate, received: receivedDate <= todayKey(), createdAt: new Date().toISOString(), payments: [] };
    data.cardFinancings.unshift(financing);
    const movement = { id: id(), date: receivedDate, scheduledDate: financing.received ? '' : receivedDate, createdAt: new Date().toISOString(), type: 'Tarjeta recibida', description: `${financing.card} · Financiación recibida`, direction: 'in', amount: receivedAmount, cardFinancingId: financing.id, status: financing.received ? 'Realizado' : 'Pendiente' };
    financing.receivedMovementId = movement.id;
    data.movements.unshift(movement);
    persist(); closeModal(); page = 'cards'; render(); showToast(financing.received ? 'Financiación registrada y dinero sumado.' : 'Financiación programada para una fecha futura.');
  }

  function openFinancingDetail(financingId) {
    const financing = data.cardFinancings.find(item => item.id === financingId);
    if (!financing) return;
    const payments = data.cardPayments.filter(item => item.financingId === financing.id).sort((a, b) => b.date.localeCompare(a.date));
    const history = payments.length ? `<div class="list">${payments.map(payment => `<div class="card"><div class="row"><b>${formatDate(payment.date, { day: 'numeric', month: 'short', year: 'numeric' })}</b><strong>${money(payment.amount)}</strong></div>${payment.note ? `<div class="subtle">${escapeHtml(payment.note)}</div>` : ''}</div>`).join('')}</div>` : '<p class="subtle">Todavía no hay pagos.</p>';
    const controls = financing.received !== false && financingBalance(financing) > 0.005 ? `<div class="form-actions"><button class="secondary-button" data-action="schedule-card-payment" data-id="${escapeHtml(financing.id)}">Programar fecha</button><button class="primary-button" data-action="pay-card" data-id="${escapeHtml(financing.id)}">Registrar pago</button></div>` : '';
    openModal(financing.card, 'Detalle de financiación', `<div class="card kv-list"><div class="kv"><span>Fecha recibida</span><b>${formatDate(financing.receivedDate)}</b></div><div class="kv"><span>Monto recibido</span><b>${money(financing.receivedAmount)}</b></div><div class="kv"><span>Intereses / cargos</span><b>${money(financing.charges)}</b></div><div class="kv"><span>Total a devolver</span><b>${money(financing.totalToRepay)}</b></div><div class="kv"><span>Pagado</span><b>${money(financing.paid)}</b></div><div class="kv"><span>Saldo pendiente</span><b>${money(financingBalance(financing))}</b></div></div>${controls}<section class="section"><div class="section-head"><h3>Pagos registrados</h3></div>${history}</section>`);
  }

  function openCardPaymentForm(financingId) {
    const financing = data.cardFinancings.find(item => item.id === financingId);
    if (!financing || financing.received === false || financingBalance(financing) <= 0.005) return;
    const balance = financingBalance(financing);
    const body = `<form id="card-payment-form"><div class="alert">${escapeHtml(financing.card)} · Saldo pendiente ${money(balance)}. Podés pagar cualquier monto hasta ese saldo.</div><div class="form-grid"><div class="field"><label for="card-payment-amount">Monto pagado</label><input id="card-payment-amount" name="amount" type="number" min="0.01" max="${balance}" step="0.01" value="${balance}" required></div><div class="field"><label for="card-payment-date">Fecha de pago</label><input id="card-payment-date" name="date" type="date" value="${todayKey()}" max="${todayKey()}" required></div><div class="field full-span"><label for="card-payment-note">Descripción (opcional)</label><input id="card-payment-note" name="note" maxlength="300"></div></div><div class="form-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancelar</button><button class="primary-button" type="submit">Registrar pago</button></div></form>`;
    openModal('Registrar pago de tarjeta', financing.card, body);
    modalRoot.querySelector('#card-payment-form').addEventListener('submit', event => saveCardPayment(event, financing.id));
  }

  function saveCardPayment(event, financingId) {
    event.preventDefault();
    const financing = data.cardFinancings.find(item => item.id === financingId);
    const values = new FormData(event.currentTarget);
    const amount = roundMoney(Number(values.get('amount')));
    const date = String(values.get('date'));
    if (!financing || !Number.isFinite(amount) || amount <= 0 || amount > financingBalance(financing) + 0.005 || !parseDate(date) || date > todayKey()) { showToast('El pago debe ser válido y no superar el saldo pendiente.'); return; }
    const payment = { id: id(), financingId, card: financing.card, amount, date, note: String(values.get('note')).trim(), createdAt: new Date().toISOString() };
    financing.paid = roundMoney(financing.paid + amount);
    financing.payments ||= [];
    financing.payments.push(payment.id);
    financing.nextPaymentDate = '';
    data.cardPayments.unshift(payment);
    data.movements.unshift({ id: id(), date, createdAt: payment.createdAt, type: 'Tarjeta pagada', description: `${financing.card} · Pago de financiación`, direction: 'out', amount, cardFinancingId: financing.id, cardPaymentId: payment.id, status: 'Realizado' });
    persist(); closeModal(); render(); showToast('Pago registrado; se actualizó el saldo pendiente.');
  }

  function openCardScheduleForm(financingId) {
    const financing = data.cardFinancings.find(item => item.id === financingId);
    if (!financing || financingBalance(financing) <= 0.005) return;
    const body = `<form id="card-schedule-form"><div class="field"><label for="schedule-date">Próxima fecha prevista de pago</label><input id="schedule-date" name="date" type="date" min="${todayKey()}" value="${financing.nextPaymentDate || todayKey()}" required></div><div class="form-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancelar</button><button class="primary-button" type="submit">Guardar fecha</button></div></form>`;
    openModal('Programar pago', financing.card, body);
    modalRoot.querySelector('#card-schedule-form').addEventListener('submit', event => {
      event.preventDefault();
      const date = String(new FormData(event.currentTarget).get('date'));
      if (!parseDate(date) || date < todayKey()) { showToast('Elegí hoy o una fecha futura.'); return; }
      financing.nextPaymentDate = date; persist(); closeModal(); render(); showToast('Fecha de pago programada.');
    });
  }

  function renderMore() {
    return `${pageHeading('Respaldo y más', 'Respaldos, avisos y configuración.')}
      <section class="historical-section"><div class="historical-heading"><div><span class="historical-eyebrow">REFERENCIA</span><h3>Histórico</h3></div></div><p class="historical-note">Totales del sistema anterior. Son datos históricos y no forman parte del dinero actual o futuro ni de los préstamos, cobros, movimientos u obligaciones vigentes. Consultá el Excel para ver el detalle de las operaciones.</p><div class="historical-list">${data.historical.map(item => `<div class="historical-row"><span>${escapeHtml(item.label)}</span><strong>${money(item.amount)}</strong></div>`).join('')}</div></section>
      <section class="backup-card"><h3>📤 Exportar respaldo</h3><p>Descargá un JSON con préstamos, cuotas, cobros, movimientos, financiaciones, pagos de tarjetas, configuración, avisos y totales históricos.</p><button class="primary-button full" data-action="export-backup">Exportar respaldo</button></section>
      <section class="backup-card"><h3>📥 Importar respaldo</h3><p>Elegí un respaldo JSON válido para incorporar sus datos. Los datos actuales se conservarán y los registros duplicados se omitirán, incluso si importás el mismo respaldo más de una vez.</p><button class="secondary-button full" data-action="choose-import">Seleccionar archivo JSON</button><input class="sr-only" type="file" id="backup-file" accept="application/json,.json"></section>
      <section class="backup-card"><h3>🔔 Avisos de cobros</h3><p>${escapeHtml(notificationStatusText())} Si permitís los avisos, la app revisa las cuotas pendientes de hoy al abrirse y a partir de las ${escapeHtml(data.settings.notificationTime || '09:00')} mientras permanece abierta.</p><button class="secondary-button full" data-action="enable-notifications">${notificationButtonText()}</button><p class="field-help" style="margin:9px 0 0">El navegador no puede ejecutar avisos diarios de forma confiable con la app completamente cerrada sin un servicio de notificaciones externo.</p></section>
      <section class="section"><div class="section-head"><h3>Configuración</h3></div>
        ${renderSettingGroup('Personas', 'people', data.people)}${renderSettingGroup('Grupos', 'groups', data.groups)}${renderSettingGroup('Tipos de préstamo', 'loanTypes', data.loanTypes)}${renderSettingGroup('Tarjetas', 'cards', data.cards)}
      </section><p class="subtle" style="text-align:center;margin-top:24px">Los datos se guardan en este dispositivo. Exportá un respaldo con regularidad.</p>`;
  }

  function renderSettingGroup(title, key, values) {
    return `<div class="settings-group"><h3>${escapeHtml(title)}</h3><div class="setting-list">${values.map((value, index) => `<span class="setting-tag">${escapeHtml(value)}<button aria-label="Eliminar ${escapeHtml(value)}" data-action="remove-setting" data-key="${key}" data-index="${index}">×</button></span>`).join('') || '<span class="subtle">Sin opciones</span>'}</div><form class="setting-add" data-form="setting" data-key="${key}"><input name="value" aria-label="Nueva opción de ${escapeHtml(title)}" placeholder="Agregar ${escapeHtml(title.toLowerCase())}" required maxlength="60"><button type="submit">Agregar</button></form></div>`;
  }

  function openModal(title, subtitle, body) {
    modalRoot.innerHTML = `<div class="modal-backdrop" data-action="backdrop-close"><section class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><div class="modal-header"><div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div><button class="close-button" data-action="close-modal" aria-label="Cerrar">×</button></div>${body}</section></div>`;
    modalRoot.querySelector('.modal-backdrop').addEventListener('click', event => { if (event.target === event.currentTarget) closeModal(); });
  }

  function closeModal() { modalRoot.innerHTML = ''; }

  function options(values, current = '') {
    return `<option value="">Seleccionar</option>${values.map(value => `<option ${value === current ? 'selected' : ''} value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}`;
  }

  function openLoanForm() {
    const today = todayKey();
    const body = `<form id="loan-form"><div class="form-grid">
      <div class="field"><label for="loan-code">Código / referencia</label><input id="loan-code" name="code" maxlength="40" placeholder="Ej. PRE-001"></div>
      <div class="field"><label for="loan-person">Persona</label><input id="loan-person" name="person" list="people-list" required maxlength="80" placeholder="Nombre"><datalist id="people-list">${data.people.map(person => `<option value="${escapeHtml(person)}">`).join('')}</datalist></div>
      <div class="field"><label for="loan-group">Grupo</label><select id="loan-group" name="group">${options(data.groups)}</select></div>
      <div class="field"><label for="loan-mode">Modalidad</label><select id="loan-mode" name="mode" required>${data.loanTypes.map(type => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join('')}</select></div>
      <div class="field"><label for="loan-capital">Capital prestado</label><input id="loan-capital" name="capital" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="0,00"></div>
      <div class="field"><label for="loan-rate">Tasa (%)</label><input id="loan-rate" name="rate" type="number" min="0" step="0.01" inputmode="decimal" value="0" required></div>
      <div class="field"><label for="loan-count">Cantidad de cuotas</label><input id="loan-count" name="count" type="number" min="1" max="240" step="1" value="1" required></div>
      <div class="field"><label for="loan-delivery-date">Fecha de entrega</label><input id="loan-delivery-date" name="deliveryDate" type="date" value="${today}" required><span class="field-help">Una fecha futura deja el préstamo programado.</span></div>
      <div class="field"><label for="loan-first-due">Primer vencimiento</label><input id="loan-first-due" name="firstDue" type="date" value="${today}" required></div>
      <div class="field full-span"><label for="loan-notes">Notas</label><textarea id="loan-notes" name="notes" maxlength="1000" placeholder="Detalle opcional"></textarea></div>
      </div><p class="field-help">La tasa se aplica una sola vez al total para cuotas normales y semanales. En interés mensual, se aplica por mes.</p><div class="form-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancelar</button><button class="primary-button" type="submit">Guardar préstamo</button></div></form>`;
    openModal('Agregar préstamo', 'Completá los datos y generaremos las cuotas.', body);
    modalRoot.querySelector('#loan-form').addEventListener('submit', saveLoan);
  }

  function calculateSchedule({ capital, rate, count, mode, firstDue }) {
    const periods = mode === '1 cuota' ? 1 : count;
    const rateDecimal = rate / 100;
    let values;
    if (mode === 'Interés mensual + capital final') {
      const interest = roundMoney(capital * rateDecimal);
      values = Array.from({ length: periods }, (_, index) => roundMoney(interest + (index === periods - 1 ? capital : 0)));
    } else {
      const total = roundMoney(capital * (1 + rateDecimal));
      const each = roundMoney(total / periods);
      values = Array(periods).fill(each);
      values[periods - 1] = roundMoney(total - each * (periods - 1));
    }
    return values.map((amount, index) => ({
      id: id(), number: index + 1,
      dueDate: index === 0 ? firstDue : mode === 'Préstamo corto semanal' ? addDate(firstDue, index * 7) : addDate(firstDue, 0, index),
      amount, paid: 0, status: 'Pendiente', payments: []
    }));
  }

  function roundMoney(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }

  function saveLoan(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const capital = Number(form.get('capital'));
    const rate = Number(form.get('rate'));
    const count = Number(form.get('count'));
    const mode = String(form.get('mode'));
    const firstDue = String(form.get('firstDue'));
    const deliveryDate = String(form.get('deliveryDate') || todayKey());
    if (!Number.isFinite(capital) || capital <= 0 || !Number.isFinite(rate) || rate < 0 || !Number.isInteger(count) || count < 1 || count > 240 || !parseDate(firstDue) || !parseDate(deliveryDate)) {
      showToast('Revisá capital, tasa, cuotas y vencimiento.'); return;
    }
    const person = String(form.get('person')).trim();
    const loan = {
      id: id(), code: String(form.get('code')).trim() || `PRE-${String(data.loans.length + 1).padStart(3, '0')}`,
      person, group: String(form.get('group')), mode, capital: roundMoney(capital), rate,
      count: mode === '1 cuota' ? 1 : count, firstDue,
      notes: String(form.get('notes')).trim(), createdAt: new Date().toISOString(), deliveryDate,
      disbursed: deliveryDate <= todayKey()
    };
    const schedule = calculateSchedule({ capital: loan.capital, rate, count: loan.count, mode, firstDue }).map(item => ({ ...item, loanId: loan.id }));
    data.loans.unshift(loan);
    data.installments.push(...schedule);
    data.movements.unshift({ id: id(), date: deliveryDate, scheduledDate: loan.disbursed ? '' : deliveryDate, createdAt: new Date().toISOString(), type: 'Préstamo dado', person, description: `${loan.code} · ${loan.mode}`, direction: 'out', amount: loan.capital, loanId: loan.id, status: loan.disbursed ? 'Realizado' : 'Pendiente' });
    persist(); closeModal(); page = 'loans'; render(); showToast('Préstamo y cuotas creados.');
  }

  function openLoanDetail(loanId) {
    const loan = data.loans.find(item => item.id === loanId);
    if (!loan) return;
    const totals = loanTotals(loan);
    const installments = totals.installments.map(item => `<div class="installment-line"><div class="due"><strong>Cuota ${item.number} · ${formatDate(item.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })}</strong>Pagado ${money(item.paid)} de ${money(item.amount)}</div><div style="text-align:right"><div class="due-amount">${money(dueLeft(item))}</div>${dueLeft(item) > 0.005 && loan.disbursed !== false ? `<button class="text-button" data-action="pay-installment" data-id="${escapeHtml(item.id)}">Cobrar</button>` : loan.disbursed === false ? '<span class="badge pending">Sin entregar</span>' : '<span class="badge paid">Pagada</span>'}</div></div>`).join('');
    openModal(`Préstamo ${loan.code}`, loan.person, `<div class="card kv-list"><div class="kv"><span>Modalidad</span><b>${escapeHtml(loan.mode)}</b></div><div class="kv"><span>Capital prestado</span><b>${money(loan.capital)}</b></div><div class="kv"><span>Total a recibir</span><b>${money(totals.total)}</b></div><div class="kv"><span>Cobrado</span><b>${money(totals.paid)}</b></div><div class="kv"><span>Saldo</span><b>${money(totals.balance)}</b></div><div class="kv"><span>Estado</span>${badge(totals.status)}</div>${loan.notes ? `<div class="kv"><span>Notas</span><b>${escapeHtml(loan.notes)}</b></div>` : ''}</div><section class="section"><div class="section-head"><h3>Cuotas</h3></div><div class="installment-table">${installments}</div></section><button class="danger-button full" style="margin-top:18px" data-action="delete-loan" data-id="${escapeHtml(loan.id)}">Eliminar préstamo</button>`);
  }

  function deleteLoan(loanId) {
    const loan = data.loans.find(item => item.id === loanId);
    if (!loan) return;
    const installmentIds = new Set(data.installments.filter(item => item.loanId === loanId).map(item => item.id).filter(Boolean));
    const relatedCollections = data.collections.filter(item => item.loanId === loanId || installmentIds.has(item.installmentId));
    const collectionIds = new Set(relatedCollections.map(item => item.id).filter(Boolean));
    if (!window.confirm(`Se eliminará el préstamo ${loan.code || ''} y toda la información asociada: cuotas, cobros y movimientos de entrega y cobro. Esta acción no se puede deshacer. ¿Querés continuar?`)) return;

    data.loans = data.loans.filter(item => item.id !== loanId);
    data.installments = data.installments.filter(item => item.loanId !== loanId);
    data.collections = data.collections.filter(item => !relatedCollections.includes(item));
    data.movements = data.movements.filter(item => {
      if (collectionIds.has(item.collectionId)) return false;
      if (item.loanId !== loanId) return true;
      return !['Préstamo dado', 'Préstamo entregado', 'Cobro préstamo'].includes(item.type);
    });
    persist(); closeModal(); render(); showToast('Préstamo e información asociada eliminados.');
  }

  function openPayForm(installmentId) {
    const item = data.installments.find(row => row.id === installmentId);
    if (!item) return;
    const loan = data.loans.find(row => row.id === item.loanId);
    const left = dueLeft(item);
    if (!loan || loan.disbursed === false || left <= 0.005) return;
    const body = `<form id="payment-form"><div class="alert">${escapeHtml(loan.person)} · Cuota ${item.number}. Saldo pendiente: <b>${money(left)}</b>.</div><div class="form-grid"><div class="field"><label for="payment-amount">Importe cobrado</label><input id="payment-amount" name="amount" type="number" min="0.01" max="${left}" step="0.01" value="${left}" inputmode="decimal" required></div><div class="field"><label for="payment-date">Fecha</label><input id="payment-date" name="date" type="date" value="${todayKey()}" required></div><div class="field full-span"><label for="payment-note">Observación</label><input id="payment-note" name="note" maxlength="500" placeholder="Opcional"></div></div><div class="form-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancelar</button><button class="primary-button" type="submit">Guardar cobro</button></div></form>`;
    openModal('Registrar cobro', `Cuota ${item.number} · ${loan.code}`, body);
    modalRoot.querySelector('#payment-form').addEventListener('submit', event => savePayment(event, item.id));
  }

  function savePayment(event, installmentId) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = roundMoney(Number(form.get('amount')));
    const date = String(form.get('date'));
    const item = data.installments.find(row => row.id === installmentId);
    const loan = item && data.loans.find(row => row.id === item.loanId);
    if (!item || !loan || loan.disbursed === false || !Number.isFinite(amount) || amount <= 0 || amount > dueLeft(item) + 0.005 || !parseDate(date)) {
      showToast('El importe debe ser mayor a cero y no superar el saldo.'); return;
    }
    const payment = { id: id(), installmentId, loanId: loan.id, amount, date, note: String(form.get('note')).trim(), createdAt: new Date().toISOString() };
    item.paid = roundMoney(item.paid + amount);
    if (item.paid >= item.amount - 0.005) { item.paid = item.amount; item.status = 'Pagado'; }
    else item.status = 'Parcial';
    item.payments ||= [];
    item.payments.push(payment.id);
    data.collections.unshift(payment);
    data.movements.unshift({ id: id(), date, createdAt: payment.createdAt, type: 'Cobro préstamo', person: loan.person, description: `${loan.code} · Cuota ${item.number}${payment.note ? ` · ${payment.note}` : ''}`, direction: 'in', amount, loanId: loan.id, collectionId: payment.id });
    persist(); closeModal(); render(); showToast('Cobro guardado y movimiento registrado.');
  }

  function openMovementForm() {
    const body = `<form id="movement-form"><div class="form-grid"><div class="field"><label for="movement-type">Tipo</label><select id="movement-type" name="type"><option>Ingreso general</option><option>Gasto general</option></select></div><div class="field"><label for="movement-date">Fecha de realización</label><input id="movement-date" name="date" type="date" value="${todayKey()}" required><span class="field-help">Si elegís una fecha futura, quedará programado y no afectará el dinero actual.</span></div><div class="field"><label for="movement-amount">Monto</label><input id="movement-amount" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required></div><div class="field full-span"><label for="movement-description">Descripción</label><input id="movement-description" name="description" maxlength="300" placeholder="Sueldo, reparación, compras…" required></div></div><div class="form-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancelar</button><button class="primary-button" type="submit">Guardar movimiento</button></div></form>`;
    openModal('Ingreso o gasto general', 'Los movimientos generales no se asocian a préstamos.', body);
    modalRoot.querySelector('#movement-form').addEventListener('submit', event => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      const amount = roundMoney(Number(values.get('amount')));
      const date = String(values.get('date'));
      const type = String(values.get('type'));
      if (!Number.isFinite(amount) || amount <= 0 || !parseDate(date) || !['Ingreso general', 'Gasto general'].includes(type)) { showToast('Revisá el monto y la fecha.'); return; }
      const future = date > todayKey();
      data.movements.unshift({ id: id(), type, date, scheduledDate: future ? date : '', createdAt: new Date().toISOString(), person: '', description: String(values.get('description')).trim(), direction: type === 'Ingreso general' ? 'in' : 'out', amount, status: future ? 'Pendiente' : 'Realizado' });
      persist(); closeModal(); render(); showToast(future ? 'Movimiento programado; todavía no afecta el dinero actual.' : 'Movimiento realizado y guardado.');
    });
  }

  function openMovementDetail(movementId) {
    const item = data.movements.find(row => row.id === movementId);
    if (!item) return;
    const canRealize = item.status === 'Pendiente' || item.status === 'Programado';
    const actionLabel = item.direction === 'in' ? 'Marcar realizado' : 'Marcar realizado';
    const eventDate = movementDisplayDate(item);
    openModal(displayMovementType(item), formatDate(eventDate, { day: 'numeric', month: 'long', year: 'numeric' }), `<div class="card kv-list"><div class="kv"><span>Descripción</span><b>${escapeHtml(item.description || item.person || '—')}</b></div><div class="kv"><span>Tipo</span><b>${item.direction === 'in' ? 'Ingreso' : 'Gasto'}</b></div><div class="kv"><span>Monto</span><b>${money(item.amount)}</b></div>${eventDate ? `<div class="kv"><span>Fecha prevista</span><b>${formatDate(eventDate)}</b></div>` : ''}${item.status ? `<div class="kv"><span>Estado</span><b>${escapeHtml(item.status)}</b></div>` : ''}</div>${canRealize ? `<button class="primary-button full" style="margin-top:14px" data-action="realize-movement" data-id="${escapeHtml(item.id)}">${actionLabel}</button>` : ''}`);
  }

  function realizeMovement(movementId) {
    const item = data.movements.find(row => row.id === movementId);
    if (!item || !['Pendiente', 'Programado'].includes(item.status)) return;
    item.status = 'Realizado';
    item.date = todayKey();
    item.createdAt = new Date().toISOString();
    if (item.loanId) {
      const loan = data.loans.find(record => record.id === item.loanId);
      if (loan) loan.disbursed = true;
    }
    if (item.cardFinancingId) {
      const financing = data.cardFinancings.find(record => record.id === item.cardFinancingId);
      if (financing) financing.received = true;
    }
    persist(); closeModal(); render(); showToast(item.direction === 'in' ? 'Ingreso realizado.' : 'Gasto o entrega realizados.');
  }

  function exportBackup() {
    const backup = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data: structuredClone(data) };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `respaldo_control_prestamos_${todayKey()}.json`;
    document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    showToast('Respaldo JSON exportado.');
  }

  function validateBackup(backup) {
    if (!backup || backup.format !== BACKUP_FORMAT || backup.version !== BACKUP_VERSION || !backup.data || typeof backup.data !== 'object') return false;
    const requiredArrays = ['loans', 'installments', 'collections', 'movements', 'people', 'groups', 'loanTypes', 'cards'];
    if (!requiredArrays.every(key => Array.isArray(backup.data[key]))) return false;
    if (!backup.data.settings || typeof backup.data.settings !== 'object') return false;
    if (!['people', 'groups', 'loanTypes', 'cards'].every(key => backup.data[key].every(value => typeof value === 'string'))) return false;
    if (!backup.data.loans.every(loan => loan && typeof loan.id === 'string' && typeof loan.person === 'string' && Number.isFinite(loan.capital))) return false;
    if (!backup.data.installments.every(item => item && typeof item.id === 'string' && typeof item.loanId === 'string' && Number.isFinite(item.amount) && Number.isFinite(item.paid))) return false;
    if (!backup.data.collections.every(item => item && typeof item.id === 'string' && Number.isFinite(item.amount))) return false;
    if (!backup.data.movements.every(item => item && typeof item.id === 'string' && Number.isFinite(item.amount) && ['in', 'out'].includes(item.direction))) return false;
    for (const key of ['cardFinancings', 'cardPayments']) if (backup.data[key] !== undefined && !Array.isArray(backup.data[key])) return false;
    if (!(backup.data.cardFinancings || []).every(item => item && typeof item.id === 'string' && Number.isFinite(item.receivedAmount) && Number.isFinite(item.totalToRepay) && Number.isFinite(item.paid))) return false;
    if (!(backup.data.cardPayments || []).every(item => item && typeof item.id === 'string' && typeof item.financingId === 'string' && Number.isFinite(item.amount))) return false;
    if (backup.data.historical !== undefined && (!Array.isArray(backup.data.historical) || !backup.data.historical.every(item => item && typeof item.id === 'string' && typeof item.label === 'string' && Number.isFinite(item.amount)))) return false;
    return true;
  }

  function mergeBackupData(current, incoming) {
    const merged = normalizeData(structuredClone(current));
    for (const key of ['loans', 'installments', 'collections', 'movements', 'cardFinancings', 'cardPayments', 'historical']) {
      const existingIds = new Set(merged[key].map(item => item.id));
      for (const item of incoming[key] || []) {
        if (!existingIds.has(item.id)) {
          merged[key].push(structuredClone(item));
          existingIds.add(item.id);
        }
      }
    }
    for (const key of ['people', 'groups', 'loanTypes', 'cards']) {
      const existingValues = new Set(merged[key].map(value => String(value).trim().toLocaleLowerCase()));
      for (const value of incoming[key]) {
        const normalized = String(value).trim().toLocaleLowerCase();
        if (normalized && !existingValues.has(normalized)) {
          merged[key].push(value);
          existingValues.add(normalized);
        }
      }
    }
    // Local settings win so importing a backup never overwrites existing preferences.
    merged.settings = { ...incoming.settings, ...merged.settings };
    return merged;
  }

  async function importBackup(file) {
    if (!file) return;
    let backup;
    try { backup = JSON.parse(await file.text()); } catch (_) { showToast('No se pudo leer el JSON.'); return; }
    if (!validateBackup(backup)) { showToast('El archivo no es un respaldo válido de Control de préstamos.'); return; }
    if (!window.confirm('La importación incorporará los datos del respaldo a los actuales, sin reemplazarlos. Los registros duplicados se omitirán. ¿Querés continuar?')) return;
    try {
      const merged = mergeBackupData(data, backup.data);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      data = merged;
      page = 'home'; render(); showToast('Respaldo incorporado; los duplicados se omitieron.');
    } catch (_) { showToast('No se pudo guardar el respaldo en este dispositivo.'); }
  }

  function changeSetting(form) {
    const key = form.dataset.key;
    const value = new FormData(form).get('value').trim();
    if (!['people', 'groups', 'loanTypes', 'cards'].includes(key) || !value) return;
    if (data[key].some(item => item.toLowerCase() === value.toLowerCase())) { showToast('Esa opción ya existe.'); return; }
    data[key].push(value); persist(); render(); showToast('Opción agregada.');
  }

  function notificationStatusText() {
    if (!('Notification' in window)) return 'Este navegador no ofrece notificaciones.';
    if (Notification.permission === 'granted' && data.settings.notificationsEnabled) return 'Los avisos están activados.';
    if (Notification.permission === 'denied') return 'El permiso está bloqueado en el navegador.';
    return 'Los avisos están desactivados.';
  }

  function notificationButtonText() {
    return ('Notification' in window && Notification.permission === 'granted' && data.settings.notificationsEnabled) ? 'Desactivar avisos' : 'Activar avisos de cobros';
  }

  async function registerServiceWorker() {
    if (!window.isSecureContext || !('serviceWorker' in navigator)) return null;
    try { return await navigator.serviceWorker.register('./sw.js'); } catch (_) { return null; }
  }

  async function enableNotifications() {
    if (data.settings.notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
      data.settings.notificationsEnabled = false; clearTimeout(notificationTimer); persist(); render(); showToast('Avisos desactivados.'); return;
    }
    if (!('Notification' in window)) { showToast('Este navegador no admite notificaciones.'); return; }
    if (!window.isSecureContext) { showToast('Los avisos requieren abrir la app desde GitHub Pages o como PWA segura.'); return; }
    if (Notification.permission === 'denied') { showToast('El permiso está bloqueado en la configuración del navegador.'); return; }
    let permission;
    try { permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission(); }
    catch (_) { showToast('El navegador no permitió solicitar notificaciones.'); return; }
    if (permission !== 'granted') { showToast('No se activaron los avisos.'); return; }
    data.settings.notificationsEnabled = true;
    persist();
    await registerServiceWorker();
    await checkDailyNotification();
    scheduleNotificationTimeCheck();
    render();
    showToast('Avisos de cobros activados.');
  }

  async function checkDailyNotification() {
    if (!data.settings.notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    const today = todayKey();
    if (data.settings.lastNotificationDate === today) return;
    const [notificationHour, notificationMinute] = String(data.settings.notificationTime || '09:00').split(':').map(Number);
    const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    if (currentMinutes < (notificationHour * 60 + notificationMinute)) return;
    const due = pendingInstallments().filter(item => item.dueDate === today);
    if (!due.length) return;
    const total = due.reduce((sum, item) => sum + dueLeft(item), 0);
    const options = { body: `Tenés ${due.length} cobros pendientes por un total de ${money(total)}.`, tag: `cobros-${today}`, data: { url: `?page=calendar&date=${today}` } };
    try {
      const registration = await registerServiceWorker();
      if (registration) await registration.showNotification('🔔 Cobros de hoy', options);
      else new Notification('🔔 Cobros de hoy', options);
      data.settings.lastNotificationDate = today;
      persist();
    } catch (_) { /* El permiso o el navegador pueden impedir mostrar el aviso. */ }
  }

  let midnightTimer;
  let notificationTimer;
  function scheduleNotificationTimeCheck() {
    clearTimeout(notificationTimer);
    if (!data.settings.notificationsEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;
    const [rawHour, rawMinute] = String(data.settings.notificationTime || '09:00').split(':');
    const hour = Math.max(0, Math.min(23, Number(rawHour) || 0));
    const minute = Math.max(0, Math.min(59, Number(rawMinute) || 0));
    const now = new Date();
    let nextCheck = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
    if (nextCheck <= now) nextCheck = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, hour, minute, 0);
    notificationTimer = setTimeout(() => { checkDailyNotification(); scheduleNotificationTimeCheck(); }, Math.max(1000, nextCheck.getTime() - Date.now()));
  }

  function scheduleDateRefresh() {
    clearTimeout(midnightTimer);
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    midnightTimer = setTimeout(() => {
      const oldToday = calendarSelectedDate === dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
      if (oldToday) calendarSelectedDate = todayKey();
      calendarMonth = new Date((parseDate(calendarSelectedDate) || new Date()).getFullYear(), (parseDate(calendarSelectedDate) || new Date()).getMonth(), 1);
      render(); checkDailyNotification(); scheduleDateRefresh();
    }, Math.max(1000, midnight.getTime() - Date.now()));
  }

  function refreshDateDependentViews() {
    if (calendarSelectedDate === todayKey() || page === 'home' || page === 'collections' || page === 'calendar') render();
    checkDailyNotification(); scheduleNotificationTimeCheck();
  }

  function showToast(message) {
    toastNode.textContent = message; toastNode.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastNode.classList.remove('show'), 2600);
  }

  document.addEventListener('click', event => {
    const pageButton = event.target.closest('[data-page]');
    if (pageButton) { page = pageButton.dataset.page; render(); return; }
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'new-loan') openLoanForm();
    else if (action === 'close-modal') closeModal();
    else if (action === 'loan-detail') openLoanDetail(button.dataset.id);
    else if (action === 'delete-loan') deleteLoan(button.dataset.id);
    else if (action === 'pay-installment') openPayForm(button.dataset.id);
    else if (action === 'loan-filter') { loanFilter = button.dataset.value; render(); }
    else if (action === 'movement-filter') { movementFilter = button.dataset.value; render(); }
    else if (action === 'month-prev' || action === 'month-next') {
      calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + (action === 'month-next' ? 1 : -1), 1);
      calendarSelectedDate = calendarMonth.getFullYear() === new Date().getFullYear() && calendarMonth.getMonth() === new Date().getMonth() ? todayKey() : dateKey(calendarMonth);
      render();
    }
    else if (action === 'calendar-day') {
      calendarSelectedDate = button.dataset.date; render();
    } else if (action === 'calendar-event') openCalendarEvent(button.dataset.kind, button.dataset.id);
    else if (action === 'calendar-collect') openPayForm(button.dataset.id);
    else if (action === 'calendar-pay-card') openCardPaymentForm(button.dataset.id);
    else if (action === 'new-movement') openMovementForm();
    else if (action === 'new-financing') openFinancingForm();
    else if (action === 'financing-detail') openFinancingDetail(button.dataset.id);
    else if (action === 'pay-card') openCardPaymentForm(button.dataset.id);
    else if (action === 'schedule-card-payment') openCardScheduleForm(button.dataset.id);
    else if (action === 'movement-detail') openMovementDetail(button.dataset.id);
    else if (action === 'realize-movement') realizeMovement(button.dataset.id);
    else if (action === 'enable-notifications') enableNotifications();
    else if (action === 'export-backup') exportBackup();
    else if (action === 'choose-import') document.querySelector('#backup-file')?.click();
    else if (action === 'remove-setting') {
      const key = button.dataset.key; const index = Number(button.dataset.index);
      if (['people', 'groups', 'loanTypes', 'cards'].includes(key) && Number.isInteger(index)) { data[key].splice(index, 1); persist(); render(); }
    }
  });

  document.addEventListener('submit', event => {
    const form = event.target.closest('[data-form="setting"]');
    if (!form) return;
    event.preventDefault(); changeSetting(form);
  });
  document.addEventListener('change', event => {
    if (event.target.id === 'backup-file') importBackup(event.target.files?.[0]);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeModal();
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.loan-card, .installment-card')) { event.preventDefault(); event.target.click(); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDateDependentViews(); });
  window.addEventListener('focus', refreshDateDependentViews);
  document.querySelector('#quick-add').addEventListener('click', openLoanForm);

  render();
  scheduleDateRefresh();
  registerServiceWorker().then(() => { checkDailyNotification(); scheduleNotificationTimeCheck(); });
})();
