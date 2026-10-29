import {createRoom,reduce,publicRoom} from './local-engine.js?v=complete-23';
const ROOT='galaxySpark';
const randomHex=n=>{const a=new Uint8Array(n);crypto.getRandomValues(a);return Array.from(a,x=>x.toString(16).padStart(2,'0')).join('')};
const clean=r=>{if(!r)return r;for(const k of ['board','found','selected','schedule'])r[k]=r[k]||[];r.teams=r.teams||{};r.requests=r.requests||{};return r};
const errorText=e=>/permission.denied/i.test(e.code||e.message||'')?'Firebase weigert deze actie. Controleer of de gratis Mission Galaxy-spelregels in het eigen project gepubliceerd zijn.':e.message||'Verbinding met de wedstrijd mislukt.';
const due=(r,now)=>{if(!r)return false;const key={preview:'previewUntil',playing:'turnDeadline',review:'reviewUntil',animating:'animUntil'}[r.status];return !!key&&now>=r[key]};
export class SparkTransport {
 static async connect(config){
  if(config.projectId!=='mission-galaxy-3d247'||!config.databaseURL?.startsWith('https://mission-galaxy-3d247-default-rtdb.europe-west1.firebasedatabase.app'))throw Error('Dit spel mag uitsluitend het afzonderlijke Mission Galaxy-project gebruiken.');
  const base='https://www.gstatic.com/firebasejs/10.14.1/';
  const [apps,auths,dbs]=await Promise.all([import(base+'firebase-app.js'),import(base+'firebase-auth.js'),import(base+'firebase-database.js')]);
  const app=apps.initializeApp(config,'mission-galaxy-spark');const auth=auths.getAuth(app);await auths.setPersistence(auth,auths.browserSessionPersistence);await auth.authStateReady();if(!auth.currentUser)await auths.signInAnonymously(auth);
  return new SparkTransport(auth,dbs,dbs.getDatabase(app));
 }
 constructor(auth,api,db){this.auth=auth;this.api=api;this.db=db;this.code='';this.offset=0;this.online=false;this.everOnline=false;this.mustPause=false;this.cached=null;this.room=null;this.host=false;this.hostOnline=false;this.unsubs=[];this.hostUnsubs=[];this.pending=new Set();this.chain=Promise.resolve();this.waiters=new Set();this.presence=null;this.generation=0;
  this.general=[api.onValue(api.ref(db,'.info/serverTimeOffset'),s=>this.offset=s.val()||0),api.onValue(api.ref(db,'.info/connected'),s=>{const before=this.online;this.online=s.val()===true;if(!this.online&&this.everOnline&&this.host)this.mustPause=true;if(this.online)this.everOnline=true;this.onConnectivity?.(this.online);if(this.online&&!before&&this.host)this.setPresence().catch(e=>this.onError?.(e));})];
 }
 get uid(){return this.auth.currentUser.uid}
 now(){return Date.now()+this.offset}
 ref(path){return this.api.ref(this.db,ROOT+'/'+path)}
 enqueue(fn){const generation=this.generation;const run=this.chain.then(()=>{if(generation!==this.generation)throw Error('De missie is gewijzigd.');return fn()});this.chain=run.catch(()=>{});return run}
 async create(){this.leave();let code,secret;for(let tries=0;tries<3;tries++){code=String(100000+parseInt(randomHex(4),16)%900000);secret=randomHex(24);try{await this.api.set(this.ref('credentials/'+code),{owner:this.uid,secret,createdAt:this.api.serverTimestamp()});break}catch(e){if(tries===2)throw Error(errorText(e));}}
  this.code=code;const credentials=(await this.api.get(this.ref('credentials/'+code))).val();const state=createRoom(this.uid,this.now(),secret);state.createdAt=credentials.createdAt;await this.api.set(this.ref('private/'+code),state);await this.publish(state);return {code,secret,serverNow:this.now()};
 }
 async recover(code,secret){if(!/^\d{6}$/.test(code)||!/^[a-f0-9]{48}$/.test(secret))throw Error('De spelcode of geheime leerkrachtcode klopt niet.');this.leave();this.code=code;
  try{await this.api.set(this.ref('claims/'+code+'/'+this.uid),{secret,at:this.api.serverTimestamp()});await this.api.update(this.ref('credentials/'+code),{owner:this.uid});await this.hostAction(this.uid,'recover',{secret});return {serverNow:this.now()}}catch(e){throw Error(/permission/i.test(e.code||e.message)?'De geheime leerkrachtcode klopt niet of deze missie is verlopen.':errorText(e));}
 }
 async join(code,name){this.code=code;const existing=(await this.api.get(this.ref('replies/'+code+'/'+this.uid))).val();
  if(existing?.ok){try{const room=(await this.api.get(this.ref('rooms/'+code))).val();if(room?.teams?.[this.uid])return {serverNow:this.now()}}catch{}}
  return this.request('join',{name});
 }
 attach(code,{onState,onConnectivity,onError}){this.leave();this.code=code;this.onState=onState;this.onConnectivity=onConnectivity;this.onError=onError;const generation=this.generation;
  this.unsubs.push(this.api.onValue(this.ref('rooms/'+code),s=>{if(generation!==this.generation)return;const room=s.val();if(!room)return onError(Error('Deze missie bestaat niet meer.'));this.room=room;const host=room.hostUid===this.uid;if(host&&!this.host)this.startHost();else if(!host&&this.host)this.stopHost();this.emit();},onError));
  this.unsubs.push(this.api.onValue(this.ref('presence/'+code),s=>{if(generation!==this.generation)return;this.hostOnline=s.val()?.online===true;this.emit();},onError));onConnectivity(this.online);return ()=>this.leave();
 }
 emit(){if(this.room)this.onState?.({...this.room,hostOnline:this.hostOnline});}
 startHost(){this.host=true;const generation=this.generation;this.hostUnsubs.push(this.api.onValue(this.ref('private/'+this.code),s=>{if(generation===this.generation)this.cached=clean(s.val());},e=>this.onError?.(e)));
  this.hostUnsubs.push(this.api.onValue(this.ref('requests/'+this.code),s=>{if(generation!==this.generation)return;for(const [uid,request] of Object.entries(s.val()||{})){const key=uid+':'+request.id;if(this.pending.has(key)||this.cached?.requests?.[uid]?.id===request.id)continue;this.pending.add(key);this.enqueue(async()=>{try{await this.hostAction(uid,request.action,request,request.id);await this.api.set(this.ref('replies/'+this.code+'/'+uid),{id:request.id,ok:true,at:this.api.serverTimestamp()});}catch(e){await this.api.set(this.ref('replies/'+this.code+'/'+uid),{id:request.id,ok:false,message:e.message||'Actie geweigerd.',at:this.api.serverTimestamp()}).catch(()=>{});}finally{this.pending.delete(key);}}).catch(e=>this.onError?.(e));}},e=>this.onError?.(e)));
  this.setPresence().catch(e=>this.onError?.(e));this.pulse=setInterval(()=>this.pulseHost(),250);
 }
 stopHost(){this.host=false;clearInterval(this.pulse);this.hostUnsubs.forEach(u=>u());this.hostUnsubs=[];this.cached=null;this.presence?.cancel().catch(()=>{});this.presence=null;}
 async setPresence(){if(!this.host||!this.online||!this.code)return;const reference=this.ref('presence/'+this.code);this.presence=this.api.onDisconnect(reference);await this.presence.set({online:false,seen:this.api.serverTimestamp()});await this.api.set(reference,{online:true,seen:this.api.serverTimestamp()});}
 pulseHost(){if(!this.host||!this.online||!this.cached||this.pulseBusy)return;const r=this.cached,now=this.now();if(r.status==='final'&&!this.mustPause)return;if(!this.mustPause&&!due(r,now)&&now-r.hostSeen<2500)return;this.pulseBusy=true;this.enqueue(async()=>{try{if(this.mustPause){if(!['lobby','paused','final'].includes(this.cached.status)){const frozenAt=Math.max(this.cached.updatedAt,Math.min(this.now(),this.cached.hostSeen+1000));await this.hostAction(this.uid,'pause',{},undefined,frozenAt);}this.mustPause=false;}else await this.hostAction(this.uid,'tick',{});}finally{this.pulseBusy=false;}}).catch(e=>this.onError?.(e));}
 async hostAction(uid,action,payload={},requestId,clock){if(!['join','pick','tick','recover','start','pause','resume','rename','remove','finish','restart'].includes(action))throw Error('Actie niet toegestaan.');const code=this.code;let problem=null;const now=clock??this.now();await this.api.get(this.ref('private/'+code));const outcome=await this.api.runTransaction(this.ref('private/'+code),value=>{problem=null;const current=clean(value);if(!current){problem=Error('Deze missie bestaat niet.');return;}if(requestId&&current.requests[uid]?.id===requestId)return;
   try{const next=reduce(current,uid,action,payload,now);if(next.revision<=current.revision){next.revision=current.revision+1;next.updatedAt=now;}if(requestId)next.requests[uid]={id:requestId,at:now};return next;}catch(e){problem=e;return;}
  },{applyLocally:false});if(!outcome.committed){if(problem)throw problem;return {serverNow:this.now()};}const next=clean(outcome.snapshot.val());this.cached=next;await this.publish(next,code);return {serverNow:this.now()};}
 async publish(state,code=this.code){const visible=publicRoom(clean(state));visible.teamCount=Object.keys(state.teams||{}).length;delete visible.schedule;delete visible.order;await this.api.runTransaction(this.ref('rooms/'+code),current=>!current||(current.revision||0)<visible.revision?visible:undefined,{applyLocally:false});}
 async request(action,payload){if(!this.online)throw Error('Wacht tot de verbinding hersteld is.');const code=this.code,id=randomHex(16);const ack=this.ref('replies/'+code+'/'+this.uid);
  return new Promise((resolve,reject)=>{let unsubscribe=()=>{},timer,settled=false;const finish=(e,v)=>{if(settled)return;settled=true;clearTimeout(timer);unsubscribe();this.waiters.delete(cancel);e?reject(e):resolve(v)};const cancel=()=>finish(Error('Deelname onderbroken.'));this.waiters.add(cancel);unsubscribe=this.api.onValue(ack,s=>{const result=s.val();if(result?.id===id)result.ok?finish(null,{serverNow:this.now()}):finish(Error(result.message||'Deze actie is geweigerd.'));},e=>finish(Error(errorText(e))));timer=setTimeout(()=>finish(Error('De leerkracht reageert niet. Controleer of het spelleiderstoestel open en verbonden is.')),14000);
   this.api.set(this.ref('requests/'+code+'/'+this.uid),{id,action,...payload,createdAt:this.api.serverTimestamp()}).catch(e=>finish(Error(errorText(e))));
  });
 }
 async action(action,payload={}){if(action==='tick')return {serverNow:this.now()};if(action==='join')return this.join(this.code,payload.name);if(action==='recover')return this.recover(this.code,payload.secret);if(action==='pick')return this.request('pick',payload);if(!this.host)throw Error('Alleen de leerkracht kan dit doen.');return this.enqueue(()=>this.hostAction(this.uid,action,payload));}
 leave(){this.generation++;this.unsubs.forEach(u=>u());this.unsubs=[];this.stopHost();this.waiters.forEach(cancel=>cancel());this.waiters.clear();this.pending.clear();this.room=null;this.mustPause=false;}
}
