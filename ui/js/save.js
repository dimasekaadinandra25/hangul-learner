// ---- Progress (saved by the Rust app to %APPDATA%; localStorage when opened in a plain browser) ----
const OS=/Mac/.test(navigator.userAgent)?'mac':/Windows/.test(navigator.userAgent)?'win':'linux',OS_NAME={mac:'macOS',win:'Windows',linux:'Linux'}[OS];
const micHelp=()=>({win:'Check Windows Settings › Privacy › Microphone.',mac:'Check System Settings › Privacy & Security › Microphone.',linux:'Check that a microphone is connected and allowed in your sound settings.'}[OS]);
document.querySelectorAll('[data-os]').forEach(el=>{if(OS!=='win')el.textContent=el.dataset.os==='login'?'Open when you sign in':el.textContent.replace('Windows',el.dataset.os)});
const store=window.__TAURI__
  ?{load:()=>__TAURI__.core.invoke('load_progress'),save:data=>__TAURI__.core.invoke('save_progress',{data})}
  :{load:async()=>localStorage.getItem('hangul')||'{}',save:async data=>localStorage.setItem('hangul',data)};
let P=freshProgress();
const stat=k=>P.stats[k]??={heard:0,right:0,tries:0,written:0};
const mastered=k=>isMastered(P,k);
let loaded=false; // never save before the saved file is read, or an early click would wipe it
let keepStamp=false; // sync sets this while loading another PC's copy, so its save time is kept
function save(){
  if(loaded){checkRewards(true);if(!keepStamp)P.savedAt=Date.now();store.save(JSON.stringify(P)).catch(saveFailed);if(typeof syncPush==='function')syncPush()}
  const a=document.activeElement,say=a?.dataset?.say,letter=a?.dataset?.letter;
  render();
  if(say!=null&&!a.isConnected)document.querySelector(`[data-say="${CSS.escape(say)}"]${letter?`[data-letter="${CSS.escape(letter)}"]`:''}`)?.focus({focusVisible:true}); // the grid was rebuilt: keep your place
}
let saveWarned=false;
function saveFailed(e){console.error('save failed',e);if(!saveWarned){saveWarned=true;toast('sync','Progress could not be saved',String(e).slice(0,120),'bell')}}
// Claims finished daily/weekly quests and tasks (+XP), unlocks stamps. Every reward goes to the inbox;
// notify=true also pops a notification card. Returns the rewards found.
const held=[],shown=[];
function checkRewards(notify){
  const day=dayKey(),d=todayStats(P,day),wk=weekKey(),wc=(P.weekClaims[wk]??=[]),events=[];
  const give=(xp,kind,title,ic)=>{P.xp+=xp;P.days[day]=(P.days[day]||0)+xp;events.push([kind,title,`+${xp} XP`,ic])};
  for(let again=true;again;){ // rewards can unlock more rewards (XP quests, tasks about quests)
    again=false;
    for(const q of dailyQuests(day))if(!d.claimed.includes(q.id)&&questProgress(P,q,day)>=q.target){
      d.claimed.push(q.id);P.totals.quests++;if(d.claimed.length===4)P.totals.fullDays++;give(QUEST_XP,'quest',q.text,q.icon);again=true}
    for(const q of weeklyQuests(wk))if(!wc.includes(q.id)&&weekProgress(P,q,wk)>=q.target){
      wc.push(q.id);P.totals.weekly++;give(WEEKLY_XP,'weekly',q.text,q.icon);again=true
      if(wc.length===3&&(P.freezes||0)<2){P.freezes=(P.freezes||0)+1;events.push(['stamp','Rest day earned','A missed day won’t break your streak','flame'])}}
    P.bestStreak=Math.max(P.bestStreak||0,streak(activeDays(P)));
    for(const t of TASKS){if(P.tasks.includes(t.id))continue;const[c,n]=t.get(P);if(c>=n){P.tasks.push(t.id);give(t.xp,'task',t.text,'check');again=true}}
    for(const a of ACHIEVEMENTS){if(P.badges.includes(a.id))continue;const[c,n]=a.get(P);if(c>=n){P.badges.push(a.id);events.push(['stamp',a.name,a.desc,a.icon]);again=true}}
  }
  for(const e of events)pushInbox(...e);
  if(notify)for(const e of events)(L&&!L.finished?held:shown).push(e); // don't cover a question: hold until the lesson ends
  if(shown.length)shown.splice(0).slice(0,4).forEach(e=>toast(...e));
  return events;
}
function restCheck(){const r=useRestDays(P);if(r.length){save();toast('sync','Streak saved',r.length===1?'A rest day covered the day you missed.':'Rest days covered the 2 days you missed.','flame')}}
// In-app confirm dialog. Resolves true when the main action is chosen; Esc, Cancel or the backdrop = false.
function ask({title,text,ok,cancel='Cancel',danger=false,sealText='?'}){ // text keeps its line breaks (What's new lists)
  const d=$('ask');
  $('askTitle').textContent=title;$('askText').textContent=text;
  $('askSeal').innerHTML=seal(sealText,'m',danger?'':'jade');
  $('askOk').textContent=ok;$('askOk').className='btn '+(danger?'btn-red':'btn-ink');
  $('askCancel').textContent=cancel;$('askCancel').hidden=!cancel; // no cancel: a plain notice
  d.returnValue='cancel';d.showModal();(cancel?$('askCancel'):$('askOk')).focus({focusVisible:false}); // safe choice focused first; ring only for keyboard users
  return new Promise(res=>d.addEventListener('close',()=>res(d.returnValue==='ok'),{once:true}));
}
$('ask').addEventListener('click',e=>{if(e.target===$('ask'))$('ask').close('cancel')}); // click outside the card
$('reset').onclick=async()=>{
  if(await ask({title:'Erase all progress?',text:'Your XP, streak, stamps, quests and every passed lesson will be deleted. This cannot be undone.',ok:'Erase everything',danger:true,sealText:'!'})){
    P=freshProgress();save();toast('sync','Progress erased','You are starting fresh.','rotate')}
};
