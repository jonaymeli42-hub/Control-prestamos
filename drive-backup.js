/* Private backups: app data stays local; only explicit connection enables uploads. */
(() => {
  'use strict';
  const BASE = 'https://respaldo-mis-apps.soft-bush-7594.workers.dev';
  let app, key, getBackup, timer, retry = 5000, busy = false, message = '', callbackBusy = false;
  const read = () => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } };
  const write = state => { localStorage.setItem(key, JSON.stringify(state)); paint(); };
  const b64 = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const hash = async text => b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
  async function api(path, body, authenticated = true) {
    const headers = {};
    if (authenticated) headers.Authorization = 'Bearer ' + (read().token || '');
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const result = await fetch(BASE + path, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', credentials: 'omit', signal: controller.signal });
      const value = await result.json();
      if (!result.ok) { const error = new Error(value.error || 'No se pudo completar la operación.'); error.status = result.status; throw error; }
      return value;
    } finally { clearTimeout(timeout); }
  }
  function failure(error) {
    message = error.status === 401 ? 'Necesitás reconectar con Google.' : error.message || 'No se pudo completar la copia. Reintentando.';
    if (error.status === 401) write({ ...read(), reconnect: true });
    paint();
  }
  function schedule(delay = 2500) { clearTimeout(timer); timer = setTimeout(flush, delay); }
  function changed() {
    if (!key) return;
    try { const state = read(); write({ ...state, pending: true, revision: (state.revision || 0) + 1 }); if (state.token && !state.reconnect) schedule(); }
    catch { message = 'No se pudo guardar el estado del respaldo. Conservá una copia manual.'; paint(); }
  }
  async function flush() {
    const state = read();
    if (busy || !getBackup || !state.token || state.reconnect || !state.pending) return;
    if (!navigator.onLine) { message = 'Pendiente: esperando conexión a Internet.'; paint(); return; }
    busy = true; message = ''; paint();
    try {
      const backup = getBackup();
      const fingerprint = await hash(JSON.stringify(backup.data));
      if (fingerprint === state.hash) {
        const current = read(); if (current.revision === state.revision) write({ ...current, pending: false });
      } else {
        const result = await api('/backups', backup);
        if (result.saved !== true || !result.file?.id || !result.file?.createdTime) throw new Error('El servicio no confirmó la copia.');
        const current = read();
        // A disconnected/reconnected session must not be resurrected by an old request.
        if (current.token === state.token) write({ ...current, hash: fingerprint, last: result.file.createdTime, pending: current.revision !== state.revision });
      }
      retry = 5000;
    } catch (error) { if (read().token === state.token) failure(error); retry = Math.min(retry * 2, 120000); }
    finally { busy = false; paint(); if (read().pending && !read().reconnect) schedule(retry); }
  }
  async function connect() {
    const verifier = b64(crypto.getRandomValues(new Uint8Array(32)));
    sessionStorage.setItem(key + ':verifier', verifier);
    localStorage.setItem(key + ':pending-auth', JSON.stringify({ verifier, expires: Date.now() + 600000 }));
    const result = await api('/auth/start', { app, proof: await hash(verifier) }, false);
    const target = new URL(result.url);
    if (target.origin !== 'https://accounts.google.com' || target.pathname !== '/o/oauth2/v2/auth') throw new Error('Respuesta de conexión inválida.');
    location.assign(target.href);
  }
  async function disconnect() {
    if (!confirm('¿Desconectar este dispositivo? Las copias en Drive y las otras conexiones se conservarán.')) return;
    clearTimeout(timer);
    try { await api('/auth/disconnect', {}); }
    catch (error) { if (error.status !== 401) throw error; }
    write({ pending: true, revision: (read().revision || 0) + 1 }); message = ''; paint();
  }
  function paint() {
    if (!key) return;
    const state = read();
    for (const host of document.querySelectorAll('[data-drive-backup]')) {
      if (!host.querySelector('[data-drive-status]')) {
        host.innerHTML = '<h3>Respaldo privado en Google Drive</h3><p data-drive-status role="status" aria-live="polite"></p><p data-drive-last></p><div class="drive-actions"><button type="button" data-drive-action="connect">Conectar con Google</button><button type="button" data-drive-action="save">Crear copia ahora</button><button type="button" data-drive-action="disconnect">Desconectar este dispositivo</button><a href="drive-respaldos.html">Ver y descargar copias</a></div><p class="drive-note">Requiere la app abierta e Internet. Conservá también copias manuales. No se restauran datos automáticamente.</p>';
      }
      host.querySelector('[data-drive-status]').textContent = state.reconnect ? 'Necesitás reconectar con Google.' : !state.token ? 'Desconectado. Tus datos siguen guardándose localmente.' : busy ? 'Enviando copia…' : state.pending ? 'Pendiente de respaldo.' : state.last ? 'Última copia confirmada.' : 'Conectado; esperando la primera copia.';
      host.querySelector('[data-drive-last]').textContent = (state.last ? 'Última copia confirmada: ' + new Date(state.last).toLocaleString('es-AR') + '. ' : '') + message;
      host.querySelector('[data-drive-action="connect"]').hidden = !!state.token && !state.reconnect;
      host.querySelector('[data-drive-action="connect"]').textContent = state.reconnect ? 'Reconectar con Google' : 'Conectar con Google';
      host.querySelector('[data-drive-action="save"]').hidden = !getBackup || !state.token || state.reconnect;
      host.querySelector('[data-drive-action="save"]').disabled = busy;
      host.querySelector('[data-drive-action="disconnect"]').hidden = !state.token;
    }
  }
  async function list() {
    const host = document.querySelector('[data-drive-files]');
    if (!host) return;
    host.replaceChildren();
    const result = await api('/backups');
    if (!Array.isArray(result.files)) throw new Error('Listado inválido.');
    for (const file of result.files) {
      const row = document.createElement('li');
      const label = document.createElement('span'); label.textContent = file.name + ' · ' + new Date(file.createdTime).toLocaleString('es-AR') + ' ';
      const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Descargar';
      button.onclick = async () => {
        button.disabled = true;
        try {
          const backup = await api('/backups/download?id=' + encodeURIComponent(file.id));
          if (app === 'prestamos' ? backup.format !== 'control-prestamos-backup' || !Array.isArray(backup.data?.loans) : backup.app !== 'Control de Tarjetas' || !Array.isArray(backup.data?.expenses)) throw new Error('El archivo no corresponde a esta app.');
          const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
          const link = document.createElement('a'); link.href = url; link.download = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_'); document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          message = 'Descarga solicitada. Importá el archivo manualmente si necesitás recuperar datos.'; paint();
        } catch (error) { failure(error); } finally { button.disabled = false; }
      };
      row.append(label, button); host.append(row);
    }
    if (!result.files.length) host.textContent = 'No hay copias para esta app en la cuenta conectada.';
    message = 'Listado actualizado. Se muestran hasta las 100 copias más recientes.'; paint();
  }
  async function callback() {
    callbackBusy = true;
    const ticket = new URLSearchParams(location.hash.slice(1)).get('ticket');
    history.replaceState(null, '', location.pathname);
    try {
      const pending = JSON.parse(localStorage.getItem(key + ':pending-auth') || 'null');
      const verifier = sessionStorage.getItem(key + ':verifier') || (pending?.expires > Date.now() ? pending.verifier : null);
      if (!ticket || !verifier) throw new Error('La conexión debe completarse en el mismo navegador donde la iniciaste. Volvé a conectar.');
      const result = await api('/auth/exchange', { ticket, verifier }, false);
      if (result.app !== app || !/^[A-Za-z0-9_-]{43}$/.test(result.token || '')) throw new Error('Respuesta de conexión inválida.');
      const previous = read();
      write({ token: result.token, pending: true, revision: (previous.revision || 0) + 1, last: previous.last });
      sessionStorage.removeItem(key + ':verifier');
      localStorage.removeItem(key + ':pending-auth');
      location.replace('./drive-respaldos.html?connected=1');
    } catch (error) { failure(error); const status = document.querySelector('[data-callback-status]'); if (status) status.textContent = message; }
    finally { callbackBusy = false; }
  }
  function init(options) {
    app = options.app; key = 'private-drive-backup:' + app; getBackup = options.getBackup;
    paint();
    new MutationObserver(() => { if ([...document.querySelectorAll('[data-drive-backup]')].some(host => !host.querySelector('[data-drive-status]'))) paint(); }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', async event => {
      const button = event.target.closest('[data-drive-action]'); if (!button || callbackBusy) return;
      button.disabled = true;
      try {
        message = '';
        if (button.dataset.driveAction === 'connect') await connect();
        if (button.dataset.driveAction === 'disconnect') await disconnect();
        if (button.dataset.driveAction === 'save') { changed(); clearTimeout(timer); await flush(); }
        if (button.dataset.driveAction === 'list') await list();
      } catch (error) { failure(error); } finally { button.disabled = false; paint(); }
    });
    window.addEventListener('online', () => { message = ''; schedule(0); });
    window.addEventListener('storage', event => { if (event.key === key) { paint(); if (read().pending) schedule(); } });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(0); });
    if (options.callback) callback();
    else if (getBackup && read().token) changed();
  }
  window.DriveBackup = { init, changed };
  if (document.body.dataset.driveApp) init({ app: document.body.dataset.driveApp, callback: document.body.dataset.driveCallback === 'true' });
})();
