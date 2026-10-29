// Gedeelde spelregels voor de lokale modus en het vertrouwde online spelleiderstoestel.

const crypto = {randomInt(max,min){if(min!==undefined){const low=max;max=min;return low+this.randomInt(max-low)}const a=new Uint32Array(1);globalThis.crypto.getRandomValues(a);return a[0]%max;},randomBytes(n){const a=new Uint8Array(n);globalThis.crypto.getRandomValues(a);return {toString:()=>Array.from(a,x=>x.toString(16).padStart(2,'0')).join('')}}};
const PREVIEW=15000,TURN=15000,REVIEW=4400,LEASE=12000,WIN=5800,FALL=5200;
class GameError extends Error { constructor(code,message){super(message);this.code=code;} }
const fail=(code,message)=>{throw new GameError(code,message)};
const clone=x=>structuredClone(x);
function shuffle(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]]}return a;}
function makeBoard(){const basics=[['Complementaire hoeken zijn twee hoeken…','…waarvan de som 90° is.'],['Supplementaire hoeken zijn twee hoeken…','…waarvan de som 180° is.'],['Ninety degrees makes…','…the angle right.'],['Stretch both arms out…','…left and right.'],['Complementary, oh so fine…','…together ninety every time.'],['Supplementary, now you know…','…together one eighty, off we go.']];const pairs=shuffle(basics).slice(0,2),answers=new Set();for(const type of shuffle([90,90,90,90,90,180,180,180,180,180])){let a;do{a=crypto.randomInt(1,type)}while(answers.has(a));answers.add(a);pairs.push([`${type===90?'Complementaire':'Supplementaire'} hoek van ${type-a}°?`,`${a}°`]);}return shuffle(pairs.flatMap((p,pair)=>p.map((text,side)=>({id:crypto.randomBytes(8).toString('hex'),pair,text}))));}
function name(value){if(typeof value!=='string')fail('invalid-argument','Vul een teamnaam in.');const n=value.trim().replace(/[\u0000-\u001f\u007f]/g,'');if(n.length<2||n.length>24)fail('invalid-argument','Teamnaam: 2 tot 24 tekens.');return n;}
function digest(secret){return 'local-only:'+secret;}
function secretMatches(raw,hash){return digest(raw)===hash;}
function createRoom(uid,now,secret){return {schema:1,hostUid:uid,hostSecretHash:digest(secret),hostSeen:now,createdAt:now,updatedAt:now,revision:1,status:'lobby',teams:{},schedule:[],cursor:0,turnSerial:0,board:[],found:[],selected:[],boardVersion:0,event:null,eventSerial:0,requests:{}};}
const active=r=>r.schedule[r.cursor]||null;
const deadlineKey=phase=>({preview:'previewUntil',playing:'turnDeadline',review:'reviewUntil',animating:'animUntil'})[phase];
function pause(r,now,reason){if(['lobby','paused','final'].includes(r.status))return;r.pausedPhase=r.status;const key=deadlineKey(r.status);r.remaining=Math.max(0,(r[key]||now)-now);r.status='paused';r.pauseReason=reason;}
function preview(r,now){r.board=makeBoard();r.found=[];r.selected=[];r.boardVersion++;r.status='preview';r.previewUntil=now+PREVIEW;r.event=null;}
function next(r,now){const id=active(r);if(r.teams[id])r.teams[id].turns++;r.cursor++;r.turnSerial++;r.selected=[];r.event=null;if(r.cursor>=r.schedule.length){r.status='final';r.finishedAt=now;return;}if(r.found.length===12){preview(r,now);return;}r.status='playing';r.turnDeadline=now+TURN;}
function settle(r,now){const id=active(r),t=r.teams[id],sel=r.selected;const correct=sel.length===2&&r.board[sel[0]].pair===r.board[sel[1]].pair;if(correct){t.score+=5;r.found.push(r.board[sel[0]].pair);}else t.score=Math.max(0,t.score-1);r.event={id:++r.eventSerial,kind:correct?'launch':'fall',teamId:id,at:now,score:t.score,delta:correct?5:-1};r.selected=[];r.status='animating';r.animUntil=now+(correct?WIN:FALL);}
function advance(r,now){if(!['lobby','paused','final'].includes(r.status)&&now-r.hostSeen>LEASE){pause(r,now,'De leerkracht heeft de verbinding verloren.');return;}
if(r.status==='preview'&&now>=r.previewUntil){r.status='playing';r.turnDeadline=now+TURN;}
else if(r.status==='playing'&&now>=r.turnDeadline){r.selected=[];r.event={id:++r.eventSerial,kind:'timeout',teamId:active(r),at:now,score:r.teams[active(r)].score,delta:0};r.status='animating';r.animUntil=now+2200;}
else if(r.status==='review'&&now>=r.reviewUntil)settle(r,now);
else if(r.status==='animating'&&now>=r.animUntil)next(r,now);}
function reduce(input,uid,action,payload={},now=Date.now()){
const r=clone(input);for(const key of ['board','found','selected','schedule'])r[key]=r[key]||[];r.teams=r.teams||{};r.requests=r.requests||{};const teacher=r.hostUid===uid,member=teacher||!!r.teams[uid];if(!member&&action!=='join'&&action!=='recover')fail('permission-denied','Je neemt niet deel aan deze missie.');
// Freeze first if a host returns after a lost lease; a heartbeat must not silently resume play.
advance(r,now);if(teacher&&action==='tick')r.hostSeen=now;
if(action==='tick'){}
else if(action==='join'){if(teacher)fail('failed-precondition','Laat teams via een ander toestel of browserprofiel deelnemen.');if(r.teams[uid])return r;if(r.status!=='lobby')fail('failed-precondition','Deze missie is al gestart.');if(Object.keys(r.teams).length>=21)fail('resource-exhausted','Deze missie heeft al 21 teams.');const n=name(payload.name);if(Object.values(r.teams).some(t=>t.name.toLocaleLowerCase('nl')===n.toLocaleLowerCase('nl')))fail('already-exists','Deze teamnaam bestaat al.');const occupied=new Set(Object.values(r.teams).map(t=>t.suit));let suit=0;while(occupied.has(suit))suit++;r.teams[uid]={name:n,score:0,turns:0,suit,joinedAt:now};}
else if(action==='recover'){if(!secretMatches(payload.secret,r.hostSecretHash))fail('permission-denied','De geheime leerkrachtcode klopt niet.');r.hostUid=uid;r.hostSeen=now;pause(r,now,'Leerkrachtenbeheer hersteld. Hervat wanneer iedereen klaar is.');}
else if(action==='pick'){
if(teacher||active(r)!==uid||r.status!=='playing')fail('permission-denied','Wacht op je beurt.');if(payload.turnSerial!==r.turnSerial||payload.boardVersion!==r.boardVersion)fail('failed-precondition','Deze beurt is voorbij.');const i=payload.index;if(!Number.isInteger(i)||i<0||i>=24)fail('invalid-argument','Ongeldige kaart.');if(r.selected.includes(i)||r.found.includes(r.board[i].pair)||r.selected.length>=2)fail('failed-precondition','Deze kaart kun je niet kiezen.');r.selected.push(i);if(r.selected.length===2){if(r.board[r.selected[0]].pair!==r.board[r.selected[1]].pair)settle(r,now);else{r.status='review';r.reviewUntil=now+REVIEW;}}}
else {
if(!teacher)fail('permission-denied','Alleen de leerkracht kan dit doen.');r.hostSeen=now;
if(action==='start'){if(r.status!=='lobby')fail('failed-precondition','De missie is al gestart.');const ids=shuffle(Object.keys(r.teams));if(!ids.length)fail('failed-precondition','Laat eerst teams deelnemen.');r.order=ids;r.schedule=Array.from({length:5},()=>ids).flat();r.cursor=0;r.turnSerial++;preview(r,now);}
else if(action==='pause')pause(r,now,'Gepauzeerd door de leerkracht.');
else if(action==='resume'){if(r.status!=='paused')fail('failed-precondition','Deze missie is niet gepauzeerd.');r.status=r.pausedPhase;const key=deadlineKey(r.status);if(key)r[key]=now+r.remaining;if(r.status==='animating'&&r.event)r.event.at=now;r.pauseReason='';}
else if(action==='rename'){if(!r.teams[payload.teamId])fail('not-found','Team bestaat niet meer.');const n=name(payload.name);if(Object.entries(r.teams).some(([id,t])=>id!==payload.teamId&&t.name.toLowerCase()===n.toLowerCase()))fail('already-exists','Deze teamnaam bestaat al.');r.teams[payload.teamId].name=n;}
else if(action==='remove'){if(!['lobby','paused'].includes(r.status))fail('failed-precondition','Pauzeer de missie voor je een team verwijdert.');if(!r.teams[payload.teamId])fail('not-found','Team bestaat niet meer.');const removingActive=active(r)===payload.teamId;delete r.teams[payload.teamId];r.order=(r.order||[]).filter(id=>id!==payload.teamId);r.schedule=r.schedule.slice(0,r.cursor).concat(r.schedule.slice(r.cursor).filter(id=>id!==payload.teamId));if(r.status==='paused'&&removingActive){r.pausedPhase='playing';r.remaining=TURN;r.turnSerial++;r.selected=[];r.event=null;}if(r.status==='paused'&&r.cursor>=r.schedule.length){r.status='final';r.finishedAt=now;}}
else if(action==='finish'){r.status='final';r.finishedAt=now;}
else if(action==='restart'){if(r.status!=='final')fail('failed-precondition','Beëindig eerst de missie.');Object.values(r.teams).forEach(t=>{t.score=0;t.turns=0});r.status='lobby';r.cursor=0;r.schedule=[];r.selected=[];r.found=[];r.event=null;r.board=[];r.requests={};r.turnSerial++;}
else fail('invalid-argument','Onbekende actie.');}
r.revision++;r.updatedAt=now;return r;}
// Pair answers never leave the server before they are visible. Closed cards contain IDs only.
function publicRoom(r,viewer){const out={};for(const key of ['schema','hostUid','hostSeen','createdAt','updatedAt','revision','status','teams','schedule','order','cursor','turnSerial','found','selected','boardVersion','event','eventSerial','previewUntil','turnDeadline','reviewUntil','animUntil','pauseReason','pausedPhase','remaining','finishedAt'])if(r[key]!==undefined)out[key]=r[key];out.active=active(r);out.board=r.board.map((c,i)=>({id:c.id,...(r.status==='preview'||(r.status==='paused'&&r.pausedPhase==='preview')||r.selected.includes(i)||r.found.includes(c.pair)?{text:c.text}:{}),found:r.found.includes(c.pair)}));return out;}
export {createRoom,reduce,publicRoom,makeBoard,GameError,secretMatches,PREVIEW,TURN,REVIEW,LEASE,WIN,FALL};
