// Desktop helpers: focus timer (work with Korean audio, then a short break) and the copied-Korean word catcher.
// Loaded after listen.js and settings.js (uses tauri, PL, NP, update, lsGet, lsSet, swSet, swOn).

// ---- Focus timer: runs in this window (also while hidden in the tray); the mini player shows it ----
const FOCUS_SETS={'25-5':[25,5],'50-10':[50,10],'15-3':[15,3]};
const focusSet=()=>FOCUS_SETS[lsGet('focusLen','25-5')]||FOCUS_SETS['25-5'];
let FO=null; // {phase:'work'|'break', end: ms}
const focusLeft=()=>FO?Math.max(0,Math.ceil((FO.end-Date.now())/1000)):0;
const focusState=()=>FO&&{phase:FO.phase,left:focusLeft()}; // sent to the mini player with player-state
function focusStart(phase='work'){
  const[w,b]=focusSet();FO={phase,end:Date.now()+(phase==='work'?w:b)*60000};
  if(phase==='work'&&NP&&!PL.playing())PL.toggle(); // keep the Korean audio going while you work
  renderFocus();update();
}
function focusStop(){FO=null;renderFocus();update()}
const focusToggle=()=>FO?focusStop():focusStart();
async function focusAlert(msg){
  sfx('done');
  if(!tauri)return toast('sync',msg.title,msg.body,'clock');
  if(!await tauri.core.invoke('mini_visible'))await tauri.core.invoke('toggle_mini');
  tauri.event.emit('reminder',msg).catch(()=>{});
}
function focusTick(){
  if(!FO)return;
  if(Date.now()>=FO.end){
    const[w,b]=focusSet();
    if(FO.phase==='work'){
      P.totals.focus=(P.totals.focus||0)+1;const d=todayStats(P);d.focus=(d.focus||0)+1;save();
      focusStart('break');focusAlert({title:'Break time',body:`${w} minutes done. Rest ${b} minutes and try the word card.`,go:'Skip break',cmd:'focus-work'});
    }else{focusStop();focusAlert({title:'Break over',body:`Start another ${w} minutes?`,go:'Start',cmd:'focus-work'})}
    return;
  }
  renderFocus();if($('dock').hidden)update(); // the dock's own timer already updates every second while something is loaded
}
setInterval(focusTick,1000);
function renderFocus(){
  const b=$('lFocus');if(!b)return;
  const[w]=focusSet();
  b.innerHTML=`${icon('clock')}<span class="lbl">${FO?`${FO.phase==='work'?'Focus':'Break'} ${fmt(focusLeft())} · Stop`:`Focus ${w} min`}</span>`;
  b.setAttribute('aria-pressed',!!FO);b.title=FO?'Stop the focus timer':`Work for ${w} minutes with Korean audio, then take a short break`;
}
$('lFocus').onclick=focusToggle;
tauri?.event.listen('player-cmd',e=>{if(e.payload==='focus')focusToggle();else if(e.payload==='focus-work')focusStart('work')});
$('focusLen').value=lsGet('focusLen','25-5');
$('focusLen').onchange=e=>{lsSet('focusLen',e.target.value);renderFocus()};
renderFocus();

// ---- Word of the day: one Windows notification a day (at or after the chosen time), also while in the tray ----
const wotd=()=>({on:false,time:'09:00',last:'',...lsGet('wotd',{})});
function wotdWord(){ // a word due for Smart review, otherwise one from your level
  const due=dueKeys(P).map(k=>VOCAB.find(w=>w.ch===k)).filter(Boolean);
  return pickOne(due.length?due:VOCAB.filter(w=>w.section===(P.section||0)));
}
async function wotdSend(){
  const w=wotdWord();if(!w)return null;
  const title=`오늘의 단어 · ${w.ch}`,body=`${w.meaning} · Word of the day from Hangul Learner`;
  const n=tauri?.notification;
  if(n){if(!await n.isPermissionGranted()&&await n.requestPermission()!=='granted')throw Error('Windows did not allow notifications for this app');n.sendNotification({title,body})}
  else toast('sync',title,w.meaning,'bell');
  return w;
}
async function checkWotd(now=new Date()){
  const r=wotd(),day=dayKey(now),[h,m]=r.time.split(':').map(Number);
  if(!r.on||r.last===day||now.getHours()*60+now.getMinutes()<h*60+m)return false;
  r.last=day;lsSet('wotd',r);
  try{await wotdSend()}catch(e){setMsg('wotdMsg',String(e.message||e),true)}
  return true;
}
setInterval(()=>{if(loaded)checkWotd()},30000);
const renderWotd=()=>{const r=wotd();swSet('wotdSw',r.on);$('wotdTime').value=r.time};
$('wotdSw').onclick=()=>{const r=wotd();r.on=!r.on;lsSet('wotd',r);renderWotd()};
$('wotdTime').onchange=e=>{const r=wotd();r.time=e.target.value||'09:00';r.last='';lsSet('wotd',r)};
$('wotdTry').onclick=()=>wotdSend().then(w=>w&&setMsg('wotdMsg',`Sent: ${w.ch} (${w.meaning})`),e=>setMsg('wotdMsg',String(e.message||e),true));
renderWotd();

// ---- Copied Korean: the Rust app watches the clipboard while this is on and sends Korean text here.
// The text is only matched against the word list in memory; it is never saved or sent anywhere. ----
let CLIP=null; // {words, at}
const clipOn=()=>lsGet('clip',false);
const clipWords=()=>CLIP&&Date.now()-CLIP.at<10*60000?CLIP.words:[]; // shown for 10 minutes
function applyClip(){tauri?.core.invoke('clip_watch',{on:clipOn()});if(!clipOn())CLIP=null}
$('clipSw').onclick=()=>{lsSet('clip',!clipOn());swSet('clipSw',clipOn());applyClip();update()};
$('clipSw').closest('.set-row').hidden=!tauri;
swSet('clipSw',clipOn());applyClip();
tauri?.event.listen('clip',async e=>{
  if(!clipOn())return;
  const words=findWords(String(e.payload||'').slice(0,5000)).slice(0,30).map(w=>({ch:w.ch,meaning:w.meaning,say:w.say}));
  if(!words.length)return;
  CLIP={words,at:Date.now()};update();
  if(!await tauri.core.invoke('mini_visible'))tauri.core.invoke('toggle_mini');
});
