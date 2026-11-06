const {test}=require('node:test'),assert=require('node:assert/strict');
const {createRoom,reduce,publicRoom}=require('../engine/engine.cjs');
test('21 name requests stay private until teacher approval; rejection and resubmission do not block the lobby',()=>{
 let now=100000,r=createRoom('teacher',now,'x'.repeat(48));r.requireApproval=true;
 for(let i=0;i<21;i++)r=reduce(r,'p'+i,'join',{name:'Geheime naam '+i},++now);
 assert.equal(Object.keys(r.teams).length,0);assert.equal(Object.keys(r.pendingTeams).length,21);
 const visible=publicRoom(r);assert.equal(Object.keys(visible.teams).length,21);assert(!JSON.stringify(visible).includes('Geheime naam'));assert(!('pendingTeams'in visible));
 assert.throws(()=>reduce(r,'extra','join',{name:'Extra'},++now),/21/);
 assert.throws(()=>reduce(r,'teacher','start',{},++now),/eerst alle teamnamen/);
 assert.throws(()=>reduce(r,'p0','approve',{teamId:'p0'},++now),/niet deel|leerkracht/);
 r=reduce(r,'teacher','reject',{teamId:'p0'},++now);assert.equal(publicRoom(r).teams.p0.approval,'rejected');
 r=reduce(r,'p0','join',{name:'Nieuwe naam'},++now);assert.equal(r.pendingTeams.p0.name,'Nieuwe naam');
 for(let i=0;i<21;i++)r=reduce(r,'teacher','approve',{teamId:'p'+i},++now);
 assert.equal(Object.keys(r.pendingTeams).length,0);assert.equal(Object.keys(r.teams).length,21);assert.equal(new Set(Object.values(r.teams).map(t=>t.suit)).size,21);
 assert.equal(publicRoom(r).teams.p0.name,'Nieuwe naam');assert(Object.values(r.teams).every(t=>t.score===0));
 r=reduce(r,'teacher','start',{},++now);assert.equal(r.status,'preview');
});

