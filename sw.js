const CACHE_NAME = 'control-prestamos-shell-v27';
const SHELL_FILES = ['./index.html', './styles.css', './app.js', './financing-overview.js?v=1', './salary-savings.js?v=returns-1', './push-reminders.js?v=morning-1', './financing-model.js?v=received-installments-1', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png', './drive-backup.js', './drive-backup.css', './drive-respaldos.html'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('control-prestamos-') && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (new URL(event.request.url).pathname.endsWith('/drive-callback.html')) return;
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request).then(response => response || caches.match('./index.html'))));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '?page=collections', self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
    const current = clients.find(client => new URL(client.url).href.startsWith(self.registration.scope));
    if (current) return current.navigate(target).then(client => (client || current).focus());
    return self.clients.openWindow(target);
  }));
});

self.addEventListener('push', event => {
  event.waitUntil((async()=>{
    let message;try{message=event.data?.json();}catch{}
    if(!message||typeof message.body!=='string')message={title:'🔔 Cobros',body:'Abrí Control Préstamos para consultar tus cobros.',tag:'cobros',url:'?page=collections'};
    const target=new URL(message.url||'?page=collections',self.registration.scope);
    if(target.origin!==self.location.origin||!target.pathname.startsWith(new URL(self.registration.scope).pathname))target.href=new URL('?page=collections',self.registration.scope).href;
    await self.registration.showNotification(String(message.title||'🔔 Cobros').slice(0,100),{body:message.body.slice(0,1000),tag:String(message.tag||'cobros').slice(0,100),renotify:false,icon:new URL('icon-192.png',self.registration.scope).href,badge:new URL('icon-192.png',self.registration.scope).href,data:{url:target.href}});
  })());
});
