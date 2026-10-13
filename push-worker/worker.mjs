// Dedicated morning reminders. Does not change the shared backup Worker.
const APP_ORIGIN='https://jonaymeli42-hub.github.io';
const BACKUP='https://respaldo-mis-apps.soft-bush-7594.workers.dev';
const encoder=new TextEncoder();
export const encode=value=>btoa(String.fromCharCode(...new Uint8Array(value))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export const decode=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const concat=(...arrays)=>{const result=new Uint8Array(arrays.reduce((n,a)=>n+a.length,0));let offset=0;for(const a of arrays){result.set(a,offset);offset+=a.length;}return result;};
const hash=async value=>encode(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
async function hmac(key,data){const k=await crypto.subtle.importKey('raw',key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,data));}
const expand=async(key,info,length)=>(await hmac(key,concat(info,new Uint8Array([1])))).slice(0,length);
class Failure extends Error{constructor(status,message){super(message);this.status=status;}}
function requireValue(condition,status,message){if(!condition)throw new Failure(status,message);}
function response(body,status=200){return new Response(status===204?null:JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':APP_ORIGIN,'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Vary':'Origin'}});}
export function validEndpoint(endpoint){try{const u=new URL(endpoint);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='fcm.googleapis.com'||u.hostname==='android.googleapis.com'||u.hostname==='updates.push.services.mozilla.com'||u.hostname==='web.push.apple.com'||u.hostname.endsWith('.notify.windows.com'));}catch{return false;}}
export function validSubscription(value){return value&&validEndpoint(value.endpoint)&&value.endpoint.length<=2048&&/^[A-Za-z0-9_-]{87}$/.test(value.keys?.p256dh||'')&&decode(value.keys.p256dh)[0]===4&&/^[A-Za-z0-9_-]{22}$/.test(value.keys?.auth||'');}
export function validSchedule(days){return Array.isArray(days)&&days.length<=2000&&days.every((d,i)=>d&&/^\d{4}-\d{2}-\d{2}$/.test(d.date)&&Number.isFinite(Date.parse(d.date+'T12:00:00Z'))&&new Date(d.date+'T12:00:00Z').toISOString().slice(0,10)===d.date&&Number.isSafeInteger(d.count)&&d.count>0&&d.count<=100000&&Number.isSafeInteger(d.cents)&&d.cents>0&&d.cents<=Number.MAX_SAFE_INTEGER&&(!i||days[i-1].date<d.date));}
async function jsonBody(request){requireValue(request.headers.get('content-type')?.startsWith('application/json'),415,'Se requiere JSON.');const reader=request.body?.getReader();requireValue(reader,400,'Falta el contenido.');let size=0;const chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>200000){await reader.cancel();throw new Failure(413,'Calendario demasiado grande.');}chunks.push(value);}try{return JSON.parse(new TextDecoder().decode(concat(...chunks)));}catch{throw new Failure(400,'JSON inválido.');}}
async function authenticate(request,env){
  const token=request.headers.get('authorization');
  requireValue(/^Bearer [A-Za-z0-9_-]{43}$/.test(token||''),401,'Conectá tu cuenta de Google en Respaldo primero.');
  requireValue(env.RESPALDOS?.fetch,503,'Falta vincular RESPALDOS al servicio respaldo-mis-apps en Cloudflare.');
  const result=await env.RESPALDOS.fetch(BACKUP+'/backups',{headers:{Origin:APP_ORIGIN,Authorization:token},signal:AbortSignal.timeout(20000),redirect:'manual'});
  await result.body?.cancel();
  requireValue(result.ok,result.status===401||result.status===403?401:503,result.status===401?'La conexión de Google venció. Reconectá Google en Respaldo y reintentá.':result.status===403?'El servicio de Respaldo rechazó la conexión. Revisá la cuenta conectada.':'El servicio de Respaldo no pudo validar la conexión. Reintentá en unos minutos.');
}
async function signingKeys(env){let saved=await env.AVISOS.get('vapid',{type:'json'});if(saved)return saved;const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);saved={privateKey:await crypto.subtle.exportKey('jwk',pair.privateKey),publicKey:encode(await crypto.subtle.exportKey('raw',pair.publicKey))};await env.AVISOS.put('vapid',JSON.stringify(saved));return saved;}
export async function pushRequest(subscription,payload,keys,now=Date.now()){
  const ephemeral=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
  const sender=new Uint8Array(await crypto.subtle.exportKey('raw',ephemeral.publicKey));
  const receiver=decode(subscription.keys.p256dh);
  const receiverKey=await crypto.subtle.importKey('raw',receiver,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:receiverKey},ephemeral.privateKey,256));
  const authPRK=await hmac(decode(subscription.keys.auth),shared);
  const ikm=await expand(authPRK,concat(encoder.encode('WebPush: info\0'),receiver,sender),32);
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const prk=await hmac(salt,ikm);
  const cek=await expand(prk,encoder.encode('Content-Encoding: aes128gcm\0'),16);
  const nonce=await expand(prk,encoder.encode('Content-Encoding: nonce\0'),12);
  const key=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']);
  const plaintext=concat(encoder.encode(JSON.stringify(payload)),new Uint8Array([2]));
  requireValue(plaintext.length<3900,400,'Aviso demasiado grande.');
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,plaintext));
  const header=concat(salt,new Uint8Array([0,0,16,0,65]),sender);
  const jwtHeader=encode(encoder.encode(JSON.stringify({typ:'JWT',alg:'ES256'})));
  const claims=encode(encoder.encode(JSON.stringify({aud:new URL(subscription.endpoint).origin,exp:Math.floor(now/1000)+3600,sub:'mailto:jonaymeli42@gmail.com'})));
  const signing=await crypto.subtle.importKey('jwk',keys.privateKey,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const signature=encode(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},signing,encoder.encode(jwtHeader+'.'+claims)));
  return {method:'POST',redirect:'manual',headers:{'Content-Type':'application/octet-stream','Content-Encoding':'aes128gcm',Authorization:'vapid t='+jwtHeader+'.'+claims+'.'+signature+', k='+keys.publicKey,TTL:'1800',Urgency:'high'},body:concat(header,encrypted)};
}
export function argentinaTime(now){const date=new Date(now);return {date:new Date(date.getTime()-3*3600000).toISOString().slice(0,10),hour:date.getUTCHours()-3<0?date.getUTCHours()+21:date.getUTCHours()-3};}
function reminder(day){return {title:'🔔 Cobros de hoy',body:`Tenés ${day.count} cobro${day.count===1?'':'s'} pendiente${day.count===1?'':'s'} por un total de ${new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(day.cents/100)}.`,tag:'cobros-'+day.date,date:day.date,url:'?page=calendar&date='+day.date};}
export async function sendMorning(env,now=Date.now(),send=fetch){
  const time=argentinaTime(now);if(time.hour!==9)return {sent:0};
  const keys=await env.AVISOS.get('vapid',{type:'json'});if(!keys)return {sent:0};
  let cursor,sent=0;
  do{const list=await env.AVISOS.list({prefix:'device:',limit:100,cursor});for(const {name} of list.keys){
    const device=await env.AVISOS.get(name,{type:'json'});if(!device||device.sentDate===time.date)continue;
    const day=device.days.find(d=>d.date===time.date);if(!day)continue;
    try{const options=await pushRequest(device.subscription,reminder(day),keys,now);options.signal=AbortSignal.timeout(15000);const result=await send(device.subscription.endpoint,options);await result.body?.cancel();
      if(result.status===404||result.status===410){await env.AVISOS.delete(name);continue;}
      if(result.ok){device.sentDate=time.date;await env.AVISOS.put(name,JSON.stringify(device),{expirationTtl:400*86400});sent++;}
    }catch{/* Retry on the next morning tick without logging private payloads. */}
  }cursor=list.list_complete?undefined:list.cursor;}while(cursor);
  return {sent};
}
export default {
  async fetch(request,env){try{
    const url=new URL(request.url);if(request.method==='OPTIONS'){requireValue(request.headers.get('origin')===APP_ORIGIN,403,'Origen no autorizado.');return response(null,204);}
    if(url.pathname==='/health')return response({service:'avisos-prestamos',configured:!!env.AVISOS,backupLinked:!!env.RESPALDOS?.fetch});
    requireValue(env.AVISOS,503,'Falta configurar el almacenamiento de avisos.');
    requireValue(request.headers.get('origin')===APP_ORIGIN,403,'Origen no autorizado.');
    requireValue(['/config','/subscribe','/unsubscribe','/test'].includes(url.pathname),404,'Ruta inexistente.');
    requireValue(request.method===(url.pathname==='/config'?'GET':'POST'),405,'Método no permitido.');
    await authenticate(request,env);
    if(url.pathname==='/config'){const keys=await signingKeys(env);return response({publicKey:keys.publicKey,hour:'09:00',timeZone:'America/Argentina/Buenos_Aires'});}
    const body=await jsonBody(request);requireValue(validSubscription(body.subscription),400,'El dispositivo no tiene una suscripción válida.');
    const deviceKey='device:'+await hash(body.subscription.endpoint);
    if(url.pathname==='/unsubscribe'){await env.AVISOS.delete(deviceKey);return response({disabled:true});}
    const keys=await env.AVISOS.get('vapid',{type:'json'});requireValue(keys&&body.publicKey===keys.publicKey,409,'La configuración cambió. Volvé a activar los avisos.');
    if(url.pathname==='/test'){
      requireValue(await env.AVISOS.get(deviceKey),404,'Activá los avisos primero.');
      const lock='test:'+await hash(body.subscription.endpoint);requireValue(!await env.AVISOS.get(lock),429,'Esperá un minuto antes de repetir la prueba.');
      await env.AVISOS.put(lock,'1',{expirationTtl:60});
      const options=await pushRequest(body.subscription,{title:'🔔 Prueba de avisos',body:'Este celular está conectado para recibir los cobros a las 9:00, hora argentina.',tag:'prueba-cobros',url:'?page=more'},keys);options.signal=AbortSignal.timeout(15000);
      const result=await fetch(body.subscription.endpoint,options);await result.body?.cancel();requireValue(result.ok,502,'No se pudo entregar la prueba. Reintentá o volvé a activar los avisos.');return response({sent:true});
    }
    let valid=false;try{valid=validSchedule(body.days);}catch{}requireValue(valid,400,'Calendario de cobros inválido.');
    const previous=await env.AVISOS.get(deviceKey,{type:'json'});
    await env.AVISOS.put(deviceKey,JSON.stringify({subscription:body.subscription,days:body.days,sentDate:previous?.sentDate||'',updatedAt:new Date().toISOString()}),{expirationTtl:400*86400});
    return response({active:true,syncedAt:new Date().toISOString()});
  }catch(error){return response({error:error instanceof Failure?error.message:'No se pudo completar la operación. Reintentá.'},error instanceof Failure?error.status:500);}},
  async scheduled(event,env,ctx){ctx.waitUntil(sendMorning(env));}
};