test('21 concurrent Spark clients: requests, approval, rejection, all turns, scans, scores and final completion',async()=>{
 const {SparkTransport}=await import('../spark-transport.js');let now=100000;const data={},listeners=new Set(),clients=[];
 const clone=x=>x===undefined?null:structuredClone(x);
 function get(path){return path.split('/').reduce((x,k)=>x?.[k],data)??null}
 function materialize(x){if(x&&typeof x==='object'){if(x['.sv']==='timestamp')return now;return Array.isArray(x)?x.map(materialize):Object.fromEntries(Object.entries(x).map(([k,v])=>[k,materialize(v)]))}return x}
 const snap=x=>({val:()=>clone(x)});
 function emit(path){for(const l of listeners)if(l.path===path||path.startsWith(l.path+'/')||l.path.startsWith(path+'/'))queueMicrotask(()=>{if(listeners.has(l))l.cb(snap(get(l.path)))})}
 function put(path,value){const parts=path.split('/');let o=data;for(const key of parts.slice(0,-1))o=o[key]??={};o[parts.at(-1)]=materialize(value);emit(path)}
 function client(uid){const api={ref:(_,path)=>path,serverTimestamp:()=>({'.sv':'timestamp'}),get:async p=>snap(get(p)),set:async(p,v)=>put(p,v),update:async(p,v)=>put(p,{...get(p),...v}),runTransaction:async(p,fn)=>{const next=fn(clone(get(p)));if(next===undefined)return {committed:false,snapshot:snap(get(p))};put(p,next);return {committed:true,snapshot:snap(get(p))}},onValue(p,cb){if(p==='.info/connected'||p==='.info/serverTimeOffset'){queueMicrotask(()=>cb(snap(p==='.info/connected'?true:0)));return ()=>{}}const l={path:p,cb};listeners.add(l);queueMicrotask(()=>{if(listeners.has(l))cb(snap(get(p)))});return ()=>listeners.delete(l)},onDisconnect:()=>({set:async()=>{},cancel:async()=>{}})};const t=new SparkTransport({currentUser:{uid}},api,{});t.now=()=>now;const c={uid,t,state:null,errors:[]};c.attach=code=>t.attach(code,{onState:s=>c.state=s,onConnectivity:()=>{},onError:e=>c.errors.push(e.message)});clients.push(c);return c}
 async function flush(){for(let i=0;i<15;i++)await new Promise(setImmediate)}
 const host=client('teacher'),students=Array.from({length:21},(_,i)=>client('p'+i)),extra=client('extra');await flush();
 try{const room=await host.t.create();host.attach(room.code);await flush();
 await Promise.all(students.map((c,i)=>c.t.join(room.code,'Team '+i)));students.forEach(c=>c.attach(room.code));await flush();
 assert.equal(Object.keys(host.t.cached.pendingTeams).length,21);assert.equal(Object.keys(host.t.cached.teams).length,0);
 for(const c of students){assert(c.state.teams[c.uid].pending);assert(!JSON.stringify(c.state).includes('Team '));assert.equal(c.errors.length,0)}
 await assert.rejects(()=>extra.t.join(room.code,'Te veel'),/21/);
 await host.t.action('reject',{teamId:'p0'});await flush();assert.equal(students[0].state.teams.p0.approval,'rejected');
 await students[0].t.join(room.code,'Nieuwe naam');await flush();assert.equal(host.t.cached.pendingTeams.p0.name,'Nieuwe naam');
 await Promise.all(students.map(c=>host.t.action('approve',{teamId:c.uid})));await flush();
 for(const c of students){assert.equal(Object.keys(c.state.teams).length,21);assert(!c.state.teams[c.uid].pending)}
 await host.t.action('start');await flush();assert(students.every(c=>c.state.status==='preview'));
 const seen=new Set();let completedTurns=0,scans=0;
 async function finishPhase(){const r=host.t.cached,key={preview:'previewUntil',review:'reviewUntil',animating:'animUntil'}[r.status];assert(key,r.status);const until=r[key];while(now<until){now=Math.min(until,now+2000);await host.t.hostAction('teacher','tick',{});}await flush()}
 while(host.t.cached.status!=='final'){
  const r=host.t.cached;if(r.status==='preview'){scans++;await finishPhase();continue}if(r.status!=='playing'){await finishPhase();continue}
  const uid=r.schedule[r.cursor],student=students.find(c=>c.uid===uid);seen.add(uid);
  if(completedTurns<21&&completedTurns%5===0){while(now<r.turnDeadline){now=Math.min(r.turnDeadline,now+2000);await host.t.hostAction('teacher','tick',{})}await flush();assert.equal(host.t.cached.event.kind,'timeout');}
  else{const choices=r.board.map((c,i)=>({c,i})).filter(x=>!r.found.includes(x.c.pair)),a=choices[0],match=completedTurns>=21,b=choices.find(x=>x.i!==a.i&&(match?x.c.pair===a.c.pair:x.c.pair!==a.c.pair));const payload={turnSerial:r.turnSerial,boardVersion:r.boardVersion};now+=100;await student.t.action('pick',{...payload,index:a.i});now+=100;await student.t.action('pick',{...payload,index:b.i});await finishPhase();assert.equal(host.t.cached.event.kind,match?'launch':'fall');}
  await finishPhase();completedTurns++;assert(completedTurns<80,'wedstrijd loopt vast');
 }
 await flush();assert.equal(seen.size,21);assert(scans>1,'herhalingsscan moet optreden');assert.equal(host.t.cached.found.length,12);assert.equal(Object.values(host.t.cached.teams).reduce((n,t)=>n+t.score,0),60);assert(students.every(c=>c.state.status==='final'&&c.state.found.length===12));assert(clients.every(c=>!c.errors.length));
 console.log('21 Spark clients completed '+completedTurns+' turns and '+scans+' scans, with teacher approval, rejection/retry, wrong pairs, timeouts and all 12 matches.');
 }finally{for(const c of clients){c.t.leave();c.t.general.forEach(fn=>fn())}}
});
