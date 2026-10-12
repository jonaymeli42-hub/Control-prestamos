/* Optional morning push delivery. Loan records remain local. */
(() => {
  'use strict';
  const BASE='https://avisos-prestamos.soft-bush-7594.workers.dev';
  const KEY='control-prestamos-push-v1';
  let options,timer,busy=false,retry=5000,message='',queued=false;
  const read=()=>{try{return JSON.parse(localStorage.getItem(KEY))||{};}catch{return {};}};
  const write=state=>{localStorage.setItem(KEY,JSON.stringify(state));window.dispatchEvent(new Event('push-reminders-change'));};
  const token=()=>{try{return JSON.parse(localStorage.getItem('private-drive-backup:prestamos'))?.token||'';}catch{return '';}};
  const decode=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
  async function api(path,body){
    const auth=token();if(!auth)throw Error('Conectá tu cuenta de Google en Respaldo antes de activar los avisos de mañana.');
    let result;try{result=await fetch(BASE+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+auth,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(25000)});}catch{throw Error('No se pudo conectar al servicio de avisos. Revisá Internet y que el Worker esté configurado.');}
    const value=await result.json();if(!result.ok)throw Error(value.error||'No se pudo completar la operación.');return value;
  }
  function schedule(delay=1500){clearTimeout(timer);if(!read().enabled)return;timer=setTimeout(sync,delay);}
  async function subscription(){const registration=await navigator.serviceWorker.getRegistration(new URL('./',document.baseURI).href)||await options.register();if(!registration?.pushManager)throw Error('Este navegador no admite avisos con la app cerrada.');await navigator.serviceWorker.ready;return {registration,subscription:await registration.pushManager.getSubscription()};}
  async function sync(){
    if(!read().enabled)return;if(busy){queued=true;return;}busy=true;
    try{
      const state=read();const {subscription:sub}=await subscription();if(!sub||Notification.permission!=='granted')throw Error('Volvé a activar los avisos en este dispositivo.');
      const days=options.days();const fingerprint=JSON.stringify(days);
      if(state.fingerprint===fingerprint&&state.endpoint===sub.endpoint&&state.syncedAt&&Date.now()-Date.parse(state.syncedAt)<86400000){message='';return;}
      const result=await api('/subscribe',{subscription:sub.toJSON(),publicKey:state.publicKey,days});
      // Disabling while a sync runs must not reactivate reminders.
      if(read().enabled)write({...read(),fingerprint,endpoint:sub.endpoint,syncedAt:result.syncedAt});
      message='';retry=5000;
    }catch(error){message=error.message;schedule(retry);retry=Math.min(retry*2,300000);}
    finally{busy=false;window.dispatchEvent(new Event('push-reminders-change'));if(queued){queued=false;schedule();}}
  }
  async function enable(){
    if(!('Notification' in window)||!('PushManager' in window)||!window.isSecureContext)throw Error('Abrí la app instalada o en Chrome para activar los avisos.');
    if(Notification.permission==='denied')throw Error('Permití las notificaciones de esta app en la configuración de Chrome.');
    // Request permission directly from the button gesture.
    const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
    if(permission!=='granted')throw Error('Hace falta permitir las notificaciones.');
    if(busy)throw Error('Esperá a que termine la sincronización y reintentá.');
    busy=true;let sub;
    try{
      const config=await api('/config');const registration=await options.register();if(!registration?.pushManager)throw Error('No se pudo preparar el dispositivo.');await navigator.serviceWorker.ready;
      sub=await registration.pushManager.getSubscription();
      if(sub&&sub.options.applicationServerKey){const expected=decode(config.publicKey),actual=new Uint8Array(sub.options.applicationServerKey);if(expected.length!==actual.length||expected.some((v,i)=>v!==actual[i])){await sub.unsubscribe();sub=null;}}
      if(!sub)sub=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decode(config.publicKey)});
      const days=options.days();const result=await api('/subscribe',{subscription:sub.toJSON(),publicKey:config.publicKey,days});
      write({enabled:true,publicKey:config.publicKey,endpoint:sub.endpoint,fingerprint:JSON.stringify(days),syncedAt:result.syncedAt});message='';retry=5000;
    }catch(error){message=error.message;throw error;}
    finally{busy=false;window.dispatchEvent(new Event('push-reminders-change'));if(queued){queued=false;schedule();}}
  }
  async function disable(){
    // Unsubscribe locally first, so disabling does not require Internet.
    const state=read();const {subscription:sub}=await subscription();
    if(sub){const removed=await sub.unsubscribe();if(!removed)throw Error('No se pudieron desactivar los avisos. Reintentá.');api('/unsubscribe',{subscription:sub.toJSON()}).catch(()=>{});}
    clearTimeout(timer);write({...state,enabled:false});message='';
  }
  async function test(){const state=read();if(!state.enabled)throw Error('Activá los avisos de mañana primero.');const {subscription:sub}=await subscription();if(!sub)throw Error('Volvé a activar los avisos.');await api('/test',{subscription:sub.toJSON(),publicKey:state.publicKey});}
  function status(){const state=read();if(message)return message;if(!state.enabled)return 'Podés recibir los cobros de hoy a las 9:00, hora argentina, aunque la app esté cerrada.';if(!state.syncedAt)return 'Preparando los avisos de mañana…';return 'Avisos de mañana activados · 9:00, hora argentina. Calendario actualizado: '+new Date(state.syncedAt).toLocaleString('es-AR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+'.';}
  function init(value){options=value;if(read().enabled)schedule(0);window.addEventListener('online',()=>schedule(0));document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(0);});window.addEventListener('storage',event=>{if(event.key==='private-drive-backup:prestamos')schedule(0);});}
  window.PushReminders={init,enable,disable,test,changed:()=>schedule(),status,enabled:()=>!!read().enabled};
})();
