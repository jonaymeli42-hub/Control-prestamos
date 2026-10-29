(() => {
  'use strict';

  const Link = window.FinancingLink;
  const F = window.ReceivedFinancing;
  const S = window.SalarySavings;
  const LC = window.LoanCancellation;
  const cancelledMovement = item => LC.context(data).isCancelled(item);
  let salaryMonth = todayKey().slice(0,7);
  let generalFilter='all';
  let movementSection='loans';
  let financingMonth=todayKey().slice(0,7);
  let summaryMonth=todayKey().slice(0,7);
  let futureAmountHidden=false;try{futureAmountHidden=localStorage.getItem('control-prestamos-future-hidden')==='true';}catch(_){}
  const STORAGE_KEY = 'control-prestamos-data';
  const THEME_STORAGE_KEY = 'control-prestamos-appearance';
  const VALID_THEMES = ['light', 'dark'];
  const BACKUP_FORMAT = 'control-prestamos-backup';
  const BACKUP_VERSION = 1;
  const LOAN_TYPES = ['1 cuota', 'Cuotas normales', 'Interés mensual + capital final', 'Préstamo corto semanal'];
  const HISTORICAL_TOTALS = [
    { id: 'plata-recibida', label: 'Plata recibida', amount: 36756484.70, direction: 'in' },
    { id: 'plata-recibida-prestamos-semanales', label: 'Plata recibida préstamos semanales', amount: 4894500.00, direction: 'in' },
    { id: 'plata-recibida-tarjetas', label: 'Plata recibida tarjetas', amount: 10200000.00, direction: 'in' },
    { id: 'plata-devuelta', label: 'Plata devuelta', amount: 11274000.00, direction: 'out' },
    { id: 'plata-para-prestamos', label: 'Plata para préstamos', amount: 33980000.00, direction: 'out' },
    { id: 'pagos-y-otros', label: 'Pagos y otros', amount: 1996984.70, direction: 'out' },
    { id: 'plata-para-prestamos-semanales', label: 'Plata para préstamos semanales', amount: 4600000.00, direction: 'out' }
  ];
  const INITIAL_DATA = {
    app: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    loans: [], installments: [], collections: [], movements: [], cardFinancings: [], cardPayments: [], futureHistory: [],
    historical: [...HISTORICAL_TOTALS],
    people: ['Harry', 'Semanal', 'Marcelo', 'Jano', '12 Brasas'],
    groups: ['H', 'S', 'M', 'J', '12B'],
    loanTypes: [...LOAN_TYPES],
    cards: ['VISA Galicia mia', 'Master galicia mia', 'NARANJA', 'VISA BNA', 'MASTER BNA', 'Otra'],
    settings: { currency: 'ARS', locale: 'es-AR', initialBalance: 0, notificationsEnabled: false, notificationTime: '09:00', lastNotificationDate: '' }
  };

  let data = loadData();
  let dataSnapshot = localStorage.getItem(STORAGE_KEY);
  const startupParams = new URLSearchParams(window.location.search);
  let page = ['home', 'loans', 'collections', 'calendar', 'movements', 'cards', 'more', 'salary', 'general'].includes(startupParams.get('page')) ? startupParams.get('page') : 'home';
  let calendarSelectedDate = parseDate(startupParams.get('date')) ? dateKey(startupParams.get('date')) : todayKey();
  let calendarMonth = new Date((parseDate(calendarSelectedDate) || new Date()).getFullYear(), (parseDate(calendarSelectedDate) || new Date()).getMonth(), 1);
  let calendarExpandedEvent = '';
  let loanFilter = 'Todos';
  let movementFilter = 'Todos';
  let projectionExpanded = false;
  let toastTimer;
  let pendingImport = null;

  const app = document.querySelector('#app');
  const modalRoot = document.querySelector('#modal-root');
  const toastNode = document.querySelector('#toast');

  function loadThemePreference() {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      return VALID_THEMES.includes(saved) ? saved : 'light';
    } catch (_) { return 'light'; }
  }

  let themePreference = loadThemePreference();

  function applyTheme() {
    const resolved = themePreference;
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
    document.body.dataset.theme = resolved;
    // Keep Android/browser chrome aligned with the selected appearance.
    document.documentElement.style.colorScheme = resolved;
    document.documentElement.style.backgroundColor = resolved === 'dark' ? '#141c28' : '#f5f7fb';
    let scheme = document.querySelector('meta[name="color-scheme"]');
    if (!scheme) { scheme = document.createElement('meta'); scheme.name = 'color-scheme'; document.head.append(scheme); }
    scheme.content = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#141c28' : '#f5f7fb');

    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#141c28' : '#f5f7fb');
    const themeToggle = document.querySelector('#theme-toggle');
    if (themeToggle) {
      const nextTheme = resolved === 'dark' ? 'light' : 'dark';
      themeToggle.textContent = resolved === 'dark' ? '☀' : '☾';
      themeToggle.setAttribute('aria-label', `Cambiar a tema ${nextTheme === 'dark' ? 'oscuro' : 'claro'}`);
      themeToggle.title = `Cambiar a tema ${nextTheme === 'dark' ? 'oscuro' : 'claro'}`;
    }
  }

  function toggleTheme() {
    themePreference = themePreference === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_STORAGE_KEY, themePreference); } catch (_) {}
    applyTheme();
  }

  applyTheme();

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
    for (const key of ['loans', 'installments', 'collections', 'movements', 'cardFinancings', 'cardPayments', 'people', 'groups', 'loanTypes', 'cards', 'historical', 'futureHistory']) {
      if (!Array.isArray(result[key])) result[key] = [...INITIAL_DATA[key]];
    }
    result.futureHistory = result.futureHistory.filter(validFutureRecord);
    result.settings = { ...INITIAL_DATA.settings, ...(value.settings || {}) };
    // The historical totals are fixed reference data. Migrate older saved totals to the definitive set.
    result.historical = structuredClone(HISTORICAL_TOTALS);
    if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(result.settings.notificationTime)) result.settings.notificationTime = INITIAL_DATA.settings.notificationTime;
    result.loans = result.loans.map(loan => ({ ...loan, disbursed: loan.disbursed !== false }));
    const recordedPayments = new Map();
    result.cardPayments.forEach(payment => recordedPayments.set(payment.financingId, roundMoney((recordedPayments.get(payment.financingId) || 0) + Number(payment.amount || 0))));
    result.cardFinancings = result.cardFinancings.map(financing => {
      const paymentTotal = recordedPayments.get(financing.id) || 0;
      const legacyPaid = Math.max(0, Number(financing.legacyPaid ?? (Number(financing.paid || 0) - paymentTotal)) || 0);
      const paid = roundMoney(legacyPaid + paymentTotal);
      const nextPaymentDate = F.isMonthly(financing) ? F.schedule({...financing,paid}).find(row=>row.remaining>0.005)?.date || '' : financing.nextPaymentDate;
      return { ...financing, nextPaymentDate, paid, legacyPaid, received: financing.historical === true || financing.received !== false, historical: financing.historical === true, payments: Array.isArray(financing.payments) ? financing.payments : [] };
    });
    if (result.cards.includes('Master Galicia mia') && !result.cards.includes('Master galicia mia')) {
      result.cards = result.cards.map(card => card === 'Master Galicia mia' ? 'Master galicia mia' : card);
    }
    result.app = BACKUP_FORMAT;
    result.version = BACKUP_VERSION;
    return result;
  }

  function persist() {
    if(localStorage.getItem(STORAGE_KEY)!==dataSnapshot)throw Error('Los datos cambiaron en otra ventana. Volvé a abrir la app antes de guardar.');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    dataSnapshot=localStorage.getItem(STORAGE_KEY);
    Link.reconcile(localStorage);
    window.DriveBackup?.changed();
    window.PushReminders?.changed();
  }

  function id() {
    return globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function normalizedName(value) { return String(value ?? '').trim().toLocaleLowerCase('es-AR'); }

  function money(value) {
    return new Intl.NumberFormat(data.settings.locale || 'es-AR', { style: 'currency', currency: data.settings.currency || 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value) || 0);
  }

  function parseMoney(value) {
    const digits = String(value ?? '').replace(/\D/g, '');
    return digits ? Number(digits) : NaN;
  }

  function parseInterestPercent(value) {
    const text = String(value ?? '').trim();
    if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return NaN;
    return Number(text.replace(',', '.'));
  }

  function formatInterestPercent(value) {
    return new Intl.NumberFormat('es-AR', { useGrouping: false, maximumFractionDigits: 10 }).format(Number(value) || 0);
  }

  function parseMovementAmount(value) {
    const text = String(value ?? '').trim();
    if (!/^(?:\d+(?:[.,]\d{1,2})?|[.,]\d{1,2})$/.test(text)) return NaN;
    return roundMoney(Number(text.replace(',', '.')));
  }

  function formatMovementAmount(value) {
    return new Intl.NumberFormat('es-AR', { useGrouping: false, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value) || 0);
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
    const status = loan.cancelled === true ? 'Anulado' : balance <= 0.005 ? 'Pagado' : paid > 0 ? 'Parcial' : 'Pendiente';
    return { installments, total, paid, balance, status, progress: total ? Math.min(100, paid / total * 100) : 0 };
  }

  function dueLeft(item) { return Math.max(0, item.amount - item.paid); }
  function pendingInstallments() {
    return data.installments.filter(item => {
      const loan = data.loans.find(record => record.id === item.loanId);
      return dueLeft(item) > 0.005 && (!loan || (loan.disbursed !== false && loan.cancelled !== true));
    });
  }
  function movementBalance() {
    return roundMoney(LC.activeData(data).movements.reduce((total, item) => {
      if (item.status === 'Pendiente' || item.status === 'Programado') return total;
      return total + (item.direction === 'in' ? item.amount : -item.amount);
    }, Number(data.settings.initialBalance) || 0));
  }
  function financingBalance(financing) {
    return roundMoney(Math.max(0, Number(financing.totalToRepay || 0) - Number(financing.paid || 0)));
  }
  function syncFinancingPaid(financing) {
    const payments = data.cardPayments.filter(item => item.financingId === financing.id);
    if (financing.legacyPaid === undefined) {
      const recorded = roundMoney(payments.reduce((sum, item) => sum + Number(item.amount || 0), 0));
      financing.legacyPaid = Math.max(0, Number(financing.paid || 0) - recorded);
    }
    financing.payments = payments.map(item => item.id);
    financing.paid = roundMoney(Number(financing.legacyPaid || 0) + payments.reduce((sum, item) => sum + Number(item.amount || 0), 0));
    if (F.isMonthly(financing)) financing.nextPaymentDate = F.schedule(financing).find(row => row.remaining > 0.005)?.date || '';
  }
  function syncFinancingReceiptMovement(financing) {
    const linked = data.movements.filter(item => item.cardFinancingId === financing.id && item.type === 'Tarjeta recibida');
    if (financing.historical) {
      data.movements = data.movements.filter(item => !linked.includes(item));
      financing.receivedMovementId = '';
      return;
    }
    let movement = linked[0];
    data.movements = data.movements.filter(item => !linked.slice(1).includes(item));
    if (!movement) {
      movement = { id: id(), createdAt: new Date().toISOString(), type: 'Tarjeta recibida', direction: 'in', cardFinancingId: financing.id };
      data.movements.unshift(movement);
    }
    financing.receivedMovementId = movement.id;
    Object.assign(movement, { date: financing.receivedDate, scheduledDate: financing.received ? '' : financing.receivedDate, description: `${financing.card} · Financiación recibida`, amount: financing.receivedAmount, status: financing.received ? 'Realizado' : 'Pendiente' });
  }
  function syncLoanDeliveryMovement(loan) {
    const linked = data.movements.filter(item => item.loanId === loan.id && ['Préstamo dado', 'Préstamo entregado'].includes(item.type));
    if (loan.historical) {
      data.movements = data.movements.filter(item => !linked.includes(item));
      return;
    }
    let movement = linked[0];
    data.movements = data.movements.filter(item => !linked.slice(1).includes(item));
    if (!movement) {
      movement = { id: id(), createdAt: new Date().toISOString(), type: 'Préstamo dado', direction: 'out', loanId: loan.id };
      data.movements.unshift(movement);
    }
    Object.assign(movement, { date: loan.deliveryDate, scheduledDate: loan.disbursed ? '' : loan.deliveryDate, person: loan.person, description: `${loan.code} · ${loan.mode}`, amount: loan.capital, status: loan.disbursed ? 'Realizado' : 'Pendiente' });
  }
  function cardDebtTotal() {
    return roundMoney(data.cardFinancings.filter(item => item.received !== false).reduce((sum, item) => sum + financingBalance(item), 0));
  }
  function receivableTotal() {
    return roundMoney(pendingInstallments().reduce((sum, item) => sum + dueLeft(item), 0));
  }
  function futureMoney() {
    return roundMoney(movementBalance() + receivableTotal() + S.reconcile(data.movements).pending - cardDebtTotal());
  }
  function validFutureRecord(item) {
    return item && typeof item.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date || '') && Number.isFinite(Date.parse(item.savedAt)) && Number.isFinite(item.amount) && ['automatic', 'manual'].includes(item.source);
  }

  function recordFutureAmount(source = 'automatic', now = new Date()) {
    const last = data.futureHistory.reduce((latest, item) => Math.max(latest, Date.parse(item.savedAt)), 0);
    if (source === 'automatic' && last && now.getTime() - last < 3 * 24 * 60 * 60 * 1000) return false;
    const record = { id: id(), date: dateKey(now), savedAt: now.toISOString(), amount: futureMoney(), source };
    const candidate = { ...data, futureHistory: [...data.futureHistory, record] };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(candidate));dataSnapshot=localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      showToast('No se pudo guardar el monto. Conservá una copia de tus datos.');
      return false;
    }
    data = candidate;
    window.DriveBackup?.changed();
    return true;
  }

  function openFutureHistory() {
    const records = data.futureHistory.slice().sort((a, b) => a.savedAt.localeCompare(b.savedAt));
    const rows = records.map((item, index) => {
      const previous = records[index - 1];
      const difference = previous ? roundMoney(item.amount - previous.amount) : null;
      const change = difference === null ? 'Primer registro' : `${difference > 0 ? '+' : difference < 0 ? '−' : ''}${money(Math.abs(difference))} respecto del anterior`;
      return `<article class="future-history-row"><div><b>${formatDate(item.date)}</b><small>${new Date(item.savedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} · ${item.source === 'manual' ? 'Manual' : 'Automático'}</small></div><strong>${money(item.amount)}</strong><p>${escapeHtml(change)}</p></article>`;
    }).reverse().join('');
    openModal('Historial del dinero a futuro', 'Montos guardados, del más reciente al más antiguo.', `<p class="subtle">Se guarda automáticamente al abrir la app si pasaron 3 días desde el último registro. Cada monto conserva el valor de ese momento.</p><button type="button" class="primary-button full" data-action="save-future-amount">Guardar monto ahora</button><div class="future-history-list">${rows || '<p class="subtle">Todavía no hay registros guardados.</p>'}</div>`);
  }

  function financingDues(financing) {
    if (F.isMonthly(financing)) return F.schedule(financing).filter(row => row.remaining > 0.005).map(row => ({date:row.date, amount:row.remaining, number:row.number}));
    return financingBalance(financing) > 0.005 ? [{date:financing.nextPaymentDate || '', amount:financingBalance(financing)}] : [];
  }

  function futureProjection() {
    const salaryPending=S.reconcile(data.movements).pending;
    const start = parseDate(todayKey());
    const current = movementBalance();
    const receivables = pendingInstallments();
    const payables = data.cardFinancings.filter(item => item.received !== false && financingBalance(item) > 0.005).flatMap(financingDues);
    const datedItems = [
      ...receivables.map(item => item.dueDate),
      ...payables.map(item => item.date)
    ].map(parseDate).filter(Boolean);
    let periodCount = 12;
    datedItems.forEach(date => {
      const difference = (date.getFullYear() - start.getFullYear()) * 12 + date.getMonth() - start.getMonth();
      periodCount = Math.max(periodCount, difference + 1);
    });
    const undatedReceivables = receivables.filter(item => !parseDate(item.dueDate)).reduce((sum, item) => sum + dueLeft(item), 0);
    const undatedPayables = payables.filter(item => !parseDate(item.date)).reduce((sum, item) => sum + item.amount, 0);
    return Array.from({ length: periodCount }, (_, index) => {
      const endDate = dateKey(new Date(start.getFullYear(), start.getMonth() + index + 1, 0));
      const collected = receivables.filter(item => parseDate(item.dueDate) && dateKey(item.dueDate) <= endDate).reduce((sum, item) => sum + dueLeft(item), 0);
      const datedObligations = payables.filter(item => parseDate(item.date) && dateKey(item.date) <= endDate).reduce((sum, item) => sum + item.amount, 0);
      const cumulativeCollections = roundMoney(collected + (index === periodCount - 1 ? undatedReceivables : 0));
      const obligations = roundMoney(datedObligations + (index === periodCount - 1 ? undatedPayables : 0));
      return {
        label: new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(start.getFullYear(), start.getMonth() + index, 1)).replace(/^./, letter => letter.toLocaleUpperCase('es-AR')),
        current,
        salaryPending,
        collected: cumulativeCollections,
        obligations,
        available: roundMoney(current + salaryPending + cumulativeCollections - obligations)
      };
    });
  }
  function movementCategory(item) {
    if(S.isTransfer(item)) return 'salary';
    if (item.type === 'Cobro préstamo') {
      const payment = data.collections.find(row => row.id === item.collectionId);
      const installment = payment && data.installments.find(row => row.id === payment.installmentId);
      return installment && Number(payment.amount) < Number(installment.amount) ? 'partial-payments' : 'cobros';
    }
    if (item.type === 'Préstamo dado' || item.type === 'Préstamo entregado') return 'loans-out';
    if (['Ingreso general', 'Aporte propio', 'Plata recibida'].includes(item.type)) return 'income';
    if (['Gasto general', 'Devolución', 'Pago/Otros'].includes(item.type)) return 'expenses';
    return 'cards';
  }
  function displayMovementType(item) {
    if(cancelledMovement(item))return `${item.type} · Anulado (fuera del saldo)`;
    const financing = item.cardFinancingId && data.cardFinancings.find(f => f.id === item.cardFinancingId);
    if (F.isMonthly(financing)) return item.cardPaymentId ? 'Financiación pagada' : 'Financiación recibida';
    return item.type === 'Préstamo entregado' ? 'Préstamo dado' : item.type;
  }
  function movementDisplayDate(item) {
    return ['Pendiente', 'Programado'].includes(item.status) ? item.scheduledDate || item.dueDate || item.date : item.date;
  }

  function badge(status, dueDate) {
    const overdue = status !== 'Pagado' && dueDate && dueDate < todayKey();
    const className = status === 'Anulado' ? 'cancelled' : status === 'Pagado' ? 'paid' : overdue ? 'overdue' : status === 'Parcial' ? 'partial' : 'pending';
    return `<span class="badge ${className}">${overdue ? 'Vencida' : escapeHtml(status)}</span>`;
  }

  function emptyState(icon, title, text, action = '') {
    return `<div class="empty-state"><div class="empty-icon" aria-hidden="true">${icon}</div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p>${action}</div>`;
  }

  function pageHeading(title, subtitle, extra = '') {
    return `<div class="page-heading"><div><h2>${title}</h2><p>${subtitle}</p></div>${extra}</div>`;
  }

  function render() {
    document.getElementById("quick-add").hidden = page === "home";
    document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.page === (page==='salary'?'general':page)));
    const views = { home: renderHome, loans: renderLoans, collections: renderCollections, calendar: renderCalendar, movements: renderMovements, cards: renderCards, more: renderMore, salary: renderSalarySavings, general: renderSalarySavings };
    app.innerHTML = (views[page] || renderHome)();
  }

  function renderHome() {
    const allPending = pendingInstallments().sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const receivable = allPending.reduce((sum, item) => sum + dueLeft(item), 0);
    const payable = cardDebtTotal();
    const current = movementBalance();
    const future = futureMoney();
    const salary=S.reconcile(data.movements),salaryThisMonth=S.monthly(data.movements,todayKey().slice(0,7));
    const projection = futureProjection();
    return `${pageHeading('Buen día', 'Este es el estado de tus préstamos.', `<span class="date-pill">${formatDate(todayKey(), { day: 'numeric', month: 'short', year: 'numeric' })}</span>`)}
      <section class="summary-grid home-summary" aria-label="Resumen de dinero">
        <article class="summary-card current"><span class="label">Dinero actual</span><span class="amount">${money(current)}</span><span class="hint">Según tus movimientos</span></article>
        <article class="summary-card future"><button type="button" class="future-visibility-toggle" data-action="toggle-future-visibility" aria-label="${futureAmountHidden?'Mostrar':'Ocultar'} dinero a futuro" aria-pressed="${futureAmountHidden}"><span class="label">Dinero a futuro</span><span class="amount">${futureAmountHidden?'$ ••••••':money(future)}</span><svg class="balance-eye" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${futureAmountHidden?'<path d="m3 3 18 18"/>':''}</svg></button><button type="button" class="history-link future-history-link" data-action="future-history">Ver historial ›</button></article>
        <article class="summary-card receivable"><span class="label">A recibir</span><span class="amount">${money(receivable)}</span><span class="hint">Saldo de cuotas pendientes</span></article>
        <article class="summary-card payable"><span class="label">A pagar de financiaciones</span><span class="amount">${money(payable)}</span><span class="hint">Saldo pendiente de financiación</span></article>
      </section>
      ${data.loans.some(l=>l.cancelled===true)?`<div class="alert loan-cancelled-notice">${data.loans.filter(l=>l.cancelled===true).length} préstamo(s) anulado(s): sus entregas, cobros y cuotas no se incluyen en estos importes. <button type="button" class="text-button" data-action="view-cancelled-loans">Ver anulados</button></div>`:''}<div class="home-add-actions"><button type="button" class="primary-button home-add-loan" data-action="new-loan" aria-label="Agregar préstamo"><span aria-hidden="true">＋</span> Préstamo</button><button type="button" class="secondary-button home-add-financing" data-action="new-financing" aria-label="Agregar financiación"><span aria-hidden="true">＋</span> Financiación</button><button type="button" class="secondary-button home-add-income" data-action="new-income" aria-label="Agregar ingreso"><span aria-hidden="true">＋</span> Ingreso</button></div>
      <section class="section home-salary"><div class="card salary-outstanding"><div class="home-salary-heading"><h3>El sueldo debe devolver</h3><strong class="amount">${money(salary.pending)}</strong></div><p class="subtle">Ya incluido en Dinero a futuro; no disponible aún.</p><div class="home-salary-footer"><span>Ahorro nuevo del mes: <b>${money(salaryThisMonth.saved)}</b></span><button class="text-button" data-page="movements" data-section="general">Ver pases ›</button></div></div></section>
      <section class="section projection-section"><div class="section-head"><div><h3>Proyección mensual acumulada</h3><p class="subtle">Dinero disponible estimado al cierre de cada mes.</p></div><button class="text-button" data-action="toggle-projection">${projectionExpanded ? 'Mostrar menos' : 'Mostrar más'}</button></div><div class="projection-list">${projection.slice(0, projectionExpanded ? projection.length : 1).map(period => `<article class="projection-card"><h4>${escapeHtml(period.label)}</h4><div class="projection-values"><div><span>Dinero actual</span><strong>${money(period.current)}</strong></div><div><span>+ Pendiente del sueldo</span><strong>${money(period.salaryPending)}</strong></div><div><span>+ Cobros acumulados</span><strong>${money(period.collected)}</strong></div><div><span>− Obligaciones acumuladas</span><strong>${money(period.obligations)}</strong></div></div><div class="projection-total"><span>Disponible al llegar a ${escapeHtml(period.label)}</span><strong>${money(period.available)}</strong></div></article>`).join('')}</div><details class="projection-help"><summary>Cómo se calcula</summary><p class="projection-note">La proyección parte del dinero actual e incluye la devolución pendiente del sueldo, estimada para el cierre de este mes. Aún no es dinero disponible. Acumula cuotas y financiaciones según sus vencimientos. Los cobros u obligaciones sin fecha definida se incluyen en el último mes proyectado.</p></details></section>
      `;
  }

  function renderSalarySavings() {
    const summary=S.monthly(data.movements,salaryMonth);
    const salaryState=S.reconcile(data.movements);
    const generalRows=data.movements.filter(row=>isManualMovement(row)&&movementDisplayDate(row).slice(0,7)===salaryMonth).sort((a,b)=>movementDisplayDate(a).localeCompare(movementDisplayDate(b))||(a.createdAt||'').localeCompare(b.createdAt||''));
    const visible=generalRows.filter(row=>generalFilter==='all'||(generalFilter==='salary'?S.isTransfer(row):row.type===(generalFilter==='income'?'Ingreso general':'Gasto general')));
    const generalTotal=type=>roundMoney(generalRows.filter(row=>row.type===type&&!['Pendiente','Programado'].includes(row.status)).reduce((sum,row)=>sum+row.amount,0));
    return `${pageHeading('Generales','Ingresos, pagos y pases con tu sueldo, separados de préstamos y financiaciones.','<button class="text-button" data-page="home">Volver al inicio</button>')}
      <label class="field">Mes<input id="salary-month" type="month" value="${escapeHtml(salaryMonth)}"></label>
      <section class="card kv-list"><h3>Sueldo ↔ Préstamos</h3><div class="kv"><span>Pendiente de devolver del sueldo<small class="salary-period-note">Hasta el mes seleccionado</small></span><b>${money(summary.pending)}</b></div><div class="kv"><span>Devuelto este mes</span><b>${money(summary.repaid)}</b></div><div class="kv"><span>Ahorro nuevo del mes</span><b class="movement-in">${money(summary.saved)}</b></div></section>
      <p class="subtle">El pendiente pasa al mes siguiente hasta que lo devuelvas. Una devolución no aumenta otra vez el dinero a futuro; el ahorro nuevo sí.</p>
      <div class="salary-actions"><button class="secondary-button" data-action="salary-out">De Préstamos a sueldo</button><button class="secondary-button salary-return" data-action="salary-return">Devolver a Préstamos</button><button class="primary-button" data-action="salary-save">＋ Agregar ahorro nuevo</button><button class="secondary-button" data-action="salary-detail">Ver detalle</button></div>
      <p class="subtle">Al devolver, se cubre primero lo que debe el sueldo. Si ingresás más, el excedente se registra como ahorro nuevo. Los pases anteriores «Sueldo → Préstamos» siguen esta misma regla por fecha, sin duplicarlos.</p><p class="subtle">Cada pase modifica el dinero actual de Préstamos. No se registra automáticamente en Control Gastos.</p>
      <section class="card kv-list"><div class="kv"><span>Ingresos generales realizados</span><b>${money(generalTotal('Ingreso general'))}</b></div><div class="kv"><span>Pagos generales realizados</span><b>${money(generalTotal('Gasto general'))}</b></div><button class="secondary-button full" data-action="new-movement">＋ Ingreso o pago general</button></section>
      <section class="section" id="salary-details"><h3>Detalle del mes</h3><div class="filter-row">${[['all','Todos'],['salary','Pases con el sueldo'],['income','Ingresos'],['expense','Pagos']].map(([value,label])=>`<button class="filter-chip ${generalFilter===value?'active':''}" data-action="general-filter" data-value="${value}">${label}</button>`).join('')}</div>${visible.length?visible.map(row=>`<button class="card full salary-transfer-row" data-action="movement-detail" data-id="${escapeHtml(row.id)}"><span><strong>${escapeHtml(row.type)}</strong><small>${formatDate(movementDisplayDate(row))} · ${escapeHtml(row.description)}${['Pendiente','Programado'].includes(row.status)?' · Programado':''}</small>${S.isTransfer(row)?`<small>${escapeHtml(S.allocationText(salaryState.allocations.find(a=>a.id===row.id),money))}</small>`:''}</span><b class="${row.direction==='in'?'movement-in':'movement-out'}">${row.direction==='in'?'+':'−'}${money(row.amount)}</b></button>`).join(''):'<p class="subtle">No hay movimientos generales para este mes y filtro.</p>'}</section>`;
  }

  function renderUpcomingCollections(installments, dates) {
    if (!dates.length) return emptyState('↗', 'Todavía no hay cobros', 'Al registrar un préstamo, sus próximas cuotas aparecerán acá.');
    return `<div class="upcoming-collections">${dates.map(date => `<div class="upcoming-collection-group"><div class="upcoming-date">${formatDate(date, { day: 'numeric', month: 'long' })}</div><div class="upcoming-collection-list">${installments.filter(item => item.dueDate === date).map(item => {
      const loan = data.loans.find(record => record.id === item.loanId);
      if (!loan) return '';
      const count = loanInstallments(loan.id).length || Number(loan.count) || 1;
      const installmentLabel = count > 1 ? ` · Cuota ${item.number} de ${count}` : '';
      const partialLabel = item.paid > 0.005 ? ' · Parcial' : '';
      return `<div class="upcoming-collection-row"><button class="upcoming-collection-main" data-action="loan-detail" data-id="${escapeHtml(loan.id)}"><span><b>${escapeHtml(loan.code || 'Préstamo')} · ${escapeHtml(loan.person)}</b><small>${installmentLabel || 'Próximo cobro'}${partialLabel}</small></span><strong>${money(dueLeft(item))}</strong></button><button class="text-button upcoming-pay-button" data-action="pay-installment" data-id="${escapeHtml(item.id)}">Cobrar</button></div>`;
    }).join('')}</div></div>`).join('')}</div>`;
  }

  function renderLoanCard(loan) {
    const totals = loanTotals(loan);
    const next = !loan.cancelled && totals.installments.find(item => dueLeft(item) > 0);
    return `<article class="card loan-card ${loan.cancelled?'loan-is-cancelled':''}" data-action="loan-detail" data-id="${escapeHtml(loan.id)}" tabindex="0" role="button" aria-label="Ver préstamo ${escapeHtml(loan.code)} de ${escapeHtml(loan.person)}">
      <div class="row-top"><div><div class="person">${escapeHtml(loan.person)} <span class="subtle">· ${escapeHtml(loan.code)}</span></div><div class="subtle">${escapeHtml(loan.mode)}</div></div>${badge(totals.status)}</div>${loan.cancelled?'<p class="subtle">Registro conservado · excluido del saldo y del dinero a futuro.</p>':''}
      <div class="inline-details"><span>Capital <b>${money(loan.capital)}</b></span><span>Total <b>${money(totals.total)}</b></span><span>Saldo <b>${money(totals.balance)}</b></span><span>Cobrado <b>${money(totals.paid)}</b></span></div>${next ? `<div class="subtle loan-next">Próxima cuota: ${next.number} de ${loan.count || totals.installments.length} · ${formatDate(next.dueDate)} · ${money(dueLeft(next))}</div>` : ''}
      <div class="progress"><span style="width:${totals.progress}%"></span></div><div class="progress-meta"><span>Cobrado ${money(totals.paid)}</span><span>${Math.round(totals.progress)}%</span></div></article>`;
  }

  function renderInstallmentCard(item, compact = false) {
    const loan = data.loans.find(record => record.id === item.loanId);
    if (!loan) return '';
    const left = dueLeft(item);
    return `<article class="card installment-card"><div class="row-top"><div><div class="person">${escapeHtml(loan.person)} <span class="subtle">· ${escapeHtml(loan.code)}</span></div><div class="subtle">Cuota ${item.number} · vence ${formatDate(item.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })}</div></div><div class="amount">${money(item.amount)}</div></div>
      <div class="row" style="margin-top:10px">${badge(item.paid > 0 ? 'Parcial' : 'Pendiente', item.dueDate)}<span class="subtle">Pagado ${money(item.paid)} · Pendiente ${money(left)}</span><button class="text-button" data-action="pay-installment" data-id="${escapeHtml(item.id)}">Cobrar</button></div></article>`;
  }

  function renderLoans() {
    const loans = data.loans.filter(loan => loanFilter === 'Todos' || loanTotals(loan).status === loanFilter);
    return `${pageHeading('Préstamos', `${data.loans.length} en total`, '')}
      <div class="filter-row">${['Todos', 'Pendiente', 'Parcial', 'Pagado', 'Anulado'].map(filter => `<button class="filter-chip ${loanFilter === filter ? 'active' : ''}" data-action="loan-filter" data-value="${filter}">${filter}</button>`).join('')}</div>
      ${loans.length ? `<div class="list">${loans.map(renderLoanCard).join('')}</div>` : emptyState('▤', 'No hay préstamos', 'Usá el botón + superior para crear un préstamo.')}`;
  }

  function renderCollections() {
    const pending = pendingInstallments().sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.number - b.number);
    const total = pending.reduce((sum, item) => sum + dueLeft(item), 0);
    const overdue = pending.filter(item => item.dueDate < todayKey()).reduce((sum, item) => sum + dueLeft(item), 0);
    const next = pending.find(item => item.dueDate >= todayKey()) || pending[0];
    return `${pageHeading('Cobros', `${pending.length} cuotas pendientes`, `<span class="date-pill">${money(total)} por cobrar</span>`)}
      <section class="summary-grid collections-summary"><article class="summary-card receivable"><span class="label">Total pendiente</span><span class="amount">${money(total)}</span></article><article class="summary-card payable"><span class="label">Total vencido</span><span class="amount">${money(overdue)}</span></article><article class="summary-card future"><span class="label">Próximo cobro</span><span class="amount">${next ? money(dueLeft(next)) : money(0)}</span><span class="hint">${next ? formatDate(next.dueDate, { day: 'numeric', month: 'short', year: 'numeric' }) : 'Sin cobros próximos'}</span></article></section>
      ${pending.length ? `<div class="list">${pending.map(item => renderInstallmentCard(item)).join('')}</div>` : emptyState('✓', 'Todo al día', 'No quedan cuotas pendientes de cobro.')}`;
  }

  function calendarEvents() {
    const financingCalendar=window.FinancingCalendar.build(data.cardFinancings,data.cardPayments,F);
    const events = [...financingCalendar.events];
    pendingInstallments().forEach(item => {
      const loan = data.loans.find(record => record.id === item.loanId);
      if (loan) events.push({ id: item.id, kind: 'installment', date: item.dueDate, amount: dueLeft(item), label: `Cobro de cuota ${item.number}`, detail: `${loan.person} · ${loan.code}` });
    });
    const movementContext=LC.context(data);
    data.movements.forEach(item => {
      if(movementContext.isCancelled(item))return;
      const payment=item.cardPaymentId&&data.cardPayments.find(p=>p.id===item.cardPaymentId);
      if(payment&&financingCalendar.coveredFinancingIds.has(payment.financingId))return;
      const date = movementDisplayDate(item);
      if (!date) return;
      if (item.collectionId) {
        const collection = data.collections.find(record => record.id === item.collectionId);
        const installment = collection && data.installments.find(record => record.id === collection.installmentId);
        if (installment && dueLeft(installment) <= 0.005) return;
      }
      const kind = item.collectionId || /cobro/i.test(item.type || '')
        ? 'collection'
        : item.loanId && ['Préstamo dado', 'Préstamo entregado'].includes(item.type)
          ? 'delivery'
          : item.cardFinancingId || item.cardPaymentId ? 'card-transaction'
            : item.direction === 'in' ? 'income' : 'expense';
      events.push({ id: item.id, kind, date, amount: item.amount, financingId:financingForMovement(item)?.id, status: item.status || (kind === 'collection' ? 'Cobrado' : ''), label: displayMovementType(item), detail: item.person || item.description || (item.direction === 'in' ? 'Ingreso general' : 'Gasto general') });
    });
    const unique = new Map();
    events.filter(event => parseDate(event.date)).forEach(event => unique.set(`${event.kind}:${event.id}:${event.date}`, event));
    return [...unique.values()].sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
  }

  function calendarLoanInstallments(date) {
    return data.installments.filter(item => {
      if (item.dueDate !== date) return false;
      const loan = data.loans.find(record => record.id === item.loanId);
      return Boolean(loan && loan.disbursed !== false && !loan.cancelled);
    }).sort((a, b) => a.number - b.number);
  }

  function calendarReferenceClass(event) {
    if (event.label === 'Financiación recibida') return 'card-ref';
    if (event.kind === 'income') return 'income-ref';
    if (event.kind === 'expense') return 'expense-ref';
    if (event.kind === 'card-payment' || event.kind === 'card-transaction') return ['Realizado', 'Pagado', 'Pagada'].includes(event.status) ? 'loan-paid-ref' : 'card-ref';
    let installment = event.kind === 'installment' ? data.installments.find(item => item.id === event.id) : null;
    if (!installment) {
      const movement = data.movements.find(item => item.id === event.id);
      const collection = movement?.collectionId && data.collections.find(item => item.id === movement.collectionId);
      installment = collection && data.installments.find(item => item.id === collection.installmentId);
    }
    if (installment) {
      if (dueLeft(installment) <= 0.005) return 'loan-paid-ref';
      return installment.dueDate < todayKey() ? 'loan-overdue-ref' : 'loan-pending-ref';
    }
    if (event.kind === 'delivery') return ['Pendiente', 'Programado'].includes(event.status) ? 'loan-pending-ref' : 'loan-paid-ref';
    if (event.kind === 'collection') return ['Pendiente', 'Programado'].includes(event.status) ? 'loan-pending-ref' : 'loan-paid-ref';
    return 'movement-ref';
  }

  function calendarEventReference(event) {
    if (event.kind === 'card-payment' || event.kind === 'card-transaction') return event.detail.split(' · ')[0] || 'Tarjeta';
    if (event.kind === 'installment') {
      const installment = data.installments.find(item => item.id === event.id);
      const loan = installment && data.loans.find(item => item.id === installment.loanId);
      if (!loan || !installment) return event.detail || event.label;
      const count = loanInstallments(loan.id).length || Number(loan.count) || 1;
      return count <= 1 ? (loan.code || 'Préstamo') : `${loan.code || 'Préstamo'} · C${installment.number}/${count}`;
    }
    const movement = data.movements.find(item => item.id === event.id);
    const loan = movement?.loanId && data.loans.find(item => item.id === movement.loanId);
    if (loan) {
      const collection = movement.collectionId && data.collections.find(item => item.id === movement.collectionId);
      const installment = collection && data.installments.find(item => item.id === collection.installmentId);
      if (installment) {
        const count = loanInstallments(loan.id).length || Number(loan.count) || 1;
        return count <= 1 ? (loan.code || 'Préstamo') : `${loan.code || 'Préstamo'} · C${installment.number}/${count}`;
      }
      return `${loan.code || 'Préstamo'} · ${event.kind === 'delivery' ? 'Entrega' : 'Cobro'}`;
    }
    return event.label || event.detail || 'Movimiento';
  }

  function renderCalendarInstallment(item) {
    const loan = data.loans.find(record => record.id === item.loanId);
    if (!loan) return '';
    const paid = dueLeft(item) <= 0.005;
    const left = dueLeft(item);
    const displayedAmount = paid ? item.amount : left;
    const key = `installment:${item.id}`;
    const expanded = calendarExpandedEvent === key;
    const totals = loanTotals(loan);
    const status = paid ? 'Pagada' : item.paid > 0.005 ? 'Parcial' : item.dueDate < todayKey() ? 'Vencida' : 'Pendiente';
    return `<article class="card calendar-collection-card event-loan ${expanded ? 'expanded' : ''}"><button class="calendar-event-toggle" data-action="calendar-event" data-kind="installment" data-id="${escapeHtml(item.id)}" aria-expanded="${expanded}"><span><strong>${escapeHtml(loan.code || 'Préstamo')} · ${escapeHtml(loan.person)}</strong><small>Cuota ${item.number} de ${loan.count || loanInstallments(loan.id).length} · ${formatDate(item.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })}</small></span><span class="calendar-event-summary"><b>${money(displayedAmount)}</b><i class="badge ${paid ? 'paid' : item.paid > 0.005 ? 'partial' : item.dueDate < todayKey() ? 'overdue' : 'pending'}">${status}</i></span></button>${expanded ? `<div class="calendar-event-expanded"><div class="kv-list"><div class="kv"><span>Préstamo / persona</span><b>${escapeHtml(loan.code || 'Préstamo')} · ${escapeHtml(loan.person)}</b></div><div class="kv"><span>Modalidad</span><b>${escapeHtml(loan.mode)}</b></div><div class="kv"><span>Capital prestado</span><b>${money(loan.capital)}</b></div><div class="kv"><span>Cuota</span><b>${item.number} de ${loan.count || loanInstallments(loan.id).length}</b></div><div class="kv"><span>Fecha</span><b>${formatDate(item.dueDate, { day: 'numeric', month: 'long', year: 'numeric' })}</b></div><div class="kv"><span>Importe a cobrar</span><b>${money(item.amount)}</b></div><div class="kv"><span>Total del préstamo</span><b>${money(totals.total)}</b></div><div class="kv"><span>Saldo pendiente del préstamo</span><b>${money(totals.balance)}</b></div><div class="kv"><span>Estado de la cuota</span><b>${status}</b></div></div><button class="secondary-button full" data-action="view-loan" data-id="${escapeHtml(loan.id)}">Ver préstamo</button>${!paid && loan.disbursed !== false ? `<button class="primary-button full" data-action="calendar-collect" data-id="${escapeHtml(item.id)}">✓ Registrar cobro</button>` : ''}</div>` : ''}</article>`;
  }

  function renderCalendarEvent(event) {
    const financing=event.financingId&&data.cardFinancings.find(f=>f.id===event.financingId);
    const label = ({ delivery: 'Entrega', income: 'Ingreso', expense: 'Gasto / pago', 'card-payment': 'Vencimiento financiación', 'card-transaction': 'Movimiento tarjeta', movement: 'Movimiento' })[event.kind] || 'Cobro';
    const key = `${event.kind}:${event.id}`;
    const expanded = calendarExpandedEvent === key;
    const state = event.status || (event.kind === 'card-payment' ? 'Pendiente' : event.kind === 'delivery' ? 'Realizado' : 'Registrado');
    const receivedFinancing = event.label === 'Financiación recibida';
    const titleClass = receivedFinancing ? 'calendar-financing-title' : event.label === 'Préstamo dado' ? 'calendar-delivery-title' : '';
    const completedCard = !receivedFinancing && ['card-payment', 'card-transaction'].includes(event.kind) && ['Realizado', 'Pagado', 'Pagada'].includes(state);
    const paymentDetail=event.kind==='card-payment'?`<div class="kv"><span>Importe del vencimiento</span><b>${money(event.originalAmount)}</b></div><div class="kv"><span>Pagado</span><b>${money(event.paidAmount)}</b></div><div class="kv"><span>Pendiente</span><b>${money(event.remaining)}</b></div>${(event.paymentDetails||[]).map(p=>`<div class="kv"><span>Fecha real del pago: ${formatDate(p.date)}</span><b>${money(p.amount)}</b></div>`).join('')}${event.legacyPaid>0?`<p class="subtle">${money(event.legacyPaid)} pagados antes del historial detallado, sin fecha registrada.</p>`:''}`:'';
    const colorKind = ['card-payment', 'card-transaction'].includes(event.kind) ? 'card' : ['income', 'expense', 'movement'].includes(event.kind) ? 'movement' : 'loan';
    return `<article class="card calendar-event-card event-${colorKind} ${expanded ? 'expanded' : ''}"><button class="calendar-event-toggle" data-action="calendar-event" data-kind="${event.kind}" data-id="${escapeHtml(event.id)}" aria-expanded="${expanded}"><span><strong class="${titleClass}">${escapeHtml(event.label)}</strong><small>${escapeHtml(event.detail)} · ${formatDate(event.date, { day: 'numeric', month: 'short' })} · ${label}</small>${financingDescriptionPreview(financing)}</span><span class="calendar-event-summary"><b>${money(event.amount)}</b><i class="badge ${receivedFinancing && state === 'Realizado' ? 'financing-received' : completedCard ? 'paid' : state==='Parcial' ? 'partial' : ''}">${escapeHtml(state)}</i></span></button>${expanded ? `<div class="calendar-event-expanded"><div class="kv-list"><div class="kv"><span>Nombre / identificador</span><b>${escapeHtml(event.detail)}</b></div><div class="kv"><span>Tipo</span><b>${label}</b></div><div class="kv"><span>Fecha</span><b>${formatDate(event.date, { day: 'numeric', month: 'long', year: 'numeric' })}</b></div><div class="kv"><span>Importe</span><b>${money(event.amount)}</b></div><div class="kv"><span>Estado</span><b>${escapeHtml(state)}</b></div>${paymentDetail}</div>${financingDescriptionBlock(financing)}<button class="secondary-button full" data-action="calendar-event-detail" data-kind="${event.kind}" data-id="${escapeHtml(event.id)}">Ver detalle completo ›</button></div>` : ''}</article>`;
  }

  function openCalendarEvent(kind, eventId) {
    if (kind === 'installment') {
      const item = data.installments.find(record => record.id === eventId);
      const loan = item && data.loans.find(record => record.id === item.loanId);
      if (!item || !loan || dueLeft(item) <= 0.005) return;
      openModal('Cobro de cuota', `${loan.person} · ${loan.code}`, `<div class="card kv-list"><div class="kv"><span>Vencimiento</span><b>${formatDate(item.dueDate, { day: 'numeric', month: 'long', year: 'numeric' })}</b></div><div class="kv"><span>Cuota</span><b>${item.number}</b></div><div class="kv"><span>Saldo</span><b>${money(dueLeft(item))}</b></div></div><button class="primary-button full" style="margin-top:14px" data-action="calendar-collect" data-id="${escapeHtml(item.id)}">Marcar cobrado</button>`);
    } else if (['movement', 'delivery', 'collection', 'income', 'expense', 'card-transaction'].includes(kind)) openMovementDetail(eventId);
    else if (kind === 'card-payment') {
      const [financingId] = eventId.split('::');
      const financing = data.cardFinancings.find(record => record.id === financingId);
      if (!financing) return;
      openFinancingDetail(financing.id);
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
    const allLoanInstallments = data.installments.filter(item => data.loans.some(loan => loan.id === item.loanId && loan.disbursed !== false && !loan.cancelled)).map(item => ({ id: item.id, kind: 'installment', number: item.number, date: item.dueDate, amount: dueLeft(item) > 0.005 ? dueLeft(item) : item.amount, label: `Cuota ${item.number}`, detail: `${data.loans.find(loan => loan.id === item.loanId)?.code || 'Préstamo'} · ${data.loans.find(loan => loan.id === item.loanId)?.person || ''}` }));
    const calendarItems = [...events.filter(event => event.kind !== 'installment'), ...allLoanInstallments].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'installment' ? 0 : 1) - (b.kind === 'installment' ? 0 : 1) || (a.number || 0) - (b.number || 0) || a.label.localeCompare(b.label));
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
      const classes = ['calendar-day', !inMonth ? 'other' : '', key === todayKey() ? 'today' : '', key === calendarSelectedDate ? 'selected' : ''].filter(Boolean).join(' ');
      const summaries = dayEvents.slice(0, 2).map(event => {
        const type = calendarReferenceClass(event);
        return `<span class="calendar-ref ${type}">${escapeHtml(calendarEventReference(event))}</span>`;
      }).join('');
      return `<button class="${classes}" data-action="calendar-day" data-date="${key}" ${!inMonth ? 'disabled' : ''}><span class="calendar-date-number">${date.getDate()}</span>${summaries ? `<span class="calendar-ref-list">${summaries}${count > 2 ? `<span class="calendar-more">+${count - 2}</span>` : ''}</span>` : ''}</button>`;
    }).join('');
    const selectedItems = calendarItems.filter(event => event.date === calendarSelectedDate);
    const hasSelectedItems = selectedItems.length;
    return `${pageHeading('Calendario', 'Eventos vinculados a préstamos, financiaciones y movimientos.', `<span class="date-pill">HOY · ${formatDate(todayKey(), { day: 'numeric', month: 'short' })}</span>`)}
      <section class="calendar"><div class="calendar-head"><button aria-label="Mes anterior" data-action="month-prev">‹</button><strong>${new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(calendarMonth)}</strong><button aria-label="Mes siguiente" data-action="month-next">›</button><button class="secondary-button today-button" data-action="calendar-today">HOY</button></div>
      <div class="calendar-grid">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(day => `<div class="weekday">${day}</div>`).join('')}${cells}</div>
      </section>
      <section class="section"><div class="section-head"><h3>Agenda del ${calendarSelectedDate === todayKey() ? 'día de hoy' : formatDate(calendarSelectedDate, { day: 'numeric', month: 'long' })}</h3></div>${hasSelectedItems ? `<div class="list">${selectedItems.map(event => event.kind === 'installment' ? renderCalendarInstallment(data.installments.find(item => item.id === event.id)) : renderCalendarEvent(event)).join('')}</div>` : emptyState('▦', 'Sin eventos para este día', 'Las cuotas, pagos e ingresos programados aparecerán acá.')}</section>`;
  }

  function renderMovements() {
    const selector=`<label class="field movement-section-picker">Ver movimientos<select id="movement-section"><option value="loans" ${movementSection==='loans'?'selected':''}>Préstamos y financiaciones</option><option value="summary" ${movementSection==='summary'?'selected':''}>Resumen mensual · cobros y pagos</option><option value="general" ${movementSection==='general'?'selected':''}>Generales · sueldo, ingresos y pagos</option><option value="all" ${movementSection==='all'?'selected':''}>Todos los movimientos</option></select></label>`;
    return selector+(movementSection==='summary'?renderMonthlySummary():movementSection==='general'?renderSalarySavings():renderFinancialMovements());
  }
  function renderMonthlySummary() {
    const report=window.MonthlySummary.build(LC.activeData(data),summaryMonth,window.FinancingOverview,F);
    const current=todayKey().slice(0,7),next=addDate(current+'-01',0,1).slice(0,7);
    const amount=n=>money(n);
    const cards=[['collections','Cobros de préstamos','Cobrado','Pendiente de cobro'],['financing','Pagos de financiación','Pagado','Pendiente de pago'],['lent','Nuevos préstamos','Entregado','Programado']];
    return `${pageHeading('Resumen mensual','Cobros, pagos de financiación y dinero que volvés a prestar.')}
      <div class="financing-month-tabs">${[[current,'Este mes'],[next,'Próximo mes']].map(([month,label])=>`<button type="button" data-action="summary-month" data-month="${month}" aria-pressed="${summaryMonth===month}" class="${summaryMonth===month?'active':''}"><strong>${label}</strong><span>${formatDate(month+'-01',{month:'long'})}</span></button>`).join('')}</div>
      <label class="field">Consultar mes<input id="summary-month" type="month" value="${summaryMonth}"></label>
      <h3>${formatDate(summaryMonth+'-01',{month:'long',year:'numeric'})}</h3>
      <div class="list">${cards.map(([key,title,actual,pending])=>`<article class="card"><h3>${title}</h3><div class="kv-list"><div class="kv"><span>${actual}</span><b>${amount(report.totals[key].actual)}</b></div><div class="kv"><span>${pending}</span><b>${amount(report.totals[key].pending)}</b></div><div class="kv"><span>Total realizado + pendiente</span><b>${amount(report.totals[key].actual+report.totals[key].pending)}</b></div></div></article>`).join('')}
      <article class="card"><h3>Cobros menos pagos de financiación</h3><div class="kv-list"><div class="kv"><span>Diferencia realizada</span><b>${amount(report.actualDifference)}</b></div><div class="kv"><span>Diferencia prevista del mes</span><b>${amount(report.projectedDifference)}</b></div></div><p class="subtle">Antes de entregar nuevos préstamos. No es tu saldo disponible ni Dinero a futuro.</p></article></div>
      <p class="subtle">Lo realizado usa la fecha real del cobro o pago. Lo pendiente usa el vencimiento de las cuotas cargadas; puede cambiar si registrás pagos o nuevos préstamos. No incluye sueldo ni ingresos o gastos generales. Los pagos históricos sin registro de fecha no se asignan a un mes.</p>
      ${report.undated?`<p class="subtle">Hay ${amount(report.undated)} sin fecha válida, fuera de los totales mensuales.</p>`:''}
      <details class="card monthly-detail"><summary>Ver detalle del mes · ${report.rows.length} registros</summary><div class="list">${report.rows.map(r=>`<article><div class="row-top"><strong>${escapeHtml(r.label)}</strong><b>${amount(r.amount)}</b></div><p class="subtle">${formatDate(r.date,{day:'numeric',month:'short'})} · ${r.kind==='collections'?'Cobro':r.kind==='financing'?'Pago de financiación':'Préstamo dado'} · ${r.state==='pending'?'Pendiente':'Realizado'}</p></article>`).join('')||'<p class="subtle">Sin cobros ni pagos registrados o previstos para este mes.</p>'}</div></details>`;
  }
  function renderFinancialMovements() {
    const items = [...data.movements].filter(item => (movementSection==='all'||!isManualMovement(item))).filter(item => movementFilter === 'Todos' || movementCategory(item) === movementFilter || (movementFilter === 'cobros' && movementCategory(item) === 'partial-payments')).sort((a, b) => movementDisplayDate(b).localeCompare(movementDisplayDate(a)) || (b.createdAt || '').localeCompare(a.createdAt || ''));
    const directionLabel = direction => direction === 'in' ? 'Entrada' : 'Salida';
    const filters = [['Todos', 'Todos'], ['Cobros', 'cobros'], ['Pagos parciales', 'partial-payments'], ['Préstamos dados', 'loans-out'], ['Ingresos generales', 'income'], ['Gastos generales', 'expenses'], ['Sueldo ↔ Préstamos', 'salary']].filter(([,value])=>movementSection==='all'||!['salary','income','expenses'].includes(value));
    return `${pageHeading('Movimientos', `${items.length} registros`, '<button class="primary-button" data-action="new-movement">＋ Registrar</button>')}
      <div class="filter-row">${filters.map(([label, value]) => `<button class="filter-chip ${movementFilter === value ? 'active' : ''}" data-action="movement-filter" data-value="${value}">${label}</button>`).join('')}</div>
      ${items.length ? `<div class="list">${items.map(item => `<article class="card movement-card" data-action="movement-detail" data-id="${escapeHtml(item.id)}"><div class="row-top"><div><div class="person">${escapeHtml(displayMovementType(item))}</div><div class="subtle">${formatDate(movementDisplayDate(item), { day: 'numeric', month: 'short', year: 'numeric' })}${item.person ? ` · ${escapeHtml(item.person)}` : ''}</div></div><div class="amount ${item.direction === 'in' ? 'movement-in' : 'movement-out'}">${item.direction === 'in' ? '+' : '−'}${money(item.amount)}</div></div>${financingDescriptionPreview(financingForMovement(item))}<div class="inline-details"><span>${directionLabel(item.direction)}</span>${item.description ? `<span>${escapeHtml(item.description)}</span>` : ''}${item.status === 'Pendiente' ? '<span class="badge pending">Programado</span>' : ''}</div></article>`).join('')}</div>` : emptyState('↔', 'Sin movimientos en esta categoría', 'Los movimientos de préstamos y los ingresos o gastos registrados aparecerán acá.', '<button class="primary-button" data-action="new-movement">Registrar movimiento</button>')}`;
  }

  function renderFinancingMonths(records) {
    const overview=window.FinancingOverview.build(records,todayKey(),F);
    const current=todayKey().slice(0,7),now=parseDate(todayKey());
    const next=dateKey(new Date(now.getFullYear(),now.getMonth()+1,1)).slice(0,7);
    const monthName=month=>formatDate(month+'-01',{month:'long'});
    const monthLabel=month=>formatDate(month+'-01',{month:'long',year:'numeric'});
    const group=overview.months.find(item=>item.month===financingMonth)||{items:[],total:0};
    const older=overview.rows.filter(row=>row.date&&row.date.slice(0,7)<financingMonth);
    const sum=rows=>roundMoney(rows.reduce((n,row)=>n+row.amount,0));
    const personIds=new Set(records.filter(f=>F.isMonthly(f)).map(f=>f.id));
    const split=rows=>({cards:rows.filter(row=>!personIds.has(row.financingId)),people:rows.filter(row=>personIds.has(row.financingId))});
    const selectedGroups=split(group.items);
    const renderRows=rows=>rows.map(row=>`<button type="button" class="card financing-month-row" data-action="financing-detail" data-id="${escapeHtml(row.financingId)}"><span class="financing-month-concept"><strong>${escapeHtml(row.label)}</strong>${financingDescriptionPreview(records.find(f=>f.id===row.financingId))}<small>${row.number?`Cuota ${row.number} de ${row.count} · `:'Saldo pendiente · '}${row.date?`Vence ${formatDate(row.date,{day:'numeric',month:'short'})}`:'Sin fecha de pago'}${row.paid>0?' · Pago parcial':''}</small>${row.date&&row.date<todayKey()?'<small class="movement-out">Vencimiento pasado</small>':''}</span><span class="financing-month-amount"><b>${money(row.amount)}</b><small>Ver detalle ›</small></span></button>`).join('');
    const renderEntities=rows=>{const entities=new Map();rows.forEach(row=>{const key=normalizedName(row.label);if(!entities.has(key))entities.set(key,{label:row.label,rows:[]});entities.get(key).rows.push(row);});return [...entities.values()].map(entity=>`<section class="financing-entity"><div class="financing-entity-heading"><h4>${escapeHtml(entity.label)}</h4><span>Total <b>${money(sum(entity.rows))}</b></span></div><div class="list">${renderRows(entity.rows)}</div></section>`).join('');};
    const renderGroups=rows=>{const groups=split(rows);return [['cards','Tarjetas'],['people','Personas']].map(([key,label])=>`<section class="financing-month-group" data-financing-group="${key}"><div class="financing-group-heading"><h3>${label}</h3><b>${money(sum(groups[key]))}</b></div><div class="list">${groups[key].length?renderEntities(groups[key]):`<p class="subtle">No hay pagos pendientes de ${label.toLowerCase()}.</p>`}</div></section>`).join('');};
    return `<section class="financing-by-month" aria-label="Pagos pendientes por mes"><div class="financing-month-tabs">${[[current,'Este mes'],[next,'Próximo mes']].map(([month,label])=>`<button type="button" data-action="financing-month" data-month="${month}" aria-pressed="${financingMonth===month}" class="${financingMonth===month?'active':''}"><strong>${label}</strong><span>${monthName(month)}</span></button>`).join('')}</div>
      <details class="financing-other-month"><summary>Consultar otro mes</summary><label class="field">Mes<input type="month" id="financing-month" value="${escapeHtml(financingMonth)}"></label></details>
      <article class="card financing-month-summary"><span>Te queda pagar en ${monthLabel(financingMonth)}</span><small class="financing-general-label">Total general</small><strong data-financing-total="general">${money(group.total)}</strong><div class="financing-month-breakdown"><div><span>Total tarjetas</span><b data-financing-total="cards">${money(sum(selectedGroups.cards))}</b></div><div><span>Total personas</span><b data-financing-total="people">${money(sum(selectedGroups.people))}</b></div></div></article>
      <div class="financing-month-list">${renderGroups(group.items)}</div>
      ${older.length?`<details class="card financing-month-extra"><summary>Meses anteriores pendientes · ${money(sum(older))}</summary><p class="subtle">No están incluidos en el total del mes seleccionado.</p><div>${renderGroups(older)}</div></details>`:''}
      ${overview.undated.length?`<details class="card financing-month-extra"><summary>Sin fecha de pago · ${money(sum(overview.undated))}</summary><p class="subtle">Definí una fecha en el detalle de cada financiación para ubicarla en un mes.</p><div>${renderGroups(overview.undated)}</div></details>`:''}
      <p class="subtle financing-month-note">Los importes muestran lo que falta pagar de cada mes, según sus vencimientos registrados.</p>
    </section>`;
  }

  function renderCards() {
    data.cardFinancings.forEach(syncFinancingPaid);
    const received = data.cardFinancings.filter(item => item.received !== false);
    const totals = {
      received: received.reduce((sum, item) => sum + Number(item.receivedAmount || 0), 0),
      repay: received.reduce((sum, item) => sum + Number(item.totalToRepay || 0), 0),
      paid: received.reduce((sum, item) => sum + Number(item.paid || 0), 0),
      balance: cardDebtTotal()
    };
    const records = [...data.cardFinancings].sort((a, b) => (b.receivedDate || '').localeCompare(a.receivedDate || ''));
    return `${pageHeading('Financiación', `${records.length} financiaciones`, '<button class="primary-button" data-action="new-financing">＋ Nueva</button>')}
      ${renderFinancingMonths(records)}
      <details class="card financing-all-totals"><summary><span><strong>Totales generales</strong><small>Ver recibido, pagado y deuda total</small></span></summary>
      <section class="summary-grid card-summary-grid"><article class="summary-card current"><span class="label">Total recibido</span><span class="amount">${money(totals.received)}</span></article><article class="summary-card future"><span class="label">Total a devolver</span><span class="amount">${money(totals.repay)}</span></article><article class="summary-card receivable"><span class="label">Total pagado</span><span class="amount">${money(totals.paid)}</span></article><article class="summary-card payable"><span class="label">Total pendiente</span><span class="amount">${money(totals.balance)}</span></article></section>
      <section class="section"><div class="section-head"><h3>Tarjetas disponibles</h3></div><div class="list">${data.cards.map(card => { const associated = data.cardFinancings.filter(item => !F.isMonthly(item) && normalizedName(item.card) === normalizedName(card)); const balance = associated.reduce((sum, item) => sum + financingBalance(item), 0); const upcoming = associated.filter(item => item.nextPaymentDate && financingBalance(item) > 0).sort((a, b) => a.nextPaymentDate.localeCompare(b.nextPaymentDate))[0]; return `<button class="card configured-card" data-action="card-detail" data-card="${escapeHtml(card)}"><span><b>${escapeHtml(card)}</b><small>${associated.length} financiaciones · Pendiente ${money(balance)}</small></span><span>${upcoming ? `Próximo ${formatDate(upcoming.nextPaymentDate)}` : 'Ver detalle'} ›</span></button>`; }).join('') || '<p class="subtle">No hay tarjetas configuradas.</p>'}</div>${renderSettingGroup('Tarjetas', 'cards', data.cards)}</section>
      <section class="section"><div class="section-head"><h3>Financiaciones</h3></div>${records.length ? `<div class="list">${records.map(renderFinancingCard).join('')}</div>` : emptyState('▭', 'Sin financiaciones', 'Registrá dinero recibido de una tarjeta o de una persona y sus pagos.', '<button class="primary-button" data-action="new-financing">Registrar financiación</button>')}</section></details>`;
  }

  function openConfiguredCardDetail(card) {
    const records = data.cardFinancings.filter(item => !F.isMonthly(item) && normalizedName(item.card) === normalizedName(card)).sort((a, b) => (a.nextPaymentDate || '9999-12-31').localeCompare(b.nextPaymentDate || '9999-12-31'));
    records.forEach(item => syncFinancingPaid(item));
    const received = records.filter(item => item.received !== false);
    const totalReceived = roundMoney(received.reduce((sum, item) => sum + Number(item.receivedAmount || 0), 0));
    const totalRepay = roundMoney(received.reduce((sum, item) => sum + Number(item.totalToRepay || 0), 0));
    const totalPaid = roundMoney(received.reduce((sum, item) => sum + Number(item.paid || 0), 0));
    const pending = records.reduce((sum, item) => sum + financingBalance(item), 0);
    const upcoming = records.filter(item => item.nextPaymentDate && financingBalance(item) > 0);
    const body = `<div class="card kv-list"><div class="kv"><span>Total recibido</span><b>${money(totalReceived)}</b></div><div class="kv"><span>Total a devolver</span><b>${money(totalRepay)}</b></div><div class="kv"><span>Total pagado</span><b>${money(totalPaid)}</b></div><div class="kv"><span>Total pendiente</span><b>${money(pending)}</b></div><div class="kv"><span>Financiaciones</span><b>${records.length}</b></div></div><section class="section"><div class="section-head"><h3>Próximas cuotas</h3></div>${upcoming.length ? `<div class="list">${upcoming.map(item => `<article class="card"><div class="row-top"><b>${formatDate(item.nextPaymentDate)}</b><strong>${money(financingBalance(item))}</strong></div><span class="subtle">${escapeHtml(item.card)} · saldo de financiación</span></article>`).join('')}</div>` : '<p class="subtle">No hay vencimientos programados.</p>'}</section><section class="section"><div class="section-head"><h3>Financiaciones asociadas</h3></div>${records.length ? `<div class="list">${records.map(renderFinancingCard).join('')}</div>` : '<p class="subtle">No hay financiaciones asociadas a esta tarjeta.</p>'}</section>`;
    openModal(card, 'Resumen de tarjeta', body);
  }

  function financingForMovement(item){const payment=item?.cardPaymentId&&data.cardPayments.find(p=>p.id===item.cardPaymentId);const financingId=item?.cardFinancingId||payment?.financingId;return financingId?data.cardFinancings.find(f=>f.id===financingId):null;}
  function financingDescriptionBlock(financing){return typeof financing?.description==='string'&&financing.description.trim()?`<section class="card"><h3>Descripción de la financiación</h3><p data-financing-description style="white-space:pre-wrap;overflow-wrap:anywhere;margin-bottom:0">${escapeHtml(financing.description)}</p></section>`:'';}
  function financingDescriptionPreview(financing){const text=typeof financing?.description==='string'?financing.description.trim():'';return text?`<small class="subtle">${escapeHtml(text.length>120?text.slice(0,120)+'…':text)}</small>`:'';}

  function renderFinancingCard(financing) {
    syncFinancingPaid(financing);
    const balance = financingBalance(financing);
    const status = financing.received === false ? 'Programada' : balance <= 0.005 ? 'Pagada' : financing.paid > 0 ? 'Parcial' : 'Pendiente';
    const badgeClass = status === 'Pagada' ? 'paid' : status === 'Parcial' ? 'partial' : 'pending';
    return `<article class="card" data-action="financing-detail" data-id="${escapeHtml(financing.id)}"><div class="row-top"><div><div class="person">${escapeHtml(financing.card)}</div><div class="subtle">${financing.historical ? 'Histórica · recibida' : financing.received === false ? 'Recibir' : 'Recibido'} ${formatDate(financing.receivedDate, { day: 'numeric', month: 'short', year: 'numeric' })}</div></div><span class="badge ${badgeClass}">${status}</span></div>${financingDescriptionPreview(financing)}<div class="inline-details"><span>Recibido <b>${money(financing.receivedAmount)}</b></span><span>Devolver <b>${money(financing.totalToRepay)}</b></span><span>Pagado <b>${money(financing.paid)}</b></span><span>Saldo <b>${money(balance)}</b></span></div>${F.isMonthly(financing) ? `<div class="subtle">${F.isInstallments(financing)?'Cuotas normales':'Interés mensual + capital final'} · ${financing.monthCount} meses · ${formatInterestPercent(financing.interestValue)}% mensual</div>` : ''}${financing.nextPaymentDate && balance > 0 ? `<div class="subtle" style="margin-top:9px">Próximo pago previsto: ${formatDate(financing.nextPaymentDate)}</div>` : ''}</article>`;
  }

  function financingLinkFields(existing) {
    let cards=[];try{const saved=JSON.parse(localStorage.getItem(Link.TARGET));if(Link.validCards(saved))cards=saved.cards.map(c=>c.name);}catch(_){}
    if(existing?.cardLink?.card&&!cards.includes(existing.cardLink.card))cards.push(existing.cardLink.card);
    const link=existing?.cardLink;
    return `<fieldset id="financing-link-box" class="card full-span"><legend>Control Tarjetas</legend><label><input type="checkbox" name="linkCard" ${link?'checked':''}> Registrar también en Control Tarjetas</label><div id="financing-link-fields"><label class="field">Fecha del consumo<input name="linkedDate" type="date" value="${escapeHtml(link?.date||existing?.receivedDate||todayKey())}"></label><label class="field">Mes de vencimiento de la tarjeta<input name="linkedMonth" type="month" value="${escapeHtml(link?.month||'')}"></label><p class="subtle">Se usa la tarjeta elegida arriba para ambas aplicaciones. Se registra el total a devolver como consumo en 1 pago, clasificado Préstamos. Elegí el mes en que vas a pagar el resumen.</p></div><p class="subtle">Funciona en el mismo dispositivo y navegador. Cada app conserva su respaldo en Drive; abrí Tarjetas para enviar su copia. ${cards.length?'':'Abrí primero Control Tarjetas con tus datos para elegir una tarjeta.'}</p></fieldset>`;
  }
  function linkNotice(f){return f.cardLink?`<section class="card"><b>${escapeHtml(Link.status(localStorage,f))}</b><p class="subtle">${escapeHtml(f.cardLink.card)} · Vencimiento ${escapeHtml(f.cardLink.month)} · ${money(f.totalToRepay)}</p><button type="button" class="secondary-button" data-action="retry-card-link" data-id="${escapeHtml(f.id)}">Comprobar / reintentar</button> <a class="secondary-button" href="/Control-tarjetas/?screen=movements">Abrir Tarjetas</a><p class="subtle">Los pagos se registran por separado en cada app. Esta vinculación registra el consumo, no un segundo ingreso.</p></section>`:'';}

  function openFinancingForm(financingId = '') {
    const existing = financingId ? data.cardFinancings.find(item => item.id === financingId) : null;
    if (financingId && !existing) return;
    const cardOptions = [...new Set([...(data.cards.length ? data.cards : ['Otra']), ...(existing ? [existing.card] : [])])];
    let linkedCardOptions=[];try{const saved=JSON.parse(localStorage.getItem(Link.TARGET));if(Link.validCards(saved))linkedCardOptions=saved.cards.map(c=>c.name);}catch(_){}
    if(existing?.cardLink?.card&&!linkedCardOptions.includes(existing.cardLink.card))linkedCardOptions.push(existing.cardLink.card);
    const cardKey=name=>String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();

    const interestType = existing?.interestType || 'amount';
    const interestValue = existing ? (existing.interestValue ?? existing.charges ?? 0) : 0;
    const monthly = F.isMonthly(existing);
    const body = `<form id="financing-form" data-financing-id="${escapeHtml(financingId)}"><div class="form-grid"><div class="field full-span"><label for="financing-mode">Modalidad</label><select id="financing-mode" name="repaymentMode"><option value="single" ${!monthly?'selected':''}>Financiación de tarjeta / cargos únicos</option><option value="monthly-bullet" ${existing?.repaymentMode==='monthly-bullet'?'selected':''}>Interés mensual + capital final (recibida)</option><option value="installments" ${F.isInstallments(existing)?'selected':''}>Cuotas normales (recibida)</option></select></div><div class="field" id="financing-card-field"><label for="financing-card">Tarjeta</label><select id="financing-card" name="card" required>${cardOptions.map(card => `<option value="${escapeHtml(card)}" ${card === existing?.card ? 'selected' : ''}>${escapeHtml(card)}</option>`).join('')}</select></div><div class="field" id="financing-lender-field"><label for="financing-lender">Persona que me presta</label><input id="financing-lender" name="lender" maxlength="100" value="${escapeHtml(monthly?existing.card:'')}" placeholder="Nombre de tu amigo"></div><div class="field"><label for="financing-date">Fecha en que recibí el dinero</label><input id="financing-date" name="receivedDate" type="date" value="${escapeHtml(existing?.receivedDate || todayKey())}" required></div><div class="field"><label for="financing-amount">Monto recibido</label><input id="financing-amount" name="receivedAmount" type="text" data-money-input inputmode="numeric" value="${existing ? formatIntegerInput(existing.receivedAmount) : ''}" required></div><div class="field"><label for="financing-interest-type" id="financing-interest-label">Intereses / cargos</label><select id="financing-interest-type" name="interestType"><option value="amount" ${interestType === 'amount' ? 'selected' : ''}>Importe ($)</option><option value="percent" ${interestType === 'percent' ? 'selected' : ''}>Porcentaje (%)</option></select><input id="financing-interest-value" name="interestValue" type="text" ${interestType === 'percent' ? 'inputmode="decimal"' : 'data-money-input inputmode="numeric"'} value="${escapeHtml(interestType === 'percent' ? formatInterestPercent(interestValue) : interestValue)}" required><span class="field-help" id="financing-interest-preview"></span></div><div class="field" id="financing-single-date-field"><label for="financing-next-date">Próxima fecha de pago prevista (opcional)</label><input id="financing-next-date" name="nextPaymentDate" type="date" value="${escapeHtml(existing?.nextPaymentDate || '')}"></div><div class="field" id="financing-month-count-field"><label for="financing-month-count">Cantidad de meses</label><input id="financing-month-count" name="monthCount" type="number" min="1" max="240" step="1" value="${monthly?existing.monthCount:1}"></div><div class="field" id="financing-first-due-field"><label for="financing-first-due">Primer vencimiento</label><input id="financing-first-due" name="firstDueDate" type="date" value="${monthly?existing.firstDueDate:F.nextMonthDate(existing?.receivedDate || todayKey())}"></div>${financingLinkFields(existing)}<div class="field full-span"><label for="financing-description">Descripción (opcional)</label><textarea id="financing-description" name="description" maxlength="1000" placeholder="Por ejemplo: para qué recibiste esta financiación o alguna aclaración">${escapeHtml(existing?.description || '')}</textarea></div><div class="field full-span historical-toggle"><label for="financing-historical"><input id="financing-historical" name="historical" type="checkbox" ${existing?.historical ? 'checked' : ''}> Financiación histórica</label><span class="field-help">No suma el dinero recibido al saldo actual; la deuda pendiente sí queda contabilizada.</span></div></div><div class="card kv-list financing-preview"><div class="kv"><span>Intereses / cargos</span><b id="financing-charges-preview">${money(existing?.charges || 0)}</b></div><div class="kv"><span>Total a devolver</span><b id="financing-total-preview">${money(existing?.totalToRepay || 0)}</b></div></div><div id="financing-schedule-preview" class="section"></div><div class="form-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancelar</button><button class="primary-button" type="submit">${existing ? 'Guardar cambios' : 'Guardar financiación'}</button></div></form>`;
    openModal(existing ? 'Editar financiación' : 'Nueva financiación', existing ? existing.card : 'Registrá cuánto recibiste y cuánto debés devolver.', body);
    const form = modalRoot.querySelector('#financing-form');
    form.addEventListener('submit', saveFinancing);
    const type = form.elements.interestType;
    const value = form.elements.interestValue;
    const amount = form.elements.receivedAmount;
    const mode = form.elements.repaymentMode;
    const firstDue=form.elements.firstDueDate;
    let firstDueManual=!!existing;
    const suggestFirstDue=()=>{if(!firstDueManual) firstDue.value=F.nextMonthDate(form.elements.receivedDate.value);};
    ['input','change'].forEach(event=>firstDue.addEventListener(event,()=>{firstDueManual=true;}));
    form.elements.receivedDate.addEventListener('input',suggestFirstDue);
    form.elements.receivedDate.addEventListener('change',()=>{suggestFirstDue();preview();});
    const preview = () => {
      const base = parseMoney(amount.value);
      const rate = parseInterestPercent(value.value);
      const interest = type.value === 'percent' ? (Number.isFinite(rate) ? roundMoney(base * Math.max(0, rate) / 100) : NaN) : parseMoney(value.value);
      if (['monthly-bullet','installments'].includes(mode.value)) {
        const candidate = {repaymentMode:mode.value,card:form.elements.lender.value.trim() || 'Persona',receivedAmount:base,receivedDate:form.elements.receivedDate.value,firstDueDate:form.elements.firstDueDate.value,monthCount:Number(form.elements.monthCount.value),interestValue:rate,paid:0};
        const sums = F.totals(candidate), rows = F.schedule(candidate);
        modalRoot.querySelector('#financing-interest-preview').textContent = `Interés por mes: ${money(sums.monthlyInterest)}`;
        modalRoot.querySelector('#financing-charges-preview').textContent = money(sums.interest);
        modalRoot.querySelector('#financing-total-preview').textContent = money(sums.total);
        modalRoot.querySelector('#financing-schedule-preview').innerHTML = rows.length ? `<p class="subtle">${mode.value==='installments'?'Cada cuota incluye una parte del capital más el interés mensual sobre el monto inicial. Con tasa 0 devolvés solo lo recibido.':'Los intereses se calculan sobre el capital inicial. El último mes devolvés también el capital.'}</p>${renderReceivedSchedule(candidate)}` : '<p class="subtle">Completá capital, tasa, meses y fechas para ver el calendario de pagos.</p>';
        return;
      }
      modalRoot.querySelector('#financing-schedule-preview').innerHTML = '';
      modalRoot.querySelector('#financing-interest-preview').textContent = `Intereses/cargos: ${money(interest)} · Total: ${money(roundMoney(base + interest))}`;
      modalRoot.querySelector('#financing-charges-preview').textContent = money(interest);
      modalRoot.querySelector('#financing-total-preview').textContent = money(roundMoney(base + interest));
    };
    type.addEventListener('change', () => {
      const previousType = type.dataset.previous || type.value;
      const base = parseMoney(amount.value);
      const previousValue = previousType === 'percent' ? Math.max(0, parseInterestPercent(value.value) || 0) : parseMoney(value.value);
      if (type.value !== previousType) {
        const charges = previousType === 'percent' ? roundMoney(base * previousValue / 100) : previousValue;
        value.value = type.value === 'percent' ? formatInterestPercent(base ? charges * 100 / base : 0) : formatIntegerInput(charges);
        type.dataset.previous = type.value;
        value.type = 'text';
        value.inputMode = type.value === 'percent' ? 'decimal' : 'numeric';
        value.toggleAttribute('data-money-input', type.value === 'amount');
      }
      preview();
    });
    type.dataset.previous = type.value;
    const modeFields = () => {
      const monthly = ['monthly-bullet','installments'].includes(mode.value);
      if(monthly)suggestFirstDue();
      for (const [selector,visible] of [['#financing-card-field',!monthly],['#financing-lender-field',monthly],['#financing-single-date-field',!monthly],['#financing-month-count-field',monthly],['#financing-first-due-field',monthly]]) {const node=form.querySelector(selector);node.hidden=!visible;node.querySelectorAll('input,select').forEach(input=>input.disabled=!visible);}
      form.elements.lender.required=monthly;form.elements.firstDueDate.required=monthly;form.elements.monthCount.required=monthly;
      type.hidden=monthly;type.disabled=monthly;
      if(monthly){type.value='percent';type.dataset.previous='percent';value.inputMode='decimal';value.removeAttribute('data-money-input');}
      else {value.inputMode=type.value==='percent'?'decimal':'numeric';value.toggleAttribute('data-money-input',type.value==='amount');}
      const label=form.querySelector('#financing-interest-label');label.textContent=monthly?'Tasa mensual (%)':'Intereses / cargos';label.htmlFor=monthly?'financing-interest-value':'financing-interest-type';preview();
    };
    let initialCardSelection=true;
    const linkFields=()=>{const single=mode.value==='single';const checked=single&&form.elements.linkCard.checked;
      const picker=form.elements.card,current=initialCardSelection&&existing?.cardLink?existing.cardLink.card:picker.value;initialCardSelection=false;
      const names=checked?linkedCardOptions:[...new Set([...cardOptions,...(current?[current]:[])])];
      const matches=names.filter(name=>cardKey(name)===cardKey(current));
      const selected=names.includes(current)?current:matches.length===1?matches[0]:'';
      picker.innerHTML=(checked?'<option value="">Elegí una tarjeta</option>':'')+names.map(name=>`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');picker.value=selected;
      form.querySelector('#financing-link-box').hidden=!single;form.elements.linkCard.disabled=!single;form.querySelector('#financing-link-fields').hidden=!checked;
      ['linkedDate','linkedMonth'].forEach(name=>{form.elements[name].disabled=!checked;form.elements[name].required=checked;});};
    form.elements.linkCard.addEventListener('change',linkFields);
    mode.addEventListener('change',linkFields);linkFields();
    mode.addEventListener('change',modeFields);
    [value, amount,form.elements.monthCount,form.elements.firstDueDate,form.elements.receivedDate].forEach(input => input.addEventListener('input', preview));
    modeFields();
  }

  function renderReceivedSchedule(financing) {
    return `<div class="list financing-due-list">${F.schedule(financing).map(row => `<article class="card"><div class="row-top"><b>${F.isInstallments(financing)?'Cuota':'Mes'} ${row.number} · ${formatDate(row.date)}</b><strong>${money(row.amount)}</strong></div><div class="subtle">Interés ${money(row.interest)}${row.capital ? ` + capital ${money(row.capital)}` : ''}</div><div class="subtle">${row.remaining <= 0.005 ? 'Pagado' : `Pendiente ${money(row.remaining)}`}</div></article>`).join('')}</div>`;
  }

  function saveMonthlyFinancing(form,values,existing) {
    const candidate = {...(existing || {}),repaymentMode:String(values.get('repaymentMode')),card:String(values.get('lender') || '').trim(),description:String(values.get('description')||'').trim(),receivedAmount:parseMoney(values.get('receivedAmount')),receivedDate:String(values.get('receivedDate')),firstDueDate:String(values.get('firstDueDate')),monthCount:Number(values.get('monthCount')),interestType:'percent',interestValue:parseInterestPercent(values.get('interestValue'))};
    if (!F.valid(candidate)) {showToast('Revisá la persona, capital, tasa mensual, cantidad de meses y vencimiento.');return;}
    const sums=F.totals(candidate);
    if (existing && existing.paid > sums.total + 0.005) {showToast('El total a devolver no puede ser menor que los pagos ya registrados.');return;}
    if (existing?.paid > 0 && ['repaymentMode','receivedAmount','firstDueDate','monthCount','interestValue'].some(key=>existing[key]!==candidate[key]) && !confirm('Se recalcularán los vencimientos y se conservarán los pagos registrados, aplicados desde el primer mes. ¿Continuar?')) return;
    const financing=existing || {id:id(),paid:0,legacyPaid:0,createdAt:new Date().toISOString(),payments:[]};
    const historical=values.get('historical')==='on';
    Object.assign(financing,candidate,{charges:sums.interest,totalToRepay:sums.total,historical,received:historical || financing.paid > 0 || candidate.receivedDate<=todayKey()});
    syncFinancingPaid(financing);
    if (!existing) data.cardFinancings.unshift(financing);
    syncFinancingReceiptMovement(financing);
    persist();closeModal();page='cards';render();showToast('Financiación recibida guardada con sus vencimientos mensuales.');
  }

  function saveFinancing(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const description=String(values.get('description')||'').trim();
    if(description.length>1000){showToast('La descripción puede tener hasta 1000 caracteres.');return;}
    const existing = data.cardFinancings.find(item => item.id === form.dataset.financingId);
    if (existing) syncFinancingPaid(existing);
    if(existing?.cardLink&&values.get('repaymentMode')!=='single'){showToast('Primero desmarcá la vinculación y guardá antes de cambiar la modalidad.');return;}
    if (['monthly-bullet','installments'].includes(values.get('repaymentMode'))) { saveMonthlyFinancing(form,values,existing); return; }
    const receivedAmount = parseMoney(values.get('receivedAmount'));
    const interestType = String(values.get('interestType')) === 'percent' ? 'percent' : 'amount';
    const interestValue = interestType === 'percent' ? parseInterestPercent(values.get('interestValue')) : parseMoney(values.get('interestValue'));
    const charges = roundMoney(interestType === 'percent' ? receivedAmount * interestValue / 100 : interestValue);
    const receivedDate = String(values.get('receivedDate'));
    const nextPaymentDate = String(values.get('nextPaymentDate'));
    if (!Number.isFinite(receivedAmount) || receivedAmount <= 0 || !Number.isFinite(interestValue) || interestValue < 0 || !parseDate(receivedDate) || (nextPaymentDate && (!parseDate(nextPaymentDate) || nextPaymentDate < receivedDate))) { showToast('Revisá el monto, los intereses y las fechas de la financiación.'); return; }
    if (existing && F.isMonthly(existing) && existing.paid > 0 && !confirm('Se cambiará esta financiación a cargos únicos y se conservarán sus pagos. ¿Continuar?')) return;
    if (existing && existing.paid > roundMoney(receivedAmount + charges) + 0.005) { showToast('El total a devolver no puede ser menor que los pagos ya registrados.'); return; }
    const cardLink=values.get('linkCard')==='on'?{version:1,card:String(values.get('card')||''),date:String(values.get('linkedDate')||''),month:String(values.get('linkedMonth')||'')}:null;
    if(cardLink&&!Link.validLink(cardLink)){showToast('Elegí la tarjeta, la fecha del consumo y el mes de vencimiento.');return;}
    if(existing?.cardLink&&!cardLink&&!confirm('¿Quitar también el consumo vinculado de Control Tarjetas? La financiación seguirá en Préstamos.'))return;
    if(cardLink&&!existing?.cardLink){let target;try{target=JSON.parse(localStorage.getItem(Link.TARGET));}catch(_){}if(Link.validCards(target)&&target.onePayments.some(row=>!Link.linked(row)&&row.card===cardLink.card&&row.month===cardLink.month&&row.date===cardLink.date&&Math.abs(Number(row.amount)-roundMoney(receivedAmount+charges))<0.005)&&!confirm('Ya hay un consumo manual con la misma tarjeta, fecha, vencimiento e importe. Para evitar duplicarlo, cancelá y revisalo primero. ¿Crear otro consumo igualmente?'))return;}
    const before=structuredClone(data);
    const financing = existing || { id: id(), paid: 0, legacyPaid: 0, createdAt: new Date().toISOString(), payments: [] };
    const historical = values.get('historical') === 'on';
    Object.assign(financing, { repaymentMode:'single', card: String(values.get('card')), description, receivedDate, receivedAmount, charges, interestType, interestValue, totalToRepay: roundMoney(receivedAmount + charges), nextPaymentDate, historical, received: historical || financing.paid > 0 || receivedDate <= todayKey() });
    if(cardLink)financing.cardLink=cardLink;else if(financing.cardLink){data.cardLinkRemovals=[...new Set([...(data.cardLinkRemovals||[]),financing.id])];delete financing.cardLink;}
    syncFinancingPaid(financing);
    if (!existing) data.cardFinancings.unshift(financing);
    syncFinancingReceiptMovement(financing);
    try{persist();}catch(error){data=before;showToast('No se guardó: '+error.message);return;}
    closeModal(); page = 'cards'; render();if(cardLink){openFinancingDetail(financing.id);showToast(Link.status(localStorage,financing));return;} showToast(financing.historical ? 'Financiación histórica guardada; la deuda quedó registrada.' : existing ? 'Financiación actualizada y saldos recalculados.' : 'Financiación registrada y dinero sumado.');
  }

  function openFinancingDetail(financingId) {
    const financing = data.cardFinancings.find(item => item.id === financingId);
    if (!financing) return;
    syncFinancingPaid(financing);
    const chronological = data.cardPayments.filter(item => item.financingId === financing.id).sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
    let runningPaid = 0;
    const balances = new Map();
    chronological.forEach(payment => { runningPaid = roundMoney(runningPaid + Number(payment.amount || 0)); balances.set(payment.id, Math.max(0, roundMoney(financing.totalToRepay - Number(financing.legacyPaid || 0) - runningPaid))); });
    const payments = chronological.slice().reverse();
    const legacyHistory = Number(financing.legacyPaid || 0) > 0 ? `<article class="card payment-history-row"><b>Pagado antes del historial detallado</b><strong>${money(financing.legacyPaid)}</strong><div class="subtle">El respaldo anterior no incluye fechas ni pagos individuales para este importe.</div></article>` : '';
    const history = payments.length || legacyHistory ? `<div class="list">${legacyHistory}${payments.map(payment => `<article class="card payment-history-row"><div class="row-top"><span><b>${formatDate(payment.date, { day: 'numeric', month: 'short', year: 'numeric' })}</b><small>Fecha real del pago</small></span><strong>${money(payment.amount)}</strong></div><div class="subtle">Saldo después del pago: <b>${money(balances.get(payment.id))}</b></div>${payment.note ? `<div class="subtle">${escapeHtml(payment.note)}</div>` : ''}<div class="payment-actions"><button class="secondary-button" data-action="edit-card-payment" data-id="${escapeHtml(payment.id)}">Editar</button><button class="danger-button" data-action="delete-card-payment" data-id="${escapeHtml(payment.id)}">Eliminar</button></div></article>`).join('')}</div>` : '<p class="subtle">Todavía no hay pagos.</p>';
    const schedule = F.isMonthly(financing) ? `<section class="section"><h3>Vencimientos mensuales</h3><p class="subtle">Los pagos se aplican al vencimiento más antiguo pendiente. Podés registrar pagos parciales o anticipados.</p>${renderReceivedSchedule(financing)}</section>` : '';
    const controls = financing.received !== false && financingBalance(financing) > 0.005 ? `<div class="form-actions">${!F.isMonthly(financing)?`<button class="secondary-button" data-action="schedule-card-payment" data-id="${escapeHtml(financing.id)}">Programar fecha</button>`:''}<button class="primary-button" data-action="pay-card" data-id="${escapeHtml(financing.id)}">Registrar pago</button></div>` : '';
    const admin = `<div class="loan-detail-actions"><button class="secondary-button" data-action="edit-financing" data-id="${escapeHtml(financing.id)}">Editar</button><button class="danger-button" data-action="delete-financing" data-id="${escapeHtml(financing.id)}">Eliminar</button></div>`;
    openModal(financing.card, 'Detalle de financiación', `${admin}${linkNotice(financing)}${financingDescriptionBlock(financing)}<div class="card kv-list"><div class="kv"><span>Fecha en que recibí el dinero</span><b>${formatDate(financing.receivedDate)}</b></div><div class="kv"><span>Monto recibido</span><b>${money(financing.receivedAmount)}</b></div><div class="kv"><span>Intereses / cargos</span><b>${money(financing.charges)}</b></div><div class="kv"><span>Total a devolver</span><b>${money(financing.totalToRepay)}</b></div><div class="kv"><span>Pagado</span><b>${money(financing.paid)}</b></div><div class="kv"><span>Saldo pendiente</span><b>${money(financingBalance(financing))}</b></div><div class="kv"><span>Próxima fecha prevista</span><b>${financing.nextPaymentDate ? formatDate(financing.nextPaymentDate) : 'Sin fecha'}</b></div><div class="kv"><span>Tipo</span><b>${financing.historical ? 'Histórica' : 'Normal'}</b></div></div>${controls}${schedule}<section class="section"><div class="section-head"><h3>Pagos registrados</h3></div>${history}</section>`);
  }

  function openDeleteFinancing(financingId) {
    const financing = data.cardFinancings.find(item => item.id === financingId);
    if (!financing) return;
    syncFinancingPaid(financing);
    openModal('¿Eliminar financiación?', 'Se quitarán sus pagos, movimientos y el consumo vinculado en Tarjetas, si lo tiene.', `<div class="card kv-list"><div class="kv"><span>Tarjeta</span><b>${escapeHtml(financing.card)}</b></div><div class="kv"><span>Monto recibido</span><b>${money(financing.receivedAmount)}</b></div><div class="kv"><span>Total a devolver</span><b>${money(financing.totalToRepay)}</b></div><div class="kv"><span>Pagado</span><b>${money(financing.paid)}</b></div><div class="kv"><span>Saldo pendiente</span><b>${money(financingBalance(financing))}</b></div></div><div class="form-actions"><button class="secondary-button" data-action="close-modal">Cancelar</button><button class="danger-button" data-action="confirm-delete-financing" data-id="${escapeHtml(financing.id)}">Eliminar</button></div>`);
  }

  function deleteFinancing(financingId) {
    const financing = data.cardFinancings.find(item => item.id === financingId);
    if (!financing) return;
    const before=structuredClone(data);
    if(financing.cardLink)data.cardLinkRemovals=[...new Set([...(data.cardLinkRemovals||[]),financingId])];
    const paymentIds = new Set(data.cardPayments.filter(item => item.financingId === financingId).map(item => item.id));
    data.cardFinancings = data.cardFinancings.filter(item => item.id !== financingId);
    data.cardPayments = data.cardPayments.filter(item => item.financingId !== financingId);
    data.movements = data.movements.filter(item => item.cardFinancingId !== financingId && !paymentIds.has(item.cardPaymentId));
    try{persist();}catch(error){data=before;showToast('No se eliminó: '+error.message);return;} closeModal(); render(); showToast('Financiación eliminada. Si Tarjetas no está disponible, su eliminación se reintentará al abrirla.');
  }

  function openCardPaymentEdit(paymentId) {
    const payment = data.cardPayments.find(item => item.id === paymentId);
    if (!payment) return;
    const financing = data.cardFinancings.find(item => item.id === payment.financingId);
    if (!financing) return;
    syncFinancingPaid(financing);
    const otherPaid = roundMoney(financing.paid - Number(payment.amount || 0));
    const maximum = roundMoney(financing.totalToRepay - otherPaid);
    const legacyFraction = !Number.isInteger(Number(payment.amount)) || !Number.isInteger(maximum);
    const amountField = legacyFraction
      ? `<input id="card-payment-edit-amount" name="amount" type="number" data-legacy-fraction="true" min="0.01" max="${maximum}" step="0.01" value="${Number(payment.amount)}" required>`
      : `<input id="card-payment-edit-amount" name="amount" type="text" data-money-input inputmode="numeric" value="${formatIntegerInput(payment.amount)}" required>`;
    const body = `<form id="card-payment-edit-form" data-payment-id="${escapeHtml(payment.id)}"><div class="form-grid"><div class="field"><label for="card-payment-edit-amount">Monto pagado</label>${amountField}<span class="field-help">Máximo disponible: ${money(maximum)}</span></div><div class="field"><label for="card-payment-edit-date">Fecha real del pago</label><input id="card-payment-edit-date" name="date" type="date" value="${escapeHtml(payment.date)}" max="${todayKey()}" required></div><div class="field full-span"><label for="card-payment-edit-note">Descripción (opcional)</label><input id="card-payment-edit-note" name="note" maxlength="300" value="${escapeHtml(payment.note || '')}"></div></div><div class="form-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancelar</button><button class="primary-button" type="submit">Guardar cambios</button></div><button type="button" class="danger-button full" style="margin-top:14px" data-action="delete-card-payment" data-id="${escapeHtml(payment.id)}">Deshacer pago</button><p class="field-help">Si lo registraste por error, se revierte la salida de dinero y este importe vuelve a quedar pendiente.</p></form>`;
    openModal('Editar pago', financing.card, body);
    modalRoot.querySelector('#card-payment-edit-form').addEventListener('submit', event => saveCardPaymentEdit(event, payment.id));
  }

  function saveCardPaymentEdit(event, paymentId) {
    event.preventDefault();
    const payment = data.cardPayments.find(item => item.id === paymentId);
    const financing = payment && data.cardFinancings.find(item => item.id === payment.financingId);
    if (!payment || !financing) return;
    syncFinancingPaid(financing);
    const maximum = roundMoney(financing.totalToRepay - (financing.paid - Number(payment.amount || 0)));
    const values = new FormData(event.currentTarget);
    const amount = event.currentTarget.elements.amount.dataset.legacyFraction === 'true' ? roundMoney(Number(values.get('amount'))) : parseMoney(values.get('amount'));
    const date = String(values.get('date'));
    if (!Number.isFinite(amount) || amount <= 0 || amount > maximum + 0.005 || !parseDate(date) || date > todayKey()) { showToast('El pago debe ser válido y no superar el saldo disponible.'); return; }
    payment.amount = amount; payment.date = date; payment.note = String(values.get('note')).trim();
    const movement = data.movements.find(item => item.cardPaymentId === payment.id);
    if (movement) { movement.amount = amount; movement.date = date; movement.description = `${financing.card} · Pago de financiación`; }
    syncFinancingPaid(financing); persist(); openFinancingDetail(financing.id); showToast('Pago actualizado; los saldos se recalcularon.');
  }

  function deleteCardPayment(paymentId) {
    const payment = data.cardPayments.find(item => item.id === paymentId);
    if (!payment || !window.confirm(`¿Deshacer el pago de ${money(payment.amount)} del ${formatDate(payment.date)}? Se revierte la salida de dinero y la deuda pendiente vuelve a aumentar por ese importe.`)) return;
    const financing = data.cardFinancings.find(item => item.id === payment.financingId);
    if (financing) syncFinancingPaid(financing);
    data.cardPayments = data.cardPayments.filter(item => item.id !== paymentId);
    data.movements = data.movements.filter(item => item.cardPaymentId !== paymentId);
    if (financing) { syncFinancingPaid(financing); persist(); render(); openFinancingDetail(financing.id); }
    else { persist(); closeModal(); render(); }
    showToast('Pago eliminado; la deuda pendiente se recalculó.');
  }

  function openCardPaymentForm(financingId) {
    const financing = data.cardFinancings.find(item => item.id === financingId);
    if (!financing || financing.received === false || financingBalance(financing) <= 0.005) return;
    syncFinancingPaid(financing);
    const balance = financingBalance(financing);
    const suggested = F.isMonthly(financing) ? F.schedule(financing).find(row=>row.remaining>0.005)?.remaining || balance : balance;
    const legacyFraction = !Number.isInteger(balance) || !Number.isInteger(suggested);
    const amountField = legacyFraction
      ? `<input id="card-payment-amount" name="amount" type="number" data-legacy-fraction="true" min="0.01" max="${balance}" step="0.01" value="${suggested}" required><span class="field-help">Este pago o saldo incluye centavos; se conservan para registrarlo exactamente.</span>`
      : `<input id="card-payment-amount" name="amount" type="text" data-money-input inputmode="numeric" value="${formatIntegerInput(suggested)}" required>`;
    const body = `<form id="card-payment-form"><div class="alert">${escapeHtml(financing.card)} · Saldo pendiente ${legacyFraction ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(balance) : money(balance)}. ${F.isMonthly(financing)?'Se sugiere el importe del primer mes pendiente. Los pagos se aplican desde el vencimiento más antiguo.':'Podés pagar cualquier monto hasta ese saldo.'}</div><div class="form-grid"><div class="field"><label for="card-payment-amount">Monto pagado</label>${amountField}</div><div class="field"><label for="card-payment-date">Fecha de pago</label><input id="card-payment-date" name="date" type="date" value="${todayKey()}" max="${todayKey()}" required></div><div class="field full-span"><label for="card-payment-note">Descripción (opcional)</label><input id="card-payment-note" name="note" maxlength="300"></div></div><div class="form-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancelar</button><button class="primary-button" type="submit">Registrar pago</button></div></form>`;
    openModal(F.isMonthly(financing)?'Registrar pago de financiación':'Registrar pago de tarjeta', financing.card, body);
    modalRoot.querySelector('#card-payment-form').addEventListener('submit', event => saveCardPayment(event, financing.id));
  }

  function saveCardPayment(event, financingId) {
    event.preventDefault();
    const financing = data.cardFinancings.find(item => item.id === financingId);
    const values = new FormData(event.currentTarget);
    const amount = event.currentTarget.elements.amount.dataset.legacyFraction === 'true' ? roundMoney(Number(values.get('amount'))) : parseMoney(values.get('amount'));
    const date = String(values.get('date'));
    if (!financing) return;
    syncFinancingPaid(financing);
    if (!Number.isFinite(amount) || amount <= 0 || amount > financingBalance(financing) + 0.005 || !parseDate(date) || date > todayKey()) { showToast('El pago debe ser válido y no superar el saldo pendiente.'); return; }
    const payment = { id: id(), financingId, card: financing.card, amount, date, note: String(values.get('note')).trim(), createdAt: new Date().toISOString() };
    financing.paid = roundMoney(financing.paid + amount);
    financing.payments ||= [];
    financing.payments.push(payment.id);
    // Preserve the due date so partial payments and undo remain in their original month.
    data.cardPayments.unshift(payment);
    data.movements.unshift({ id: id(), date, createdAt: payment.createdAt, type: 'Tarjeta pagada', description: `${financing.card} · Pago de financiación`, direction: 'out', amount, cardFinancingId: financing.id, cardPaymentId: payment.id, status: 'Realizado' });
    syncFinancingPaid(financing); persist(); closeModal(); render(); showToast('Pago registrado; se actualizó el saldo pendiente.');
  }

  function openCardScheduleForm(financingId) {
    const financing = data.cardFinancings.find(item => item.id === financingId);
    if (!financing || financingBalance(financing) <= 0.005) return;
    if(F.isMonthly(financing)){openFinancingForm(financing.id);return;}
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
    const historicalIn = data.historical.filter(item => item.direction === 'in');
    const historicalOut = data.historical.filter(item => item.direction === 'out');
    const historicalTotalIn = roundMoney(historicalIn.reduce((sum, item) => sum + item.amount, 0));
    const historicalTotalOut = roundMoney(historicalOut.reduce((sum, item) => sum + item.amount, 0));
    const historicalBalance = roundMoney(historicalTotalIn - historicalTotalOut);
    return `${pageHeading('Respaldo y más', 'Respaldos, avisos y configuración.')}
      <section class="historical-section"><div class="historical-heading"><div><span class="historical-eyebrow">REFERENCIA</span><h3>Histórico</h3></div></div><p class="historical-note">Totales del sistema anterior, antes del comienzo del nuevo sistema. Son datos de referencia: no forman parte del dinero actual o futuro ni de los préstamos, cobros, movimientos u obligaciones vigentes. Consultá el Excel para ver el detalle de las operaciones.</p><h4>Entradas históricas</h4><div class="historical-list">${historicalIn.map(item => `<div class="historical-row"><span>${escapeHtml(item.label)}</span><strong>${money(item.amount)}</strong></div>`).join('')}</div><h4>Salidas históricas</h4><div class="historical-list">${historicalOut.map(item => `<div class="historical-row"><span>${escapeHtml(item.label)}</span><strong>${money(item.amount)}</strong></div>`).join('')}</div><div class="historical-summary"><div><span>Total histórico entrado</span><strong>${money(historicalTotalIn)}</strong></div><div><span>Total histórico salido</span><strong>${money(historicalTotalOut)}</strong></div><div><span>Dinero actual histórico</span><strong>${money(historicalBalance)}</strong></div></div></section>
      <section data-drive-backup></section><section class="section settings-block"><div class="section-head"><h3>Respaldo</h3></div><section class="backup-card"><h3>📤 Exportar respaldo</h3><p>Descargá un JSON con préstamos, cuotas, cobros, movimientos, financiaciones, pagos de tarjetas, configuración, avisos y totales históricos.</p><button class="primary-button full" data-action="export-backup">Exportar respaldo</button></section>
      <section class="backup-card"><h3>📥 Importar respaldo</h3><p>Elegí un respaldo JSON válido para incorporar sus datos. Los datos actuales se conservarán y los registros duplicados se omitirán, incluso si importás el mismo respaldo más de una vez.</p><button class="secondary-button full" data-action="choose-import">Seleccionar archivo JSON</button><p class="field-help">Al seleccionar el archivo, verás sus cantidades y un botón para importar.</p></section></section>
      <section class="section settings-block"><div class="section-head"><h3>Avisos</h3></div><section class="backup-card"><h3>🔔 Avisos al abrir la app</h3><p>${escapeHtml(notificationStatusText())} Si permitís los avisos, la app revisa las cuotas pendientes de hoy al abrirse y a partir de las ${escapeHtml(data.settings.notificationTime || '09:00')} mientras permanece abierta.</p><button class="secondary-button full" data-action="enable-notifications">${notificationButtonText()}</button><div style="margin-top:16px"><h3>Avisos de mañana</h3><p data-push-status role="status">${escapeHtml(window.PushReminders?.status()||'Preparando los avisos…')}</p><button class="primary-button full" data-action="enable-morning-push">${window.PushReminders?.enabled()?'Desactivar avisos de mañana':'Activar avisos de mañana'}</button>${window.PushReminders?.enabled()?'<button class="secondary-button full" style="margin-top:8px" data-action="test-morning-push">Enviar aviso de prueba</button>':''}<p class="field-help" style="margin:9px 0 0">Requiere conectar Google en Respaldo. Se envían las fechas, cantidades e importes de los cobros pendientes, sin nombres de clientes. Actualizá los préstamos con Internet para mantener los avisos al día. El horario de recepción depende de la conexión del celular.</p><a href="configurar-avisos.html">Configuración inicial del servicio</a></div></section></section>
      <section class="section settings-block"><div class="section-head"><h3>Configuración</h3></div>
        ${renderSettingGroup('Personas', 'people', data.people)}${renderSettingGroup('Tipos de préstamo', 'loanTypes', data.loanTypes)}${renderSettingGroup('Tarjetas', 'cards', data.cards)}
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

  function loanReferenceParts(value) {
    const text = String(value || '').trim();
    const match = text.match(/^(.*?)(\d+)$/);
    return { prefix: (match ? match[1] : text).trim(), number: match ? Number(match[2]) : 0 };
  }

  function suggestLoanReference(value) {
    const current = loanReferenceParts(value);
    if (!current.prefix) return '';
    const prefix = normalizedName(current.prefix);
    const highest = data.loans.reduce((max, loan) => {
      const reference = loanReferenceParts(loan.code);
      return normalizedName(reference.prefix) === prefix ? Math.max(max, reference.number) : max;
    }, current.number);
    return `${current.prefix}${highest + 1}`;
  }

  function openLoanForm(loanId = '') {
    const existing = loanId ? data.loans.find(item => item.id === loanId) : null;
    if (loanId && !existing) return;
    if(existing?.cancelled){showToast('Reactivá el préstamo antes de editarlo.');return;}
    if (existing?.renewals?.length) { openHistoricalLoanForm(loanId); return; }
    const deliveryDate = existing?.deliveryDate || todayKey();
    const firstDue = existing?.firstDue || addDate(deliveryDate, 0, 1);
    const body = `<form id="loan-form" data-loan-id="${escapeHtml(loanId)}"><div class="form-grid">
      <div class="field"><label for="loan-code">Código / referencia</label><input id="loan-code" name="code" maxlength="40" value="${escapeHtml(existing?.code || '')}" placeholder="Ej. H80">${existing ? '' : '<span class="field-help" id="loan-code-suggestion">Escribí un prefijo, por ejemplo H, para ver su siguiente número.</span>'}</div>
      <div class="field"><label for="loan-person">Persona</label><input id="loan-person" name="person" value="${escapeHtml(existing?.person || '')}" list="people-list" required maxlength="80" placeholder="Nombre"><datalist id="people-list">${data.people.map(person => `<option value="${escapeHtml(person)}">`).join('')}</datalist></div>
      <div class="field"><label for="loan-mode">Modalidad</label><select id="loan-mode" name="mode" required>${data.loanTypes.map(type => `<option value="${escapeHtml(type)}" ${type === (existing?.mode || data.loanTypes[0]) ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}</select></div>
      <div class="field"><label for="loan-capital">Capital prestado</label><input id="loan-capital" name="capital" type="text" data-money-input inputmode="numeric" required value="${existing ? formatIntegerInput(existing.capital) : ''}" placeholder="Ej. 100.000"></div>
      <div class="field"><label for="loan-rate">Tasa (%)</label><input id="loan-rate" name="rate" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(existing?.rate ?? 15)}" required></div>
      <div class="field"><label for="loan-count">Cantidad de cuotas</label><input id="loan-count" name="count" type="number" min="1" max="240" step="1" value="${escapeHtml(existing?.count || 1)}" required></div>
      <div class="field"><label for="loan-delivery-date">Fecha de entrega</label><input id="loan-delivery-date" name="deliveryDate" type="date" value="${escapeHtml(deliveryDate)}" required><span class="field-help">Una fecha futura deja el préstamo programado.</span></div>
      <div class="field"><label for="loan-first-due">Primer vencimiento</label><input id="loan-first-due" name="firstDue" type="date" value="${escapeHtml(firstDue)}" required></div>
      <div class="field full-span historical-toggle"><label for="loan-historical"><input id="loan-historical" name="historical" type="checkbox" ${existing?.historical ? 'checked' : ''}> Préstamo histórico</label><span class="field-help">No descuenta el capital del dinero actual ni genera un movimiento de entrega. Los pagos y cuotas existentes se conservan.</span></div>
      ${existing ? '' : `<div class="field full-span" id="loan-historical-paid-field" hidden><label for="loan-historical-paid-count">Cuotas ya pagadas antes de usar la aplicación</label><input id="loan-historical-paid-count" name="historicalPaidCount" type="number" min="0" max="240" step="1" value="0" disabled><span class="field-help">Se marcarán como históricas las primeras cuotas del cronograma.</span></div>`}
      <div class="field full-span"><label for="loan-notes">Descripción</label><textarea id="loan-notes" name="notes" maxlength="1000" placeholder="Detalle opcional">${escapeHtml(existing?.notes || '')}</textarea></div>
      </div><p class="field-help">En préstamo corto semanal, la tasa es mensual: se prorratea por los días desde la entrega hasta el último vencimiento, usando un mes de 4 semanas (28 días). Al guardar un préstamo corto anterior se recalculan sus cuotas, conservando los cobros. En cuotas normales, la tasa es mensual y se calcula por la cantidad de meses. En interés mensual + capital final se cobra el interés mensual y el capital al final.</p><div class="form-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancelar</button><button class="primary-button" type="submit">${existing ? 'Guardar cambios' : 'Guardar préstamo'}</button></div></form>`;
    openModal(existing ? `Editar préstamo ${existing.code}` : 'Agregar préstamo', existing ? existing.person : 'Completá los datos y generaremos las cuotas.', body);
    const form = modalRoot.querySelector('#loan-form');
    form.addEventListener('submit', saveLoan);
    if (!existing) {
      const codeInput = form.elements.code;
      const suggestion = form.querySelector('#loan-code-suggestion');
      const updateSuggestion = () => {
        const nextCode = suggestLoanReference(codeInput.value);
        if (!nextCode) {
          suggestion.textContent = 'Escribí un prefijo, por ejemplo H, para ver su siguiente número.';
          return;
        }
        suggestion.innerHTML = `Siguiente para ${escapeHtml(loanReferenceParts(codeInput.value).prefix)}: <button type="button" class="text-button" data-action="use-loan-reference" data-value="${escapeHtml(nextCode)}">${escapeHtml(nextCode)}</button> · editable`;
      };
      codeInput.addEventListener('input', updateSuggestion);
    }
    const historicalToggle = form.elements.historical;
    if (historicalToggle && form.elements.historicalPaidCount) {
      const historicalPaidField = form.querySelector('#loan-historical-paid-field');
      const historicalPaidCount = form.elements.historicalPaidCount;
      const updateHistoricalFields = () => {
        historicalPaidField.hidden = !historicalToggle.checked;
        historicalPaidCount.disabled = !historicalToggle.checked;
        historicalPaidCount.max = String(form.elements.mode.value === '1 cuota' ? 1 : Math.max(1, Number(form.elements.count.value) || 1));
      };
      historicalToggle.addEventListener('change', updateHistoricalFields);
      form.elements.count.addEventListener('input', updateHistoricalFields);
      form.elements.mode.addEventListener('change', updateHistoricalFields);
    }
    const dueInput = form.elements.firstDue;
    let dueWasManuallyChanged = Boolean(existing?.firstDueManual || (existing?.firstDue && existing.firstDue !== addDate(existing.deliveryDate, 0, 1)));
    if (dueWasManuallyChanged) dueInput.dataset.manual = 'true';
    dueInput.addEventListener('input', () => { dueWasManuallyChanged = true; dueInput.dataset.manual = 'true'; });
    form.elements.deliveryDate.addEventListener('change', () => {
      if (!dueWasManuallyChanged) dueInput.value = addDate(form.elements.deliveryDate.value, 0, 1);
    });
  }

  function historicalRowsFromForm(form) {
    return [...form.querySelectorAll('[data-historical-row]')].map(row => ({
      dueDate: row.querySelector('[data-historical-date]').value,
      amount: row.querySelector('[data-historical-amount]').value,
      state: row.querySelector('[data-historical-state]').value,
      paid: row.querySelector('[data-historical-paid]').value
    }));
  }

  function historicalDefaultDueDate(deliveryDate, mode, index) {
    const firstDue = addDate(deliveryDate || todayKey(), 0, 1);
    return mode === 'Préstamo corto semanal' ? addDate(firstDue, index * 7) : addDate(firstDue, 0, index);
  }

  function renderHistoricalInstallmentRows(form, previousRows = []) {
    const count = Math.max(1, Math.min(240, Number(form.elements.count.value) || 1));
    const deliveryDate = form.elements.deliveryDate.value || todayKey();
    const mode = form.elements.mode.value;
    form.querySelector('#historical-installments').innerHTML = Array.from({ length: count }, (_, index) => {
      const previous = previousRows[index] || {};
      const dueDate = previous.dueDate || historicalDefaultDueDate(deliveryDate, mode, index);
      const state = previous.state || 'pending';
      return `<div class="historical-installment-row" data-historical-row><strong>Cuota ${index + 1}</strong><div class="field"><label for="historical-due-${index}">Vencimiento</label><input id="historical-due-${index}" type="date" data-historical-date value="${escapeHtml(dueDate)}" required></div><div class="field"><label for="historical-amount-${index}">Importe real</label><input id="historical-amount-${index}" type="text" data-money-input data-historical-amount inputmode="numeric" value="${escapeHtml(previous.amount || '')}" required></div><div class="field"><label for="historical-state-${index}">Estado al migrar</label><select id="historical-state-${index}" data-historical-state><option value="pending" ${state === 'pending' ? 'selected' : ''}>Pendiente</option><option value="paid" ${state === 'paid' ? 'selected' : ''}>Pagada</option><option value="partial" ${state === 'partial' ? 'selected' : ''}>Parcial</option></select></div><div class="field"><label for="historical-paid-${index}">Pagado (solo parcial)</label><input id="historical-paid-${index}" type="text" data-money-input data-historical-paid inputmode="numeric" value="${escapeHtml(previous.paid || '')}" ${state !== 'partial' ? 'disabled' : ''}></div></div>`;
    }).join('');
  }

  function openHistoricalLoanForm(loanId = '') {
    const existing = loanId ? data.loans.find(item => item.id === loanId) : null;
    if (loanId && !existing) return;
    if(existing?.cancelled){showToast('Reactivá el préstamo antes de editarlo.');return;}

    const existingRows = existing ? loanInstallments(existing.id).sort((a, b) => a.number - b.number).map(item => ({ dueDate: item.dueDate, amount: formatIntegerInput(item.amount), state: Number(item.paid) >= Number(item.amount) ? 'paid' : Number(item.paid) > 0 ? 'partial' : 'pending', paid: formatIntegerInput(item.paid) })) : [];
    const body = `<form id="historical-loan-form" data-loan-id="${escapeHtml(loanId)}"><div class="alert">Este registro conserva los importes y vencimientos reales de cada cuota.</div><div class="form-grid">
      <div class="field"><label for="historical-code">Código / referencia</label><input id="historical-code" name="code" maxlength="40" value="${escapeHtml(existing?.code || '')}" placeholder="Ej. H80"></div>
      <div class="field"><label for="historical-person">Persona</label><input id="historical-person" name="person" value="${escapeHtml(existing?.person || '')}" list="historical-people-list" required maxlength="80" placeholder="Nombre"><datalist id="historical-people-list">${data.people.map(person => `<option value="${escapeHtml(person)}">`).join('')}</datalist></div>
      <div class="field"><label for="historical-mode">Modalidad</label><select id="historical-mode" name="mode" required>${data.loanTypes.map((type, index) => `<option value="${escapeHtml(type)}" ${type === (existing?.mode || data.loanTypes[1] || data.loanTypes[0]) ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}</select></div>
      <div class="field"><label for="historical-capital">Capital originalmente prestado</label><input id="historical-capital" name="capital" type="text" data-money-input inputmode="numeric" value="${existing ? formatIntegerInput(existing.capital) : ''}" required placeholder="Ej. 2.000.000"></div>
      <div class="field"><label for="historical-rate">Interés / tasa original (%)</label><input id="historical-rate" name="rate" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeHtml(existing?.rate ?? 0)}" required></div>
      <div class="field"><label for="historical-delivery-date">Fecha original del préstamo</label><input id="historical-delivery-date" name="deliveryDate" type="date" value="${escapeHtml(existing?.deliveryDate || todayKey())}" required></div>
      <div class="field"><label for="historical-count">Cantidad de cuotas</label><input id="historical-count" name="count" type="number" min="1" max="240" step="1" value="${escapeHtml(existing?.count || 1)}" required></div>
      <div class="field full-span historical-toggle"><label for="historical-loan-flag"><input id="historical-loan-flag" name="historical" type="checkbox" ${existing?.historical !== false ? 'checked' : ''}> Préstamo histórico</label><span class="field-help">Si lo desmarcás, se crea el movimiento normal de entrega. Se conservan cuotas y pagos.</span></div>
      </div><p class="field-help">Ingresá los importes, vencimientos y estados reales de cada cuota. Los pagos registrados en la aplicación se conservarán.</p><div id="historical-installments" class="historical-installments"></div><div class="form-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancelar</button><button class="primary-button" type="submit">Guardar cambios</button></div></form>`;
    openModal(existing ? `Editar préstamo ${existing.code}` : 'Nuevo préstamo histórico', existing ? existing.person : 'Cuotas anteriores a la aplicación', body);
    const form = modalRoot.querySelector('#historical-loan-form');
    if (existingRows.length) renderHistoricalInstallmentRows(form, existingRows);
    if (existing?.renewals?.length) {
      form.querySelector('.alert').textContent = 'Préstamo renovado: editá los datos, importes y vencimientos reales sin recalcular intereses. Los cobros y el historial de renovaciones se conservan. Para registrar un pago, usá Cobrar.';
      form.elements.count.readOnly = true;
      form.elements.mode.disabled = true;
      form.querySelectorAll('[data-historical-state], [data-historical-paid]').forEach(input => { input.disabled = true; });
    }
    form.dataset.defaultsDeliveryDate = form.elements.deliveryDate.value;
    form.dataset.defaultsMode = form.elements.mode.value;
    if (!existingRows.length) renderHistoricalInstallmentRows(form);
    const refreshRows = () => {
      const previous = historicalRowsFromForm(form);
      const oldDelivery = form.dataset.defaultsDeliveryDate;
      const oldMode = form.dataset.defaultsMode;
      previous.forEach((row, index) => {
        if (row.dueDate === historicalDefaultDueDate(oldDelivery, oldMode, index)) row.dueDate = '';
      });
      form.dataset.defaultsDeliveryDate = form.elements.deliveryDate.value || todayKey();
      form.dataset.defaultsMode = form.elements.mode.value;
      renderHistoricalInstallmentRows(form, previous);
      if (existing?.renewals?.length) form.querySelectorAll('[data-historical-state], [data-historical-paid]').forEach(input => { input.disabled = true; });
    };
    form.elements.count.addEventListener('change', refreshRows);
    form.elements.count.addEventListener('blur', refreshRows);
    form.elements.mode.addEventListener('change', refreshRows);
    form.elements.deliveryDate.addEventListener('change', refreshRows);
    form.querySelector('#historical-installments').addEventListener('change', event => {
      if (event.target.matches('[data-historical-state]')) {
        const paidInput = event.target.closest('[data-historical-row]').querySelector('[data-historical-paid]');
        paidInput.disabled = event.target.value !== 'partial';
        if (paidInput.disabled) paidInput.value = '';
      }
    });
    form.addEventListener('submit', saveHistoricalLoan);
  }

  function saveHistoricalLoan(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const capital = parseMoney(values.get('capital'));
    const rate = Number(values.get('rate'));
    const deliveryDate = String(values.get('deliveryDate'));
    const count = Number(values.get('count'));
    const rows = historicalRowsFromForm(form);
    const person = String(values.get('person') || '').trim();
    if (!person || !Number.isFinite(capital) || capital <= 0 || !Number.isFinite(rate) || rate < 0 || deliveryDate > todayKey() || !parseDate(deliveryDate) || !Number.isInteger(count) || count < 1 || count > 240 || rows.length !== count) {
      showToast('Revisá persona, capital, fecha original y cantidad de cuotas.'); return;
    }
    const loanId = form.dataset.loanId || '';
    const existing = loanId ? data.loans.find(item => item.id === loanId) : null;
    if(existing?.cancelled){showToast('Reactivá el préstamo antes de editarlo.');return;}
    const oldRows = existing ? loanInstallments(existing.id) : [];
    if (existing?.renewals?.length && count !== oldRows.length) { showToast('Conservá la cantidad de cuotas del préstamo renovado.'); return; }
    const installments = [];
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const amount = parseMoney(row.amount);
      const paidInput = parseMoney(row.paid);
      let paid = row.state === 'paid' ? amount : row.state === 'partial' ? paidInput : 0;
      const old = oldRows.find(item => item.number === index + 1);
      if (existing?.renewals?.length && old) paid = Number(old.paid) || 0;
      const paidInApp = old ? Math.max(0, Number(old.paid || 0) - Number(old.paidBeforeApp || 0)) : 0;
      if (paid + 0.005 < paidInApp || amount + 0.005 < Number(old?.paid || 0)) { showToast(`La cuota ${index + 1} no puede quedar por debajo de sus pagos registrados.`); return; }
      paid = Math.max(paid, paidInApp);
      if (!parseDate(row.dueDate) || row.dueDate < deliveryDate || !Number.isFinite(amount) || amount <= 0 || !['pending', 'paid', 'partial'].includes(row.state) || (!existing?.renewals?.length && row.state === 'partial' && (!Number.isFinite(paidInput) || paidInput <= 0 || paidInput >= amount))) {
        showToast(`Revisá el importe, vencimiento y estado de la cuota ${index + 1}.`); return;
      }
      installments.push({ ...(old || {}), id: old?.id || id(), number: index + 1, dueDate: row.dueDate, amount, paid, paidBeforeApp: old ? Math.min(Number(old.paidBeforeApp) || 0, paid) : paid, status: paid >= amount ? 'Pagado' : paid > 0 ? 'Parcial' : 'Pendiente', payments: old?.payments || [] });
    }
    const loan = {
      ...(existing || {}), id: loanId || id(),
      code: String(values.get('code') || '').trim() || existing?.code || `HIST-${String(data.loans.filter(item => item.historical).length + 1).padStart(3, '0')}`,
      person,
      mode: existing?.renewals?.length ? existing.mode : String(values.get('mode')),
      capital: Math.round(capital),
      rate,
      rateRecorded: true,
      count,
      firstDue: installments[0].dueDate,
      notes: existing?.notes || 'Préstamo histórico/migrado',
      createdAt: existing?.createdAt || new Date().toISOString(),
      deliveryDate,
      disbursed: true,
      historical: values.get('historical') === 'on'
    };
    if (existing) {
      const requestedCount = count;
      for (const old of oldRows.filter(item => item.number > requestedCount)) {
        if (Number(old.paid) > 0 || data.collections.some(item => item.installmentId === old.id) || (old.payments || []).length) { showToast(`No se puede quitar la cuota ${old.number} porque tiene pagos vinculados.`); return; }
      }
      data.installments = data.installments.filter(item => item.loanId !== existing.id || item.number <= requestedCount);
      installments.forEach(item => { item.loanId = existing.id; const index = data.installments.findIndex(row => row.id === item.id); if (index >= 0) data.installments[index] = item; else data.installments.push(item); });
      Object.assign(existing, loan);
      syncLoanDeliveryMovement(existing);
    } else {
      data.loans.unshift(loan);
      data.installments.push(...installments.map(item => ({ ...item, loanId: loan.id })));
    }
    persist(); closeModal(); page = 'loans'; loanFilter = 'Todos'; render(); showToast(existing ? 'Préstamo actualizado; cuotas y pagos conservados.' : 'Préstamo histórico guardado sin crear movimientos.');
  }

  function calculateSchedule({ capital, rate, count, mode, firstDue, deliveryDate }) {
    const periods = mode === '1 cuota' ? 1 : count;
    const rateDecimal = rate / 100;
    let values;
    if (mode === 'Interés mensual + capital final') {
      const interest = roundMoney(capital * rateDecimal);
      values = Array.from({ length: periods }, (_, index) => roundMoney(interest + (index === periods - 1 ? capital : 0)));
    } else {
      // Short loans use a four-week month; count actual days through the last weekly due date.
      const shortDays = mode === 'Préstamo corto semanal' ? (Date.parse(firstDue + 'T00:00:00Z') - Date.parse(deliveryDate + 'T00:00:00Z')) / 86400000 + (periods - 1) * 7 : 0;
      const total = mode === 'Préstamo corto semanal'
        ? roundMoney(capital + capital * rateDecimal * shortDays / 28)
        : mode === 'Cuotas normales'
        ? roundMoney(capital + capital * rateDecimal * periods)
        : roundMoney(capital * (1 + rateDecimal));
      const wholeTotal = Math.round(total);
      const each = Math.floor(wholeTotal / periods);
      let remainder = wholeTotal - each * periods;
      values = Array.from({ length: periods }, () => each);
      for (let index = 0; index < periods && remainder > 0; index++, remainder--) values[index]++;
    }
    return values.map((amount, index) => ({
      id: id(), number: index + 1,
      dueDate: index === 0 ? firstDue : mode === 'Préstamo corto semanal' ? addDate(firstDue, index * 7) : addDate(firstDue, 0, index),
      amount, paid: 0, status: 'Pendiente', payments: []
    }));
  }

  function roundMoney(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
  function formatIntegerInput(value) { return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0)); }

  function reconcileInstallments(loan, nextLoan) {
    const oldRows = loanInstallments(loan.id);
    const grouped = new Map();
    oldRows.forEach(row => grouped.set(row.number, [...(grouped.get(row.number) || []), row]));
    if ([...grouped.values()].some(rows => rows.length > 1)) {
      return { error: 'Este préstamo tiene cuotas con números repetidos. Para proteger cobros y movimientos, revisá esas cuotas antes de recalcular.' };
    }
    const nextCount = nextLoan.mode === '1 cuota' ? 1 : nextLoan.count;
    for (const row of oldRows.filter(item => item.number > nextCount)) {
      const hasCollection = data.collections.some(payment => payment.installmentId === row.id);
      if (Number(row.paid) > 0 || hasCollection || (row.payments || []).length) {
        return { error: `No se puede reducir la cantidad de cuotas: la cuota ${row.number} ya tiene pagos vinculados.` };
      }
    }
    const calculated = calculateSchedule({ capital: nextLoan.capital, rate: nextLoan.rate, count: nextCount, mode: nextLoan.mode, firstDue: nextLoan.firstDue, deliveryDate: nextLoan.deliveryDate });
    const byNumber = new Map(oldRows.map(row => [row.number, row]));
    for (const proposed of calculated) {
      const old = byNumber.get(proposed.number);
      if (old && Number(old.paid) > proposed.amount) {
        return { error: `El nuevo importe de la cuota ${old.number} sería menor que lo ya cobrado. No se guardaron cambios.` };
      }
    }
    const updated = calculated.map(proposed => {
      const old = byNumber.get(proposed.number);
      return old
        ? { ...old, dueDate: proposed.dueDate, amount: proposed.amount, status: Number(old.paid) >= proposed.amount ? 'Pagado' : Number(old.paid) > 0 ? 'Parcial' : 'Pendiente' }
        : { ...proposed, loanId: loan.id };
    });
    const retainedNumbers = new Set(calculated.map(item => item.number));
    const retainedIds = new Set(oldRows.filter(row => retainedNumbers.has(row.number)).map(row => row.id));
    data.installments = data.installments.filter(row => row.loanId !== loan.id || retainedIds.has(row.id));
    const currentIds = new Set(data.installments.map(row => row.id));
    for (const row of updated) {
      const index = data.installments.findIndex(item => item.id === row.id);
      if (index >= 0) data.installments[index] = row;
      else if (!currentIds.has(row.id)) data.installments.push(row);
    }
    return { rows: updated };
  }

  function saveLoan(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const loanId = event.currentTarget.dataset.loanId || '';
    const existing = loanId ? data.loans.find(item => item.id === loanId) : null;
    if(existing?.cancelled){showToast('Reactivá el préstamo antes de editarlo.');return;}
    const enteredCapital = parseMoney(form.get('capital'));
    const capital = existing && enteredCapital === Math.round(Number(existing.capital)) ? Number(existing.capital) : enteredCapital;
    const rate = Number(form.get('rate'));
    const count = Number(form.get('count'));
    const mode = String(form.get('mode'));
    const firstDue = String(form.get('firstDue'));
    const deliveryDate = String(form.get('deliveryDate') || todayKey());
    const historical = event.currentTarget.elements.historical?.checked === true;
    const historicalPaidCount = historical && !existing ? Number(form.get('historicalPaidCount')) : Number(existing?.historicalPaidCount) || 0;
    const scheduleCount = mode === '1 cuota' ? 1 : count;
    if (!Number.isFinite(capital) || capital <= 0 || !Number.isFinite(rate) || rate < 0 || !Number.isInteger(count) || count < 1 || count > 240 || !parseDate(firstDue) || !parseDate(deliveryDate) || (mode === 'Préstamo corto semanal' && firstDue <= deliveryDate)) {
      showToast('Revisá capital, tasa, cuotas y vencimiento.'); return;
    }
    if (historical && (!Number.isInteger(historicalPaidCount) || historicalPaidCount < 0 || historicalPaidCount > scheduleCount)) {
      showToast(`Las cuotas históricas pagadas deben estar entre 0 y ${scheduleCount}.`); return;
    }
    const person = String(form.get('person')).trim();
    const loan = {
      ...(existing || {}), id: existing?.id || id(), code: String(form.get('code')).trim() || existing?.code || `PRE-${String(data.loans.length + 1).padStart(3, '0')}`,
      person, mode, capital: existing && capital === Number(existing.capital) ? capital : Math.round(capital), rate,
      count: mode === '1 cuota' ? 1 : count, firstDue,
      firstDueManual: event.currentTarget.elements.firstDue.dataset.manual === 'true',
      notes: String(form.get('notes')).trim(), createdAt: existing?.createdAt || new Date().toISOString(), deliveryDate,
      disbursed: historical ? true : existing ? (existing.disbursed !== false || deliveryDate <= todayKey()) : deliveryDate <= todayKey(),
      historical, rateRecorded: historical ? true : existing?.rateRecorded || false, historicalPaidCount,
      ...(mode === 'Préstamo corto semanal' ? {shortInterestVersion:1} : {})
    };
    if (existing) {
      const affectsSchedule = ['capital', 'rate', 'count', 'mode', 'firstDue'].some(key => String(existing[key] ?? '') !== String(loan[key] ?? '')) || (mode === 'Préstamo corto semanal' && (existing.deliveryDate !== deliveryDate || existing.shortInterestVersion !== 1));
      if (affectsSchedule) {
        const result = reconcileInstallments(existing, loan);
        if (result.error) { showToast(result.error); return; }
      }
      Object.assign(existing, loan);
      syncLoanDeliveryMovement(existing);
      persist(); closeModal(); page = 'loans'; render(); showToast('Préstamo actualizado; los pagos existentes se conservaron.');
      return;
    }
    const schedule = calculateSchedule({ capital: loan.capital, rate, count: loan.count, mode, firstDue, deliveryDate }).map((item, index) => ({
      ...item,
      loanId: loan.id,
      ...(historical && index < historicalPaidCount ? { paid: item.amount, paidBeforeApp: item.amount, status: 'Pagado' } : {})
    }));
    data.loans.unshift(loan);
    data.installments.push(...schedule);
    if (!historical) syncLoanDeliveryMovement(loan);
    persist(); closeModal(); page = 'loans'; render(); showToast(historical ? `Préstamo histórico guardado: ${historicalPaidCount} cuota(s) ya pagada(s).` : 'Préstamo y cuotas creados.');
  }

  function openRenewLoan(loanId) {
    const loan=data.loans.find(l=>l.id===loanId),rows=loanInstallments(loanId);
    if(!window.LoanRenewal.eligible(loan,rows)){showToast('Solo se renuevan préstamos entregados de una cuota con saldo pendiente.');return;}
    const row=rows[0],snapshot=JSON.stringify([loan,rows]);
    openModal('Renovar préstamo',`${loan.code} · ${loan.person}`,`<form id="renew-loan-form"><div class="alert">No se registra otra entrega de dinero ni se marca nada como cobrado. El saldo anterior sigue pendiente y se suma únicamente el nuevo interés acordado.</div><div class="card kv-list"><div class="kv"><span>Capital original</span><b>${money(loan.capital)}</b></div><div class="kv"><span>Vencimiento actual</span><b>${formatDate(row.dueDate)}</b></div><div class="kv"><span>Saldo anterior pendiente</span><b>${money(dueLeft(row))}</b></div></div><div class="form-grid"><label class="field">Nuevo interés acordado ($)<input name="interest" id="renew-interest" type="text" data-money-input inputmode="numeric" required placeholder="Ej. 600.000"></label><label class="field">Nuevo vencimiento<input name="dueDate" type="date" required value="${addDate(row.dueDate,0,1)}" min="${addDate(row.dueDate,1)}"></label><label class="field full-span">Observación (opcional)<textarea name="note" maxlength="1000" placeholder="Acuerdo de renovación"></textarea></label></div><div class="card kv-list"><div class="kv"><span>Total pendiente renovado</span><b id="renew-total">${money(dueLeft(row))}</b></div></div><p class="subtle">El interés se ingresa como importe fijo; no se calcula sobre los intereses anteriores. Podés registrar cada pago parcial cuando lo recibas. El vencimiento original quedará en el historial.</p><div class="form-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancelar</button><button type="submit" class="primary-button">Confirmar renovación</button></div></form>`);
    const form=modalRoot.querySelector('#renew-loan-form');
    form.elements.interest.addEventListener('input',()=>{const extra=parseMoney(form.elements.interest.value);form.querySelector('#renew-total').textContent=money(dueLeft(row)+(Number.isFinite(extra)?extra:0));});
    const renewalId=id();
    form.addEventListener('submit',event=>{
      event.preventDefault();
      const current=data.loans.find(l=>l.id===loanId),currentRows=loanInstallments(loanId);
      if(JSON.stringify([current,currentRows])!==snapshot){showToast('El préstamo cambió. Volvé a abrir la renovación para revisar el saldo.');return;}
      try {
        if(!form.elements.interest.value.trim())throw Error('Ingresá el nuevo interés acordado.');
        const result=window.LoanRenewal.renew(current,currentRows,{interest:parseMoney(form.elements.interest.value),dueDate:form.elements.dueDate.value,note:form.elements.note.value,createdAt:new Date().toISOString(),renewalId});
        const candidate={...data,loans:data.loans.map(l=>l.id===loanId?result.loan:l),installments:data.installments.map(i=>i.id===row.id?result.installment:i)};
        localStorage.setItem(STORAGE_KEY,JSON.stringify(candidate));dataSnapshot=localStorage.getItem(STORAGE_KEY);data=candidate;
        window.DriveBackup?.changed();window.PushReminders?.changed();
        closeModal();render();openLoanDetail(loanId);showToast('Renovación guardada. Podés registrar pagos parciales.');
      }catch(error){showToast(error.message||'No se pudo guardar la renovación.');}
    });
  }

  function openLoanDetail(loanId) {
    const loan = data.loans.find(item => item.id === loanId);
    if (!loan) return;
    const totals = loanTotals(loan);
    const paidCount = totals.installments.filter(item => dueLeft(item) <= 0).length;
    const pendingCount = totals.installments.length - paidCount;
    const nextInstallment = !loan.cancelled && totals.installments.find(item => dueLeft(item) > 0);
    const numbers = new Map();
    totals.installments.forEach(item => numbers.set(item.number, (numbers.get(item.number) || 0) + 1));
    const repeatedNumbers = [...numbers].filter(([, count]) => count > 1).map(([number]) => number);
    const payments = data.collections.filter(item => item.loanId === loan.id || totals.installments.some(row => row.id === item.installmentId)).sort((a, b) => b.date.localeCompare(a.date));
    const history = payments.length ? `<section class="section"><div class="section-head"><h3>Historial de pagos</h3></div><div class="list">${payments.map(payment => `<article class="card"><div class="row-top"><b>${formatDate(payment.date, { day: 'numeric', month: 'short', year: 'numeric' })} · Cuota ${totals.installments.find(row => row.id === payment.installmentId)?.number ?? '—'}</b><strong>${money(payment.amount)}</strong></div>${payment.note ? `<div class="subtle">${escapeHtml(payment.note)}</div>` : ''}${!loan.cancelled ? `<button type="button" class="danger-button" style="margin-top:12px" data-action="undo-loan-payment" data-id="${escapeHtml(payment.id)}">Anular este pago</button>` : ''}</article>`).join('')}</div></section>` : '';
    const installments = totals.installments.map(item => {
      const paid = dueLeft(item) <= 0;
      const historicalPaid = Math.min(Number(item.paidBeforeApp) || 0, Number(item.paid) || 0);
      const paidInApp = Math.max(0, item.paid - historicalPaid);
      const stateClass = paid ? 'paid' : item.dueDate < todayKey() ? 'overdue' : item.paid > 0 ? 'partial' : 'pending';
      const undoButton = !loan.cancelled && (paidInApp > 0.005 || (!loan.historical && item.paid > 0.005 && !item.payments?.length))
        ? `<button class="text-button undo-installment-payment" data-action="undo-installment-payment" data-id="${escapeHtml(item.id)}">Deshacer todos los pagos</button>` : '';
      const collectButton = !loan.cancelled && !paid && loan.disbursed !== false
        ? `<button class="text-button" data-action="pay-installment" data-id="${escapeHtml(item.id)}">Cobrar</button>` : '';
      return `<div class="installment-line ${paid ? 'installment-paid' : 'installment-pending'}"><div class="due"><strong>Cuota ${item.number} · ${formatDate(item.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })}</strong><span class="badge ${stateClass}">${paid ? 'Pagada' : item.dueDate < todayKey() ? 'Vencida' : item.paid > 0 ? 'Parcial' : 'Pendiente'}</span><span>Importe ${money(item.amount)} · Pagado ${money(item.paid)}</span>${historicalPaid > 0.005 ? `<small class="installment-origin">Pago histórico anterior a la aplicación: ${money(historicalPaid)}</small>` : ''}</div><div style="text-align:right"><div class="due-amount">${money(dueLeft(item))}</div>${undoButton}${collectButton}</div></div>`;
    }).join('');
    const toolbar = `<div class="loan-detail-actions"><span class="badge ${loan.historical ? 'partial' : 'paid'}">${loan.historical ? 'Histórico' : 'Normal'}</span><button class="secondary-button" data-action="edit-loan" data-id="${escapeHtml(loan.id)}" ${loan.cancelled?'disabled':''}>Editar</button><button type="button" class="${loan.cancelled?'primary-button':'secondary-button'}" data-action="toggle-loan-cancelled" data-id="${escapeHtml(loan.id)}">${loan.cancelled?'Reactivar préstamo':'Anular préstamo'}</button><button class="danger-button" data-action="delete-loan" data-id="${escapeHtml(loan.id)}">Eliminar</button></div>`;
    const renewalButton=window.LoanRenewal.eligible(loan,totals.installments)?`<button class="secondary-button full" style="margin-bottom:14px" data-action="renew-loan" data-id="${escapeHtml(loan.id)}">Renovar préstamo</button>`:'';
    const renewalHistory=Array.isArray(loan.renewals)&&loan.renewals.length?`<section class="section"><h3>Historial de renovaciones</h3><div class="list">${loan.renewals.map(r=>`<article class="card"><strong>${formatDate(r.previousDueDate)} → ${formatDate(r.newDueDate)}</strong><div class="kv-list"><div class="kv"><span>Saldo anterior sin cobrar</span><b>${money(r.previousBalance)}</b></div><div class="kv"><span>Nuevo interés acordado</span><b>${money(r.addedInterest)}</b></div><div class="kv"><span>Saldo al renovar</span><b>${money(r.newBalance)}</b></div></div>${r.note?`<p class="subtle">${escapeHtml(r.note)}</p>`:''}</article>`).join('')}</div></section>`:'';
    const duplicateWarning = repeatedNumbers.length ? `<div class="alert">Se detectaron cuotas repetidas (${repeatedNumbers.join(', ')}). No se fusionaron ni eliminaron porque pueden tener pagos vinculados. Revisá el historial antes de recalcular.</div>` : '';
    openModal(`Préstamo ${loan.code}`, loan.person, `${toolbar}${loan.cancelled?'<div class="alert">Préstamo anulado. Se conservan sus importes, cuotas y cobros, pero no cuentan en el saldo, la proyección ni los avisos. Reactivalo para volver a incluirlo.</div>':''}${renewalButton}${duplicateWarning}<div class="card kv-list"><div class="kv"><span>Modalidad</span><b>${escapeHtml(loan.mode)}</b></div><div class="kv"><span>Capital prestado</span><b>${money(loan.capital)}</b></div>${!loan.historical || loan.rateRecorded ? `<div class="kv"><span>${loan.historical || loan.renewals?.length ? 'Interés / tasa original' : 'Tasa'}</span><b>${escapeHtml(loan.rate)}%</b></div>` : ''}<div class="kv"><span>Cantidad de cuotas</span><b>${escapeHtml(loan.count || totals.installments.length)}</b></div><div class="kv"><span>Fecha de entrega</span><b>${formatDate(loan.deliveryDate)}</b></div>${loan.notes ? `<div class="kv"><span>Descripción</span><b>${escapeHtml(loan.notes)}</b></div>` : ''}<div class="kv"><span>Total a recibir</span><b>${money(totals.total)}</b></div><div class="kv"><span>Cobrado</span><b>${money(totals.paid)}</b></div><div class="kv"><span>Saldo</span><b>${money(totals.balance)}</b></div><div class="kv"><span>Estado</span>${badge(totals.status)}</div><div class="kv"><span>Cuotas cobradas / pendientes</span><b>${paidCount} / ${pendingCount}</b></div>${nextInstallment ? `<div class="kv"><span>Próxima cuota</span><b>${nextInstallment.number} de ${loan.count || totals.installments.length} · ${formatDate(nextInstallment.dueDate)} · ${money(dueLeft(nextInstallment))}</b></div>` : ''}</div><div class="progress"><span style="width:${totals.progress}%"></span></div><p class="progress-meta">${paidCount} de ${totals.installments.length} cuotas · ${money(totals.paid)} de ${money(totals.total)} cobrados</p><section class="section"><div class="section-head"><h3>Cuotas</h3></div><div class="installment-table">${installments}</div></section>${renewalHistory}${history}`);
  }

  function toggleLoanCancelled(loanId) {
    const loan=data.loans.find(l=>l.id===loanId);if(!loan)return;
    const cancelled=loan.cancelled!==true;
    const message=cancelled
      ? `¿Anular el préstamo ${loan.code} de ${loan.person}? Sus entregas de dinero, cobros y cuotas dejarán de contar en el saldo, el dinero a futuro y los avisos. Los registros se conservan y podés reactivarlo después. Esto no registra una devolución real de dinero.`
      : `¿Reactivar el préstamo ${loan.code} de ${loan.person}? Volverán a contar sus entregas, cobros y cuotas con los importes y fechas que ya estaban guardados.`;
    if(!confirm(message))return;
    try {
      const candidate=LC.withCancelled(data,loanId,cancelled);
      localStorage.setItem(STORAGE_KEY,JSON.stringify(candidate));dataSnapshot=localStorage.getItem(STORAGE_KEY);
      data=candidate;
    } catch {showToast('No se pudo guardar el cambio. El préstamo y sus saldos siguen como antes.');return;}
    window.DriveBackup?.changed();window.PushReminders?.changed();
    render();openLoanDetail(loanId);showToast(cancelled?'Préstamo anulado; se recalcularon los saldos.':'Préstamo reactivado con sus registros originales.');
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

  function undoLoanPayment(paymentId) {
    const payment = data.collections.find(item => item.id === paymentId);
    if (!payment) return;
    const installment = data.installments.find(item => item.id === payment.installmentId || (item.payments || []).includes(payment.id));
    if (!installment) { showToast('No se encontró la cuota vinculada a este pago.'); return; }
    const loan = data.loans.find(item => item.id === installment.loanId);
    if (!loan || loan.cancelled) { showToast('Reactivá el préstamo antes de modificar sus cobros.'); return; }
    const amount = Number(payment.amount);
    const paid = roundMoney(Number(installment.paid) - amount);
    const historicalPaid = Number(installment.paidBeforeApp) || 0;
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(paid) || paid < historicalPaid - 0.005) {
      showToast('El pago no coincide con el total cobrado de la cuota. Revisá sus datos antes de anularlo.'); return;
    }
    if (!window.confirm(`¿Anular únicamente el pago de ${money(amount)} del ${formatDate(payment.date)} de ${loan.code}? Este importe volverá a quedar pendiente y se quitará su ingreso de dinero. Los demás pagos se conservan.`)) return;
    installment.paid = Math.max(historicalPaid, paid);
    installment.status = installment.paid >= Number(installment.amount) - 0.005 ? 'Pagado' : installment.paid > 0.005 ? 'Parcial' : 'Pendiente';
    installment.payments = (installment.payments || []).filter(id => id !== payment.id);
    data.collections = data.collections.filter(item => item.id !== payment.id);
    data.movements = data.movements.filter(item => item.collectionId !== payment.id);
    persist(); closeModal(); render(); openLoanDetail(loan.id);
    showToast('Pago anulado. El importe volvió a quedar pendiente.');
  }

  function undoInstallmentPayment(installmentId) {
    if(LC.context(data).isCancelled({installmentId})){showToast('Reactivá el préstamo antes de modificar sus cobros.');return;}
    const installment = data.installments.find(item => item.id === installmentId);
    if (!installment || Number(installment.paid) <= 0.005) return;
    const historicalPaid = Math.min(Number(installment.paidBeforeApp) || 0, Number(installment.paid) || 0);
    const linkedPaymentIds = new Set((installment.payments || []).filter(Boolean));
    const payments = data.collections.filter(item => item.installmentId === installment.id || linkedPaymentIds.has(item.id));
    payments.forEach(item => linkedPaymentIds.add(item.id));
    const linkedMovementCount = data.movements.filter(item => item.collectionId && linkedPaymentIds.has(item.collectionId)).length;
    const loan = data.loans.find(item => item.id === installment.loanId);
    const afterUndoStatus = historicalPaid >= Number(installment.amount) - 0.005 ? 'Pagado' : historicalPaid > 0.005 ? 'Parcial' : 'Pendiente';
    if (!window.confirm(`La cuota ${installment.number}${loan?.code ? ` de ${loan.code}` : ''} quedará ${afterUndoStatus === 'Pagado' ? 'Pagada' : afterUndoStatus === 'Parcial' ? 'Parcial' : 'Pendiente'}, conservando el monto histórico previo de ${money(historicalPaid)}. Se quitarán ${payments.length} cobro(s) asociado(s) y ${linkedMovementCount} movimiento(s) vinculado(s). No se tocarán otras cuotas ni movimientos. ¿Querés continuar?`)) return;

    installment.paid = historicalPaid;
    installment.status = afterUndoStatus;
    installment.payments = (installment.payments || []).filter(paymentId => !linkedPaymentIds.has(paymentId));
    data.collections = data.collections.filter(item => !payments.includes(item));
    data.movements = data.movements.filter(item => !(item.collectionId && linkedPaymentIds.has(item.collectionId)));
    persist(); closeModal(); render(); showToast('La cuota volvió a Pendiente y se revirtieron sus cobros vinculados.');
  }

  function openPayForm(installmentId) {
    const item = data.installments.find(row => row.id === installmentId);
    if (!item) return;
    const loan = data.loans.find(row => row.id === item.loanId);
    const left = dueLeft(item);
    if (!loan || loan.cancelled || loan.disbursed === false || left <= 0.005) return;
    const suggested = Number.isInteger(left) ? left : Math.floor(left);
    const legacyFraction = !Number.isInteger(left);
    const amountField = legacyFraction
      ? `<input id="payment-amount" name="amount" type="number" data-legacy-fraction="true" min="0.01" max="${left}" step="0.01" value="${left}" required><span class="field-help">Este pago o saldo incluye centavos; se conservan para registrarlo exactamente.</span>`
      : `<input id="payment-amount" name="amount" type="text" data-money-input inputmode="numeric" value="${formatIntegerInput(suggested)}" required>`;
    const body = `<form id="payment-form"><div class="alert">${escapeHtml(loan.person)} · Cuota ${item.number}. Importe ${money(item.amount)}; pagado ${money(item.paid)}; pendiente ${legacyFraction ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(left) : money(left)}.</div><div class="form-grid"><div class="field"><label for="payment-amount">Importe cobrado</label>${amountField}</div><div class="field"><label for="payment-date">Fecha</label><input id="payment-date" name="date" type="date" value="${todayKey()}" required></div><div class="field full-span"><label for="payment-note">Observación</label><input id="payment-note" name="note" maxlength="500" placeholder="Opcional"></div></div><div class="form-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancelar</button><button class="primary-button" type="submit">Guardar cobro</button></div></form>`;
    openModal('Registrar cobro', `Cuota ${item.number} · ${loan.code}`, body);
    modalRoot.querySelector('#payment-form').addEventListener('submit', event => savePayment(event, item.id));
  }

  function savePayment(event, installmentId) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const amount = event.currentTarget.elements.amount.dataset.legacyFraction === 'true' ? roundMoney(Number(form.get('amount'))) : parseMoney(form.get('amount'));
    const date = String(form.get('date'));
    const item = data.installments.find(row => row.id === installmentId);
    const loan = item && data.loans.find(row => row.id === item.loanId);
    if (!item || !loan || loan.cancelled || loan.disbursed === false || !Number.isFinite(amount) || amount <= 0 || amount > dueLeft(item) + 0.005 || !parseDate(date)) {
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

  function isManualMovement(item) {
    return ['Ingreso general', 'Gasto general', S.IN, S.OUT,S.RETURN,S.SAVE].includes(item?.type)
      && !item.loanId && !item.collectionId && !item.cardFinancingId && !item.cardPaymentId;
  }

  function openMovementForm(movementId = '', presetType = '') {
    const item = movementId ? data.movements.find(row => row.id === movementId) : null;
    if (movementId && !isManualMovement(item)) return;
    const editing = Boolean(item);
    const date = item ? movementDisplayDate(item) : todayKey();
    const status = item ? (['Pendiente', 'Programado'].includes(item.status) ? 'Pendiente' : 'Realizado') : '';
    const body = `<form id="movement-form"><div class="form-grid"><div class="field"><label for="movement-type">Tipo</label><select id="movement-type" name="type">${['Ingreso general','Gasto general',S.IN,S.OUT,S.RETURN,S.SAVE].map(type=>`<option ${type===(item?.type||presetType||'Ingreso general')?'selected':''}>${escapeHtml(type)}</option>`).join('')}</select></div><div class="field"><label for="movement-date">Fecha</label><input id="movement-date" name="date" type="date" value="${escapeHtml(date)}" required>${editing ? '' : '<span class="field-help">Si elegís una fecha futura, quedará programado y no afectará el dinero actual.</span>'}</div><div class="field"><label for="movement-amount">Monto</label><input id="movement-amount" name="amount" type="text" data-decimal-money-input inputmode="decimal" value="${item ? formatMovementAmount(item.amount) : ''}" required></div>${editing ? `<div class="field"><label for="movement-status">Estado</label><select id="movement-status" name="status"><option value="Realizado" ${status === 'Realizado' ? 'selected' : ''}>Realizado</option><option value="Pendiente" ${status === 'Pendiente' ? 'selected' : ''}>Pendiente / Programado</option></select></div>` : ''}<div class="field full-span"><label for="movement-description">Descripción</label><input id="movement-description" name="description" maxlength="300" placeholder="Sueldo, reparación, compras…" value="${escapeHtml(item?.description || presetType || '')}" required></div></div><div id="salary-preview" class="card salary-preview" role="status" hidden></div><div class="form-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancelar</button><button class="primary-button" type="submit">${editing ? 'Guardar cambios' : 'Guardar movimiento'}</button></div></form>`;
    openModal(editing ? 'Editar movimiento' : presetType || 'Ingreso, gasto o pase', 'Las devoluciones cancelan lo pendiente del sueldo. Solo el ahorro nuevo aumenta el dinero a futuro.', body);
    const movementForm=modalRoot.querySelector('#movement-form');
    const preview=()=>{
      const values=new FormData(movementForm),type=String(values.get('type')),box=movementForm.querySelector('#salary-preview');
      box.hidden=!S.isTransfer({type});if(box.hidden)return;
      const amount=parseMovementAmount(values.get('amount')),date=String(values.get('date'));
      const status=item?(values.get('status')==='Pendiente'?'Pendiente':'Realizado'):date>todayKey()?'Pendiente':'Realizado';
      const candidate={...(item||{}),id:item?.id||'salary_preview',type,amount,date,status,direction:type===S.OUT?'out':'in',createdAt:item?.createdAt||new Date().toISOString()};
      if(!S.valid(candidate)){box.textContent='Completá el importe y la fecha para ver cómo se divide.';return;}
      const rows=item?data.movements.map(row=>row.id===item.id?candidate:row):[candidate,...data.movements];
      const next=S.reconcile(rows),allocation=next.allocations.find(row=>row.id===candidate.id);
      const previousCash=item&&!['Pendiente','Programado'].includes(item.status)?item.amount*(item.direction==='in'?1:-1):0;
      const cashChange=roundMoney((status==='Pendiente'?0:amount*(type===S.OUT?-1:1))-previousCash);
      const futureChange=roundMoney(cashChange+next.pending-S.reconcile(data.movements).pending);
      const changeText=value=>value===0?'se mantiene':`${value>0?'aumenta':'baja'} ${money(Math.abs(value))}`;
      box.textContent=`${status==='Pendiente'?'Quedará programado y no se contará como realizado.':type===S.OUT?'Queda pendiente de devolver del sueldo.':S.allocationText(allocation,money)+'.'} Dinero actual: ${changeText(cashChange)}. Dinero a futuro: ${changeText(futureChange)}.`;
    };
    movementForm.addEventListener('input',preview);movementForm.addEventListener('change',preview);preview();
    modalRoot.querySelector('#movement-form').addEventListener('submit', event => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      const amount = parseMovementAmount(values.get('amount'));
      const date = String(values.get('date'));
      const type = String(values.get('type'));
      const description = String(values.get('description')).trim();
      if (!Number.isFinite(amount) || amount <= 0 || !parseDate(date) || !description || !['Ingreso general', 'Gasto general',S.IN,S.OUT,S.RETURN,S.SAVE].includes(type)) { showToast('Revisá el monto y la fecha.'); return; }
      if(S.isTransfer({type})&&!S.valid({type,date,amount,direction:type===S.OUT?'out':'in'})){showToast('Revisá el importe en pesos y la fecha.');return;}
      if (item) {
        const nextStatus = values.get('status') === 'Pendiente' ? 'Pendiente' : 'Realizado';
        Object.assign(item, { type, date, scheduledDate: nextStatus === 'Pendiente' ? date : '', description, direction: ['Ingreso general',S.IN,S.RETURN,S.SAVE].includes(type) ? 'in' : 'out', amount, status: nextStatus });
        persist(); closeModal(); render(); showToast('Movimiento actualizado.'); return;
      }
      const future = date > todayKey();
      data.movements.unshift({ id: id(), type, date, scheduledDate: future ? date : '', createdAt: new Date().toISOString(), person: '', description, direction: ['Ingreso general',S.IN,S.RETURN,S.SAVE].includes(type) ? 'in' : 'out', amount, status: future ? 'Pendiente' : 'Realizado' });
      persist(); closeModal(); render(); showToast(future ? 'Movimiento programado; todavía no afecta el dinero actual.' : 'Movimiento realizado y guardado.');
    });
  }

  function openMovementDetail(movementId) {
    const item = data.movements.find(row => row.id === movementId);
    if (!item) return;
    const canRealize = !cancelledMovement(item) && (item.status === 'Pendiente' || item.status === 'Programado');
    const actionLabel = item.direction === 'in' ? 'Marcar realizado' : 'Marcar realizado';
    const eventDate = movementDisplayDate(item);
    const relatedLoan = item.loanId && data.loans.find(loan => loan.id === item.loanId);
    const payment = item.collectionId && data.collections.find(row => row.id === item.collectionId);
    const installment = payment && data.installments.find(row => row.id === payment.installmentId);
    const financingPayment = item.cardPaymentId && data.cardPayments.find(row=>row.id===item.cardPaymentId);
    const financingId = item.cardFinancingId || financingPayment?.financingId;
    const relatedFinancing = financingId && data.cardFinancings.find(row=>row.id===financingId);
    const manualActions = isManualMovement(item) ? `<div class="form-actions" style="margin-top:14px"><button class="secondary-button" data-action="edit-movement" data-id="${escapeHtml(item.id)}">Editar</button><button class="danger-button" data-action="delete-movement" data-id="${escapeHtml(item.id)}">Eliminar</button></div>` : '';
    openModal(displayMovementType(item), formatDate(eventDate, { day: 'numeric', month: 'long', year: 'numeric' }), `${financingDescriptionBlock(relatedFinancing)}<div class="card kv-list"><div class="kv"><span>Descripción</span><b>${escapeHtml(item.description || item.person || '—')}</b></div><div class="kv"><span>Tipo</span><b>${S.isTransfer(item)?'Pase con el sueldo':item.direction === 'in' ? 'Ingreso' : 'Gasto'}</b></div><div class="kv"><span>Monto</span><b>${money(item.amount)}</b></div>${S.isTransfer(item)?`<div class="kv"><span>${item.direction==='in'?'Distribución del ingreso':'Efecto del pase'}</span><b>${escapeHtml(S.allocationText(S.reconcile(data.movements).allocations.find(row=>row.id===item.id),money)||(['Pendiente','Programado'].includes(item.status)?'Aún no realizado':'Pendiente de devolver del sueldo'))}</b></div>`:''}${installment ? `<div class="kv"><span>Cuota</span><b>${installment.number} · ${money(installment.paid)} de ${money(installment.amount)} pagados</b></div>` : ''}${eventDate ? `<div class="kv"><span>Fecha prevista</span><b>${formatDate(eventDate)}</b></div>` : ''}${item.status ? `<div class="kv"><span>Estado</span><b>${escapeHtml(item.status)}</b></div>` : ''}</div>${relatedLoan ? `<button class="secondary-button full" style="margin-top:14px" data-action="view-loan" data-id="${escapeHtml(relatedLoan.id)}">Ver préstamo ${escapeHtml(relatedLoan.code)}</button>` : ''}${relatedFinancing ? `<button class="secondary-button full" style="margin-top:14px" data-action="financing-detail" data-id="${escapeHtml(relatedFinancing.id)}">Ver financiación · ${escapeHtml(relatedFinancing.card)}</button>` : ''}${canRealize ? `<button class="primary-button full" style="margin-top:14px" data-action="realize-movement" data-id="${escapeHtml(item.id)}">${actionLabel}</button>` : ''}${financingPayment ? `<button class="danger-button full" style="margin-top:14px" data-action="delete-card-payment" data-id="${escapeHtml(financingPayment.id)}">Deshacer pago</button>` : ''}${manualActions}`);
  }

  function deleteManualMovement(movementId) {
    const item = data.movements.find(row => row.id === movementId);
    if (!isManualMovement(item)) return;
    if (!window.confirm(`¿Eliminar el movimiento “${item.description || displayMovementType(item)}” por ${money(item.amount)}? Esta acción no se puede deshacer.`)) return;
    data.movements = data.movements.filter(row => row.id !== movementId);
    persist(); closeModal(); render(); showToast('Movimiento eliminado.');
  }

  function realizeMovement(movementId) {
    const item = data.movements.find(row => row.id === movementId);
    if (!item || cancelledMovement(item) || !['Pendiente', 'Programado'].includes(item.status)) return;
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
    if (!backup.data.loans.every(loan=>LC.valid(loan)&&window.LoanRenewal.validHistory(loan.renewals))) return false;
    if (!backup.data.installments.every(item => item && typeof item.id === 'string' && typeof item.loanId === 'string' && Number.isFinite(item.amount) && Number.isFinite(item.paid))) return false;
    if (!backup.data.collections.every(item => item && typeof item.id === 'string' && Number.isFinite(item.amount))) return false;
    if (!backup.data.movements.every(item => item && typeof item.id === 'string' && Number.isFinite(item.amount) && ['in', 'out'].includes(item.direction))) return false;
    if(!backup.data.movements.every(item=>!S.isTransfer(item)||S.valid(item)))return false;
    for (const key of ['cardFinancings', 'cardPayments']) if (backup.data[key] !== undefined && !Array.isArray(backup.data[key])) return false;
    if (!(backup.data.cardFinancings || []).every(item => item && typeof item.id === 'string' && Number.isFinite(item.receivedAmount) && Number.isFinite(item.totalToRepay) && Number.isFinite(item.paid) && (!F.isMonthly(item) || (F.valid(item) && Math.abs(F.totals(item).total-item.totalToRepay)<0.005 && item.paid>=0 && item.paid<=item.totalToRepay+0.005)))) return false;
    if(!Link.validSource({...backup.data,cardFinancings:backup.data.cardFinancings||[]}))return false;
    if(!(backup.data.cardFinancings||[]).every(f=>f.cardLink===undefined||Link.validLink(f.cardLink)&&f.repaymentMode==='single'))return false;
    if(!(backup.data.cardFinancings||[]).every(f=>f.description===undefined||typeof f.description==='string'&&f.description.length<=1000))return false;
    if (!(backup.data.cardPayments || []).every(item => item && typeof item.id === 'string' && typeof item.financingId === 'string' && Number.isFinite(item.amount))) return false;
    if (backup.data.historical !== undefined && (!Array.isArray(backup.data.historical) || !backup.data.historical.every(item => item && typeof item.id === 'string' && typeof item.label === 'string' && Number.isFinite(item.amount)))) return false;
    if (backup.data.futureHistory !== undefined && (!Array.isArray(backup.data.futureHistory) || !backup.data.futureHistory.every(validFutureRecord))) return false;
    return true;
  }

  function mergeBackupData(current, incoming) {
    const merged = normalizeData(structuredClone(current));
    for (const key of ['loans', 'installments', 'collections', 'movements', 'cardFinancings', 'cardPayments', 'historical', 'futureHistory']) {
      const existingIds = new Set(merged[key].map(item => item.id));
      for (const item of incoming[key] || []) {
        if (!existingIds.has(item.id)) {
          merged[key].push(structuredClone(item));
          existingIds.add(item.id);
        }
      }
    }
    merged.cardLinkRemovals=[...new Set([...(current.cardLinkRemovals||[]),...(incoming.cardLinkRemovals||[])])];
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
    pendingImport = null;
    openModal('Leer respaldo', file.name, '<p role="status">Leyendo el archivo…</p>');
    try {
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('No se pudo leer el archivo. Volvé a descargarlo y seleccionarlo.'));
        reader.readAsText(file);
      });
      const backup = JSON.parse(text);
      if (!validateBackup(backup)) throw new Error('El archivo no es un respaldo válido de Control de préstamos.');
      pendingImport = backup;
      openModal('Confirmar importación', file.name, `<p>Esta copia contiene <strong>${backup.data.loans.length} préstamos</strong>, ${backup.data.installments.length} cuotas y ${backup.data.collections.length} cobros.</p><p>Se incorporarán a los datos actuales. Los duplicados se omitirán.</p><div class="form-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancelar</button><button type="button" class="primary-button" data-action="confirm-import">Importar estos datos</button></div>`);
    } catch (error) {
      openModal('No se pudo leer el respaldo', file.name, `<p role="alert">${escapeHtml(error instanceof SyntaxError ? 'El archivo no contiene JSON válido.' : error.message)}</p>`);
    }
  }

  function confirmImport() {
    if (!pendingImport) return;
    try {
      const merged = mergeBackupData(data, pendingImport.data);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      data = merged;dataSnapshot=localStorage.getItem(STORAGE_KEY);Link.reconcile(localStorage);
      pendingImport = null;
      closeModal();
      page = 'loans'; loanFilter = 'Todos'; render();
      showToast('Respaldo incorporado; los duplicados se omitieron.');
      window.DriveBackup?.changed();
    } catch (_) {
      openModal('No se pudo guardar el respaldo', '', '<p role="alert">No se pudo guardar en este dispositivo. La copia descargada sigue intacta.</p>');
    }
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
    const appScope = new URL('./', document.baseURI);
    const workerUrl = new URL('sw.js', appScope);
    try {
      const registration = await navigator.serviceWorker.register(workerUrl.href, {
        scope: appScope.pathname,
        updateViaCache: 'none'
      });
      registration.update().catch(() => {});
      return registration;
    } catch (_) { return null; }
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
    if (window.PushReminders?.enabled()) return;
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
    recordFutureAmount();
    // Returning from Android's file picker must preserve the backup input.
    if (page === 'home' || page === 'collections' || page === 'calendar') render();
    checkDailyNotification(); scheduleNotificationTimeCheck();
  }

  function showToast(message) {
    toastNode.textContent = message; toastNode.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toastNode.classList.remove('show'), 2600);
  }

  document.addEventListener('click', async event => {
    const pageButton = event.target.closest('[data-page]');
    if (pageButton) { page = pageButton.dataset.page; if(pageButton.dataset.section)movementSection=pageButton.dataset.section;render(); return; }
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if(action==='toggle-future-visibility'){futureAmountHidden=!futureAmountHidden;try{localStorage.setItem('control-prestamos-future-hidden',String(futureAmountHidden));}catch(_){}render();document.querySelector('[data-action="toggle-future-visibility"]')?.focus({preventScroll:true});}
    else if (action === 'future-history') openFutureHistory();
    else if (action === 'save-future-amount') { if (recordFutureAmount('manual')) { openFutureHistory(); showToast('Monto guardado en el historial.'); } }
    else if (action === 'toggle-theme') toggleTheme();
    else if (action === 'use-loan-reference') {
      const codeInput = modalRoot.querySelector('#loan-code');
      if (codeInput) {
        codeInput.value = button.dataset.value || '';
        codeInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    else if (action === 'new-loan') openLoanForm();
    else if (action === 'close-modal') closeModal();
    else if (action === 'renew-loan') openRenewLoan(button.dataset.id);
    else if (action === 'toggle-loan-cancelled') toggleLoanCancelled(button.dataset.id);
    else if (action === 'view-cancelled-loans') {page='loans';loanFilter='Anulado';render();}
    else if (action === 'loan-detail') openLoanDetail(button.dataset.id);
    else if (action === 'edit-loan') { const loan = data.loans.find(item => item.id === button.dataset.id); if (loan?.historical) openHistoricalLoanForm(button.dataset.id); else openLoanForm(button.dataset.id); }
    else if (action === 'view-loan') openLoanDetail(button.dataset.id);
    else if (action === 'card-detail') openConfiguredCardDetail(button.dataset.card);
    else if (action === 'toggle-projection') { projectionExpanded = !projectionExpanded; render(); }
    else if (action === 'delete-loan') deleteLoan(button.dataset.id);
    else if (action === 'pay-installment') openPayForm(button.dataset.id);
    else if (action === 'undo-loan-payment') undoLoanPayment(button.dataset.id);
    else if (action === 'undo-installment-payment') undoInstallmentPayment(button.dataset.id);
    else if (action === 'loan-filter') { loanFilter = button.dataset.value; render(); }
    else if (action === 'general-filter') {generalFilter=button.dataset.value;render();}
    else if (action === 'movement-filter') { movementFilter = button.dataset.value; render(); }
    else if (action === 'month-prev' || action === 'month-next') {
      calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + (action === 'month-next' ? 1 : -1), 1);
      calendarSelectedDate = calendarMonth.getFullYear() === new Date().getFullYear() && calendarMonth.getMonth() === new Date().getMonth() ? todayKey() : dateKey(calendarMonth);
      render();
    }
    else if (action === 'calendar-today') {
      calendarSelectedDate = todayKey();
      const today = parseDate(calendarSelectedDate);
      calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      render();
    }
    else if (action === 'calendar-day') {
      calendarSelectedDate = button.dataset.date; calendarExpandedEvent = ''; render();
    } else if (action === 'calendar-event') {
      const key = `${button.dataset.kind}:${button.dataset.id}`;
      calendarExpandedEvent = calendarExpandedEvent === key ? '' : key;
      render();
    } else if (action === 'calendar-event-detail') openCalendarEvent(button.dataset.kind, button.dataset.id);
    else if (action === 'calendar-collect') openPayForm(button.dataset.id);
    else if (action === 'calendar-pay-card') openCardPaymentForm(button.dataset.id);
    else if(action==='salary-detail') document.getElementById('salary-details')?.scrollIntoView({behavior:'smooth',block:'start'});
    else if(['salary-in','salary-out','salary-return','salary-save'].includes(action)) openMovementForm('',({'salary-in':S.IN,'salary-out':S.OUT,'salary-return':S.RETURN,'salary-save':S.SAVE})[action]);
    else if (action === 'new-movement' || action === 'new-income') openMovementForm();
    else if(action==='summary-month'){summaryMonth=button.dataset.month;render();}
    else if(action==='financing-month'){financingMonth=button.dataset.month;render();}
    else if(action==='retry-card-link'){const result=Link.reconcile(localStorage);openFinancingDetail(button.dataset.id);showToast(result.error||Link.status(localStorage,data.cardFinancings.find(f=>f.id===button.dataset.id)));}
    else if (action === 'new-financing') openFinancingForm();
    else if (action === 'financing-detail') openFinancingDetail(button.dataset.id);
    else if (action === 'edit-financing') openFinancingForm(button.dataset.id);
    else if (action === 'delete-financing') openDeleteFinancing(button.dataset.id);
    else if (action === 'confirm-delete-financing') deleteFinancing(button.dataset.id);
    else if (action === 'edit-card-payment') openCardPaymentEdit(button.dataset.id);
    else if (action === 'delete-card-payment') deleteCardPayment(button.dataset.id);
    else if (action === 'pay-card') openCardPaymentForm(button.dataset.id);
    else if (action === 'schedule-card-payment') openCardScheduleForm(button.dataset.id);
    else if (action === 'movement-detail') openMovementDetail(button.dataset.id);
    else if (action === 'edit-movement') openMovementForm(button.dataset.id);
    else if (action === 'delete-movement') deleteManualMovement(button.dataset.id);
    else if (action === 'realize-movement') realizeMovement(button.dataset.id);
    else if (action === 'enable-notifications') enableNotifications();
    else if (action === 'enable-morning-push' || action === 'test-morning-push') {
      if(button.disabled)return;button.disabled=true;
      try {
        if(action==='test-morning-push') {await window.PushReminders.test();showToast('Prueba enviada. Revisá las notificaciones del celular.');}
        else if(window.PushReminders.enabled()){await window.PushReminders.disable();showToast('Avisos de mañana desactivados.');}
        else {await window.PushReminders.enable();showToast('Avisos de mañana activados para las 9:00.');}
      } catch(error){openModal('Avisos de mañana','Revisá la conexión',`<p>${escapeHtml(error.message)}</p>`);}
      finally{button.disabled=false;render();}
    }
    else if (action === 'export-backup') exportBackup();
    else if (action === 'choose-import') { const input = document.querySelector('#backup-file'); input.value = ''; input.click(); }
    else if (action === 'confirm-import') confirmImport();
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
    if(event.target.id==='summary-month' && /^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)){summaryMonth=event.target.value;render();return;}
    if(event.target.id==='financing-month' && /^\d{4}-\d{2}$/.test(event.target.value)){financingMonth=event.target.value;render();return;}
    if(event.target.id==='movement-section'){movementSection=event.target.value;movementFilter='Todos';render();return;}
    if(event.target.id==='salary-month' && /^\d{4}-\d{2}$/.test(event.target.value)){salaryMonth=event.target.value;render();return;}
    if (event.target.id === 'backup-file') importBackup(event.target.files?.[0]);
  });
  document.addEventListener('focusin', event => {
    if (event.target.matches('[data-money-input]')) event.target.value = String(event.target.value || '').replace(/\D/g, '');
  });
  document.addEventListener('focusout', event => {
    if (event.target.matches('[data-money-input]') && event.target.value.trim()) event.target.value = formatIntegerInput(parseMoney(event.target.value));
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeModal();
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.loan-card, .installment-card')) { event.preventDefault(); event.target.click(); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDateDependentViews(); });
  window.addEventListener('focus', refreshDateDependentViews);
  Link.reconcile(localStorage);
  window.addEventListener('storage',event=>{if(event.key===Link.TARGET){Link.reconcile(localStorage);if(page==='cards')render();}if(event.key===STORAGE_KEY){data=loadData();dataSnapshot=localStorage.getItem(STORAGE_KEY);closeModal();render();showToast('Datos actualizados desde otra ventana.');}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)Link.reconcile(localStorage);});
  recordFutureAmount();
  render();
  const linkedEdit=startupParams.get('editFinancing');if(linkedEdit)openFinancingForm(linkedEdit);
  window.DriveBackup?.init({ app: 'prestamos', getBackup: () => ({ format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data: structuredClone(JSON.parse(localStorage.getItem(STORAGE_KEY))||data) }) });
  window.PushReminders?.init({register:registerServiceWorker,days:()=>{
    const days=new Map();
    pendingInstallments().forEach(item=>{const cents=Math.round(dueLeft(item)*100);if(item.dueDate<todayKey()||cents<=0)return;const day=days.get(item.dueDate)||{date:item.dueDate,count:0,cents:0};day.count++;day.cents+=cents;days.set(item.dueDate,day);});
    return [...days.values()].sort((a,b)=>a.date.localeCompare(b.date));
  }});
  window.addEventListener('push-reminders-change',()=>{const node=document.querySelector('[data-push-status]');if(node)node.textContent=window.PushReminders.status();});
  scheduleDateRefresh();
  registerServiceWorker().then(() => { checkDailyNotification(); scheduleNotificationTimeCheck(); });
})();

