const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const origin = 'https://jonaymeli42-hub.github.io';
const root = origin + '/Control-prestamos/';
function worker(fetch, caches) {
  const listeners = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf8'), {
    self: { location: new URL(root + 'sw.js'), skipWaiting: async () => {}, addEventListener: (name, fn) => listeners[name] = fn },
    URL, Request, fetch, caches
  });
  return listeners;
}
test('worker revalidates old script URLs and updates their offline copy', async () => {
  let requested, cached;
  const fresh = new Response('updated editing code');
  const listeners = worker(async request => { requested = request; return fresh; }, {
    open: async () => ({ put: async (request, response) => { cached = [request.url, await response.text()]; } })
  });
  let result;
  const request = new Request(root + 'app.js?v=loan-cancellation-1');
  listeners.fetch({ request, respondWith: promise => result = promise });
  assert.equal(await (await result).text(), 'updated editing code');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requested.cache, 'no-cache');
  assert.equal(requested.url, request.url);
  assert.deepEqual(cached, [request.url, 'updated editing code']);
});
test('offline startup caches the same versioned app script as the HTML', async () => {
  let shell;
  const listeners = worker(async () => { throw Error('offline'); }, {
    open: async () => ({ addAll: async files => { shell = files; } }),
    match: async () => new Response('offline editing code')
  });
  let installed;
  listeners.install({ waitUntil: promise => installed = promise });
  await installed;
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const script = html.match(/src="(app\.js\?[^\"]+)"/)[1];
  assert.ok(shell.includes('./' + script));
  let response;
  listeners.fetch({ request: new Request(root + script), respondWith: promise => response = promise });
  assert.equal(await (await response).text(), 'offline editing code');
});
