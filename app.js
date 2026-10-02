(() => {
  'use strict';

  const STORAGE_KEY = 'control-prestamos-data';
  const BACKUP_FORMAT = 'control-prestamos-backup';
  const BACKUP_VERSION = 1;
  const LOAN_TYPES = ['1 cuota', 'Cuotas normales', 'Interés mensual + capital final', 'Préstamo corto semanal'];
  const MOVEMENT_TYPES = ['Aporte propio', 'Préstamo entregado', 'Cobro préstamo', 'Plata recibida', 'Devolución', 'Pago/Otros', 'Tarjeta recibida', 'Tarjeta pagada'];
  const INITIAL_DATA = {
    app: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    loans: [], installments: [], collections: [], movements: [],
    people: ['Harry', 'Semanal', 'Marcelo', 'Jano', '12 Brasas'],
    groups: ['H', 'S', 'M', 'J', '12B'],
    loanTypes: [...LOAN_TYPES],
    cards: ['Visa', 'Mastercard', 'Naranja', 'American Express', 'Otra'],
    settings: { currency: 'ARS', locale: 'es-AR', initialBalance: 0 }
  };

  let data = loadData();
  let page = 'home';
  let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  let loanFilter = 'Todos';
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
    for (const key of ['loans', 'installments', 'collections', 'movements', 'people', 'groups', 'loanTypes', 'cards']) {
      if (!Array.isArray(result[key])) result[key] = [...INITIAL_DATA[key]];
    }
    result.settings = { ...INITIAL_DATA.settings, ...(value.settings || {}) };
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
  function pendingInstallments() { return data.installments.filter(item => dueLeft(item) > 0.005); }
  function movementBalance() {
    return data.movements.reduce((total, item) => {
      const isUnpaidFutureExpense = item.direction === 'out' && item.status === 'Pendiente' && item.dueDate;
      return total + (isUnpaidFutureExpense ? 0 : item.direction === 'in' ? item.amount : -item.amount);
    }, Number(data.settings.initialBalance) || 0);
  }
  function upcomingPayables() {
    return data.movements.filter(item => item.direction === 'out' && item.status !== 'Pagado' && item.dueDate)
      .reduce((sum, item) => sum + Number(item.balance ?? item.amount), 0);
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
    const views = { home: renderHome, loans: renderLoans, collections: renderCollections, calendar: renderCalendar, movements: renderMovements, more: renderMore };
    app.innerHTML = (views[page] || renderHome)();
  }

  function renderHome() {
    const allPending = pendingInstallments().sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const receivable = allPending.reduce((sum, item) => sum + dueLeft(item), 0);
    const payable = upcomingPayables();
    const current = movementBalance();
    const future = current + receivable - payable;
    const next = allPending.filter(item => item.dueDate >= todayKey()).slice(0, 3);
    const recentLoans = data.loans.filter(loan => loanTotals(loan).status !== 'Pagado').slice(0, 3);
    return `${pageHeading('Buen día', 'Este es el estado de tus préstamos.', `<span class="date-pill">${formatDate(todayKey(), { day: 'numeric', month: 'short', year: 'numeric' })}</span>`)}
      <section class="summary-grid" aria-label="Resumen de dinero">
        <article class="summary-card current"><span class="label">Dinero actual</span><span class="amount">${money(current)}</span><span class="hint">Según tus movimientos</span></article>
        <article class="summary-card future"><span class="label">Dinero futuro</span><span class="amount">${money(future)}</span><span class="hint">Actual + cobros − pagos previstos</span></article>
        <article class="summary-card receivable"><span class="label">A recibir</span><span class="amount">${money(receivable)}</span><span class="hint">Saldo de cuotas pendientes</span></article>
        <article class="summary-card payable"><span class="label">A pagar</span><span class="amount">${money(payable)}</span><span class="hint">Pagos pendientes con vencimiento</span></article>
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

  function renderCalendar() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const first = new Date(year, month, 1);
    const offset = (first.getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    const slots = Math.ceil((offset + days) / 7) * 7;
    const itemsByDate = new Map();
    data.installments.forEach(item => {
      const key = item.dueDate;
      if (!itemsByDate.has(key)) itemsByDate.set(key, []);
      itemsByDate.get(key).push(item);
    });
    const cells = Array.from({ length: slots }, (_, index) => {
      const dayNumber = index - offset + 1;
      const date = new Date(year, month, dayNumber);
      const key = dateKey(date);
      const inMonth = date.getMonth() === month;
      const due = (itemsByDate.get(key) || []).filter(item => dueLeft(item) > 0.005);
      const paid = (itemsByDate.get(key) || []).length > 0 && due.length === 0;
      const classes = ['calendar-day', !inMonth ? 'other' : '', key === todayKey() ? 'today' : '', due.length ? `has-due ${key < todayKey() ? 'overdue-dot' : ''}` : paid ? 'has-due paid-dot' : ''].filter(Boolean).join(' ');
      return `<button class="${classes}" data-action="calendar-day" data-date="${key}" ${!inMonth ? 'disabled' : ''}>${date.getDate()}${due.length > 1 ? `<span class="sr-only">${due.length} cuotas</span>` : ''}</button>`;
    }).join('');
    return `${pageHeading('Calendario', 'Vencimientos de tus cuotas.')}
      <section class="calendar"><div class="calendar-head"><button aria-label="Mes anterior" data-action="month-prev">‹</button><strong>${new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(calendarMonth)}</strong><button aria-label="Mes siguiente" data-action="month-next">›</button></div>
      <div class="calendar-grid">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(day => `<div class="weekday">${day}</div>`).join('')}${cells}</div>
      <div class="calendar-legend"><span class="legend-item"><i class="dot"></i>Pendiente</span><span class="legend-item"><i class="dot paid"></i>Pagada</span><span class="legend-item"><i class="dot today"></i>Hoy</span></div></section>
      <section id="calendar-day-list" class="section"><div class="section-head"><h3>Cuotas del mes</h3></div>${monthItems(year, month)}</section>`;
  }

  function monthItems(year, month) {
    const items = data.installments.filter(item => {
      const date = parseDate(item.dueDate);
      return date && date.getFullYear() === year && date.getMonth() === month;
    }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return items.length ? `<div class="list">${items.map(item => renderInstallmentCard(item)).join('')}</div>` : emptyState('▦', 'Sin vencimientos este mes', 'Cuando haya cuotas con vencimiento en este mes, aparecerán acá.');
  }

  function renderMovements() {
    const items = [...data.movements].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    const directionLabel = direction => direction === 'in' ? 'Entrada' : 'Salida';
    return `${pageHeading('Movimientos', `${items.length} registros`, '<button class="primary-button" data-action="new-movement">＋ Registrar</button>')}
      ${items.length ? `<div class="list">${items.map(item => `<article class="card movement-card" data-action="movement-detail" data-id="${escapeHtml(item.id)}"><div class="row-top"><div><div class="person">${escapeHtml(item.type)}</div><div class="subtle">${formatDate(item.date, { day: 'numeric', month: 'short', year: 'numeric' })}${item.person ? ` · ${escapeHtml(item.person)}` : ''}</div></div><div class="amount ${item.direction === 'in' ? 'movement-in' : 'movement-out'}">${item.direction === 'in' ? '+' : '−'}${money(item.amount)}</div></div><div class="inline-details"><span>${directionLabel(item.direction)}</span>${item.description ? `<span>${escapeHtml(item.description)}</span>` : ''}</div></article>`).join('')}</div>` : emptyState('↔', 'Todavía no hay movimientos', 'Los préstamos y cobros se anotan automáticamente. También podés registrar otros movimientos.', '<button class="primary-button" data-action="new-movement">Registrar movimiento</button>')}`;
  }

  function renderMore() {
    return `${pageHeading('Más', 'Configuración y respaldo de tus datos.')}
      <section class="backup-card"><h3>📤 Exportar respaldo</h3><p>Descargá un archivo JSON con todos tus préstamos, cuotas, cobros, movimientos y listas.</p><button class="primary-button full" data-action="export-backup">Exportar respaldo</button></section>
      <section class="backup-card"><h3>📥 Importar respaldo</h3><p>Elegí un respaldo JSON válido para incorporar sus datos. Los datos actuales se conservarán y los registros duplicados se omitirán, incluso si importás el mismo respaldo más de una vez.</p><button class="secondary-button full" data-action="choose-import">Seleccionar archivo JSON</button><input class="sr-only" type="file" id="backup-file" accept="application/json,.json"></section>
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
    if (!Number.isFinite(capital) || capital <= 0 || !Number.isFinite(rate) || rate < 0 || !Number.isInteger(count) || count < 1 || count > 240 || !parseDate(firstDue)) {
      showToast('Revisá capital, tasa, cuotas y vencimiento.'); return;
    }
    const person = String(form.get('person')).trim();
    const loan = {
      id: id(), code: String(form.get('code')).trim() || `PRE-${String(data.loans.length + 1).padStart(3, '0')}`,
      person, group: String(form.get('group')), mode, capital: roundMoney(capital), rate,
      count: mode === '1 cuota' ? 1 : count, firstDue,
      notes: String(form.get('notes')).trim(), createdAt: new Date().toISOString()
    };
    const schedule = calculateSchedule({ capital: loan.capital, rate, count: loan.count, mode, firstDue }).map(item => ({ ...item, loanId: loan.id }));
    data.loans.unshift(loan);
    data.installments.push(...schedule);
    data.movements.unshift({ id: id(), date: todayKey(), createdAt: new Date().toISOString(), type: 'Préstamo entregado', person, description: `${loan.code} · ${loan.mode}`, direction: 'out', amount: loan.capital, loanId: loan.id });
    persist(); closeModal(); page = 'loans'; render(); showToast('Préstamo y cuotas creados.');
  }

  function openLoanDetail(loanId) {
    const loan = data.loans.find(item => item.id === loanId);
    if (!loan) return;
    const totals = loanTotals(loan);
    const installments = totals.installments.map(item => `<div class="installment-line"><div class="due"><strong>Cuota ${item.number} · ${formatDate(item.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })}</strong>Pagado ${money(item.paid)} de ${money(item.amount)}</div><div style="text-align:right"><div class="due-amount">${money(dueLeft(item))}</div>${dueLeft(item) > 0.005 ? `<button class="text-button" data-action="pay-installment" data-id="${escapeHtml(item.id)}">Cobrar</button>` : '<span class="badge paid">Pagada</span>'}</div></div>`).join('');
    openModal(`Préstamo ${loan.code}`, loan.person, `<div class="card kv-list"><div class="kv"><span>Modalidad</span><b>${escapeHtml(loan.mode)}</b></div><div class="kv"><span>Capital prestado</span><b>${money(loan.capital)}</b></div><div class="kv"><span>Total a recibir</span><b>${money(totals.total)}</b></div><div class="kv"><span>Cobrado</span><b>${money(totals.paid)}</b></div><div class="kv"><span>Saldo</span><b>${money(totals.balance)}</b></div><div class="kv"><span>Estado</span>${badge(totals.status)}</div>${loan.notes ? `<div class="kv"><span>Notas</span><b>${escapeHtml(loan.notes)}</b></div>` : ''}</div><section class="section"><div class="section-head"><h3>Cuotas</h3></div><div class="installment-table">${installments}</div></section>`);
  }

  function openPayForm(installmentId) {
    const item = data.installments.find(row => row.id === installmentId);
    if (!item) return;
    const loan = data.loans.find(row => row.id === item.loanId);
    const left = dueLeft(item);
    if (!loan || left <= 0.005) return;
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
    if (!item || !loan || !Number.isFinite(amount) || amount <= 0 || amount > dueLeft(item) + 0.005 || !parseDate(date)) {
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
    const body = `<form id="movement-form"><div class="form-grid"><div class="field"><label for="movement-type">Tipo</label><select id="movement-type" name="type">${MOVEMENT_TYPES.filter(type => type !== 'Préstamo entregado' && type !== 'Cobro préstamo').map(type => `<option>${escapeHtml(type)}</option>`).join('')}</select></div><div class="field"><label for="movement-date">Fecha</label><input id="movement-date" name="date" type="date" value="${todayKey()}" required></div><div class="field"><label for="movement-direction">Movimiento</label><select id="movement-direction" name="direction"><option value="in">Entrada</option><option value="out">Salida</option></select></div><div class="field"><label for="movement-amount">Monto</label><input id="movement-amount" name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required></div><div class="field"><label for="movement-person">Persona</label><input id="movement-person" name="person" list="movement-people"><datalist id="movement-people">${data.people.map(person => `<option value="${escapeHtml(person)}">`).join('')}</datalist></div><div class="field"><label for="movement-due">Vencimiento (si aplica)</label><input id="movement-due" name="dueDate" type="date"></div><div class="field full-span"><label for="movement-description">Descripción</label><input id="movement-description" name="description" maxlength="300" placeholder="Detalle opcional"></div></div><div class="form-actions"><button type="button" class="secondary-button" data-action="close-modal">Cancelar</button><button class="primary-button" type="submit">Guardar movimiento</button></div></form>`;
    openModal('Registrar movimiento', 'Este registro actualiza el resumen de dinero.', body);
    modalRoot.querySelector('#movement-form').addEventListener('submit', event => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      const amount = roundMoney(Number(values.get('amount')));
      const date = String(values.get('date'));
      const dueDate = String(values.get('dueDate'));
      if (!Number.isFinite(amount) || amount <= 0 || !parseDate(date) || (dueDate && !parseDate(dueDate))) { showToast('Revisá el monto y las fechas.'); return; }
      data.movements.unshift({ id: id(), type: String(values.get('type')), date, createdAt: new Date().toISOString(), person: String(values.get('person')).trim(), description: String(values.get('description')).trim(), direction: String(values.get('direction')), amount, dueDate: dueDate || '', balance: amount, status: dueDate ? 'Pendiente' : 'Registrado' });
      persist(); closeModal(); render(); showToast('Movimiento guardado.');
    });
  }

  function openMovementDetail(movementId) {
    const item = data.movements.find(row => row.id === movementId);
    if (!item) return;
    const canPay = item.direction === 'out' && item.status === 'Pendiente' && item.dueDate;
    openModal(item.type, formatDate(item.date, { day: 'numeric', month: 'long', year: 'numeric' }), `<div class="card kv-list"><div class="kv"><span>Persona</span><b>${escapeHtml(item.person || '—')}</b></div><div class="kv"><span>Descripción</span><b>${escapeHtml(item.description || '—')}</b></div><div class="kv"><span>Tipo</span><b>${item.direction === 'in' ? 'Entrada' : 'Salida'}</b></div><div class="kv"><span>Monto</span><b>${money(item.amount)}</b></div>${item.dueDate ? `<div class="kv"><span>Vencimiento</span><b>${formatDate(item.dueDate)}</b></div>` : ''}${item.status ? `<div class="kv"><span>Estado</span><b>${escapeHtml(item.status)}</b></div>` : ''}</div>${canPay ? `<button class="primary-button full" style="margin-top:14px" data-action="settle-movement" data-id="${escapeHtml(item.id)}">Marcar como pagado</button>` : ''}`);
  }

  function settleMovement(movementId) {
    const item = data.movements.find(row => row.id === movementId);
    if (!item || item.direction !== 'out' || item.status !== 'Pendiente') return;
    item.status = 'Pagado';
    item.date = todayKey();
    item.createdAt = new Date().toISOString();
    persist(); closeModal(); render(); showToast('Pago registrado.');
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
    return true;
  }

  function mergeBackupData(current, incoming) {
    const merged = normalizeData(structuredClone(current));
    for (const key of ['loans', 'installments', 'collections', 'movements']) {
      const existingIds = new Set(merged[key].map(item => item.id));
      for (const item of incoming[key]) {
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
    else if (action === 'pay-installment') openPayForm(button.dataset.id);
    else if (action === 'loan-filter') { loanFilter = button.dataset.value; render(); }
    else if (action === 'month-prev' || action === 'month-next') { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + (action === 'month-next' ? 1 : -1), 1); render(); }
    else if (action === 'calendar-day') {
      const matching = (data.installments.filter(item => item.dueDate === button.dataset.date));
      if (matching.length) { const list = document.querySelector('#calendar-day-list'); list.innerHTML = `<div class="section-head"><h3>Cuotas del ${formatDate(button.dataset.date, { day: 'numeric', month: 'long' })}</h3></div><div class="list">${matching.map(item => renderInstallmentCard(item)).join('')}</div>`; list.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    } else if (action === 'new-movement') openMovementForm();
    else if (action === 'movement-detail') openMovementDetail(button.dataset.id);
    else if (action === 'settle-movement') settleMovement(button.dataset.id);
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
  document.querySelector('#quick-add').addEventListener('click', openLoanForm);

  render();
})();
