'use strict';
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {initializeApp}=require('firebase-admin/app');
const {getDatabase}=require('firebase-admin/database');
const crypto=require('node:crypto');
const engine=require('./engine.cjs');
initializeApp();
const region='europe-west1';
// Fixed-origin deployment guard: this code must NEVER be run in the other game project.
function guard(){const project=process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT||'';if(!(project.startsWith('mission-galaxy-')||(process.env.FUNCTIONS_EMULATOR==='true'&&project.startsWith('demo-mission-galaxy-')))||project.includes('machtentempel'))throw new HttpsError('failed-precondition','Gebruik uitsluitend een apart mission-galaxy-* Firebase-project.');}
const origins=['https://intunez.github.io'];
async function publish(code,r){const out=engine.publicRoom(r);await getDatabase().ref('galaxy/rooms/'+code).transaction(current=>!current||(current.revision||0)<r.revision?out:undefined);}
exports.galaxyAction=onCall({region,cors:origins,maxInstances:10,timeoutSeconds:30,memory:'256MiB'},async req=>{
guard();if(!req.auth)throw new HttpsError('unauthenticated','Meld je eerst anoniem aan.');const uid=req.auth.uid,data=req.data||{},action=data.action;if(typeof action!=='string')throw new HttpsError('invalid-argument','Ongeldige actie.');const now=Date.now();
if(action==='create'){
 const limitRef=getDatabase().ref('galaxy/privateLimits/'+uid);const limit=await limitRef.transaction(v=>v&&now-v.last<30000?undefined:{last:now});if(!limit.committed)throw new HttpsError('resource-exhausted','Wacht even voor je een nieuwe missie maakt.');
 for(let n=0;n<20;n++){const code=String(crypto.randomInt(100000,1000000)),secret=crypto.randomBytes(18).toString('base64url'),room=engine.createRoom(uid,now,secret);const created=await getDatabase().ref('galaxy/privateRooms/'+code).transaction(v=>v===null?room:undefined);if(created.committed){await publish(code,room);return {code,secret,serverNow:Date.now()};}}
 throw new HttpsError('resource-exhausted','Probeer een nieuwe spelcode opnieuw.');
}
const code=data.code;if(typeof code!=='string'||!/^\d{6}$/.test(code))throw new HttpsError('invalid-argument','De spelcode heeft zes cijfers.');
const roomRef=getDatabase().ref('galaxy/privateRooms/'+code);let problem=null;const id=data.requestId;if(typeof id!=='string'||!/^[a-zA-Z0-9-]{10,64}$/.test(id))throw new HttpsError('invalid-argument','Ongeldig verzoek.');
const result=await roomRef.transaction(current=>{problem=null;if(!current){problem=new HttpsError('not-found','Deze missie bestaat niet.');return;}if(now-current.createdAt>24*60*60*1000){problem=new HttpsError('failed-precondition','Deze missie is verlopen. Maak een nieuwe missie.');return;}
// Request IDs are stored per authenticated device so retries cannot consume another turn.
const last=current.requests?.[uid];if(last?.id===id)return current;
if(last&&now-last.at< (action==='tick'?900:100)){problem=new HttpsError('resource-exhausted','Wacht een ogenblik.');return;}
try{const next=engine.reduce(current,uid,action,data.payload||{},now);next.requests=next.requests||{};next.requests[uid]={id,at:now};return next;}catch(e){problem=new HttpsError(e.code||'internal',e.message);return;}});
if(!result.committed)throw problem||new HttpsError('aborted','Probeer de actie opnieuw.');const room=result.snapshot.val();for(const key of ['board','found','selected','schedule'])room[key]=room[key]||[];room.teams=room.teams||{};await publish(code,room);return {ok:true,serverNow:Date.now()};
});
