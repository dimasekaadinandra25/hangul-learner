// Settings sheet: sound, tray, start with Windows, global shortcuts, daily reminder, backup export/import, reset.
// Loaded after listen.js (uses tauri, lsGet, lsSet, esc).
const swSet=(id,on)=>$(id).setAttribute('aria-checked',!!on);
const swOn=id=>$(id).getAttribute('aria-checked')==='true';
const setMsg=(id,text,bad)=>{$(id).textContent=text;$(id).classList.toggle('bad',!!bad)};

function openSettings(){renderSettings();$('settings').showModal();$('setClose').focus({focusVisible:false})}
document.addEventListener('click',e=>{if(e.target.closest('[data-settings]'))openSettings()});
$('setClose').onclick=()=>$('settings').close();
// ? anywhere (except while typing) shows every keyboard shortcut
const openKeys=()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());$('keysSheet').showModal();$('keysClose').focus({focusVisible:false})};
$('keysClose').onclick=()=>$('keysSheet').close();$('keysOpen').onclick=openKeys;
document.addEventListener('keydown',e=>{
  if(e.key!=='?'||e.ctrlKey||e.altKey||e.metaKey||$('keysSheet').open)return;
  const el=document.activeElement;if(el?.matches('input,textarea,select,[contenteditable],.type-box')||view==='write'&&wTab!=='trace'||L&&!$('lesson').hidden)return; // not during a lesson: its keys stay its own
  e.preventDefault();openKeys();
});
$('settings').addEventListener('click',e=>{if(e.target===$('settings'))$('settings').close()}); // click outside

function renderSettings(){
  renderSfx();renderTray();
  for(const id of ['autoSw','keySw'])$(id).closest('.set-row').hidden=!tauri;
  swSet('keySw',lsGet('shortcuts',true));
  const r=reminder();swSet('remSw',r.on);$('remTime').value=r.time;
  tauri?.core.invoke('autostart',{on:null}).then(v=>swSet('autoSw',v)).catch(()=>{});
}

// ---- Start with Windows ----
$('autoSw').onclick=()=>tauri?.core.invoke('autostart',{on:!swOn('autoSw')}).then(v=>swSet('autoSw',v)).catch(e=>toast('sync','Could not change start-up',String(e),'gear'));

// ---- Global shortcuts (registered by the Rust app) ----
function applyShortcuts(){
  const on=lsGet('shortcuts',true);
  return tauri?.core.invoke('set_shortcuts',{on}).then(()=>setMsg('keyMsg',''),e=>setMsg('keyMsg',String(e)+'. The other shortcuts still work.',true));
}
$('keySw').onclick=()=>{lsSet('shortcuts',!swOn('keySw'));swSet('keySw',!swOn('keySw'));applyShortcuts()};
applyShortcuts();

// ---- Daily reminder: once a day at/after the chosen time, if today's goal isn't reached (runs while in the tray) ----
const reminder=()=>({on:false,time:'19:00',last:'',...lsGet('reminder',{})});
const saveReminder=r=>lsSet('reminder',r);
$('remSw').onclick=()=>{const r=reminder();r.on=!r.on;saveReminder(r);swSet('remSw',r.on)};
$('remTime').onchange=e=>{const r=reminder();r.time=e.target.value||'19:00';r.last='';saveReminder(r)};
function reminderText(){
  const left=Math.max(0,DAILY_GOAL-(P.days[dayKey()]||0)),due=dueKeys(P).length;
  return{title:'Time for Korean',body:[due?`${due} word${due===1?'':'s'} to review`:'',left?`${left} XP to today’s goal`:''].filter(Boolean).join(' · ')||'A few minutes keeps your streak going',due};
}
async function checkReminder(now=new Date()){
  const r=reminder(),day=dayKey(now);
  if(!r.on||r.last===day||(P.days[day]||0)>=DAILY_GOAL)return false;
  const[h,m]=r.time.split(':').map(Number);
  if(now.getHours()*60+now.getMinutes()<h*60+m)return false;
  r.last=day;saveReminder(r);
  const msg=reminderText();
  if(tauri){
    if(!await tauri.core.invoke('mini_visible'))await tauri.core.invoke('toggle_mini');
    tauri.event.emit('reminder',msg).catch(()=>{});
  }else toast('sync',msg.title,msg.body,'bell');
  return true;
}
setInterval(()=>{if(loaded)checkReminder()},30000);
// the mini window's "Start" button: open the app and begin with what is due
tauri?.event.listen('player-cmd',e=>{
  if(e.payload!=='study')return;
  tauri.core.invoke('show_main');show('learn');
  if(dueKeys(P).length&&!L)startLesson(()=>buildSmart(P),{step:null,smart:true});
});

// ---- Korean text size: a zoom on Korean text only (CSS --ko-size); per device ----
$('koSize').value=String(lsGet('koSize',1));
$('koSize').onchange=e=>{const k=+e.target.value||1;lsSet('koSize',k);document.documentElement.style.setProperty('--ko-size',k)};

// ---- Updates: Tauri's updater reads latest.json from the public releases page; installers are signed and checked ----
const upd=tauri?.updater;
$('updGroup').hidden=!upd;
tauri?.app.getVersion().then(v=>$('appVer').textContent=v);
let updFound=null;
async function checkUpdate(manual){
  if(!upd)return;
  if(manual)setMsg('updMsg','Checking…');
  try{
    updFound=await upd.check();lsSet('updChecked',dayKey());
    if(!updFound){if(manual)setMsg('updMsg','You have the newest version.');return}
    setMsg('updMsg',`Version ${updFound.version} is available.`);$('updBtn').innerHTML=icon('download')+'Install '+esc(updFound.version);
    if(!manual&&lsGet('updToasted','')!==updFound.version){lsSet('updToasted',updFound.version);toast('sync',`Update ${updFound.version} available`,'Open Settings › Updates to install it.','download')}
  }catch(e){if(manual)setMsg('updMsg','Could not check for updates: '+e,true)}
}
async function installUpdate(){
  if(!await ask({title:`Install version ${updFound.version}?`,text:'The app downloads the update, closes and opens again. Your progress is kept.',ok:'Install and restart',sealText:'↑'}))return;
  let got=0,total=0;$('updBtn').disabled=true;
  lsSet('updNotes',{v:updFound.version,body:String(updFound.body||'').slice(0,2000)}); // shown once after the restart
  try{
    await updFound.downloadAndInstall(ev=>{if(ev.event==='Started')total=ev.data.contentLength||0;else if(ev.event==='Progress'){got+=ev.data.chunkLength;setMsg('updMsg',total?`Downloading… ${Math.round(got/total*100)}%`:'Downloading…')}else if(ev.event==='Finished')setMsg('updMsg','Installing…')});
    await tauri.process.relaunch();
  }catch(e){setMsg('updMsg','Update failed: '+e,true);$('updBtn').disabled=false}
}
$('updBtn').onclick=()=>updFound?installUpdate():checkUpdate(true);
setTimeout(()=>checkUpdate(false),15000); // a little after start-up, then every 6 hours while the app runs (it often sits in the tray for days)
setInterval(()=>checkUpdate(false),6*3600e3);
// What's new: after an update installed from Settings, show its notes once
tauri?.app.getVersion().then(v=>{const n=lsGet('updNotes',null);if(n?.v!==v)return;lsSet('updNotes',null);
  ask({title:`Updated to ${v}`,text:n.body||'Hangul Learner is up to date.',ok:'Got it',cancel:'',sealText:'新'})});

// ---- Backup ----
const stamp=()=>new Date().toLocaleString('sv').replace(/[: ]/g,'-').slice(0,16); // 2026-11-11-08-30
function backupJson(extra){
  return JSON.stringify({app:'hangul-learner',version:1,exported:new Date().toISOString(),...extra,progress:P,
    settings:Object.fromEntries(['theme','tray','rate','shortcuts','reminder','wotd','focusLen'].map(k=>[k,localStorage.getItem(k)]).filter(([,v])=>v!=null))});
}
let lastExport='';
$('exportBtn').onclick=async()=>{
  const name=`hangul-learner-backup-${stamp()}.json`,data=backupJson();
  if(!tauri){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type:'application/json'}));a.download=name;a.click();return setMsg('backupMsg','Downloaded '+name)}
  try{
    lastExport=await tauri.core.invoke('export_backup',{name,data});
    $('backupMsg').innerHTML=`Saved to ${esc(lastExport)} · <button class="link" id="showBackup">Show in folder</button>`;$('backupMsg').classList.remove('bad');
    $('showBackup').onclick=()=>tauri.core.invoke('show_in_folder',{path:lastExport}).catch(e=>setMsg('backupMsg',String(e),true));
  }catch(e){setMsg('backupMsg','Could not save the backup: '+e,true)}
};
// A backup file comes from outside the app: check its shape and keep only plain data before using it.
function cleanBackup(obj){
  const p=obj?.progress;
  if(obj?.app!=='hangul-learner'||!p||typeof p!=='object'||!Number.isFinite(p.xp)||!p.stats||typeof p.stats!=='object'||Array.isArray(p.stats))return null;
  const str=(v,n)=>String(v??'').slice(0,n);
  return{...p,inbox:[],inboxSeen:Date.now(),
    notebook:(Array.isArray(p.notebook)?p.notebook:[]).slice(0,2000).map(w=>({ch:str(w?.ch,120),meaning:str(w?.meaning,200),added:+w?.added||0})).filter(w=>w.ch&&w.meaning),
    tests:(Array.isArray(p.tests)?p.tests:[]).slice(-50).filter(t=>Number.isFinite(t?.score)&&Number.isFinite(t?.total)&&t.total>0),
    drills:Object.fromEntries(['num','verb','part','sound','read'].map(k=>[k,{right:Math.max(0,+p.drills?.[k]?.right||0),tries:Math.max(0,+p.drills?.[k]?.tries||0)}])),
    stories:Object.fromEntries(STORIES.filter(s=>p.stories?.[s.id]).map(s=>[s.id,{best:Math.max(0,Math.min(s.qs.length,+p.stories[s.id].best||0)),at:+p.stories[s.id].at||0}])),
    section:Math.max(0,Math.min(SECTIONS.length-1,+p.section||0)),
    days:Object.fromEntries(Object.entries(p.days&&typeof p.days==='object'?p.days:{}).filter(([k,v])=>/^\d{4}-\d\d-\d\d$/.test(k)&&Number.isFinite(+v)).map(([k,v])=>[k,+v])),
    drillMiss:Object.fromEntries(['num','verb','part','sound'].map(k=>[k,(Array.isArray(p.drillMiss?.[k])?p.drillMiss[k]:[]).filter(r=>typeof r==='string'&&r.length<60).slice(-60)])),
    talks:Object.fromEntries(DIALOGUES.filter(d=>p.talks?.[d.id]).map(d=>[d.id,Math.max(0,+p.talks[d.id]||0)]))};
}
// Replaces progress (and the shared settings) with a cleaned backup. savedAt: keep the copy's save time (sync).
function applyBackup(obj,p,savedAt){
  const f=freshProgress();P={...f,...p,totals:{...f.totals,...p.totals}};
  for(const[k,v]of Object.entries(obj.settings||{}))if(['theme','tray','rate','shortcuts','reminder','wotd','focusLen'].includes(k)&&typeof v==='string')localStorage.setItem(k,v.slice(0,200));
  setTheme(getTheme());renderTray();renderWotd();$('focusLen').value=lsGet('focusLen','25-5');tauri?.core.invoke('close_to_tray',{on:trayOn()});applyShortcuts();
  if(savedAt){P.savedAt=savedAt;keepStamp=true}
  try{save()}finally{keepStamp=false}
  renderSettings();
}
$('importFile').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  let obj;try{obj=JSON.parse(await file.text())}catch{return setMsg('backupMsg','That file is not a Hangul Learner backup.',true)}
  const p=cleanBackup(obj);
  if(!p)return setMsg('backupMsg','That file is not a Hangul Learner backup.',true);
  const units=Object.values(p.units||{}).filter(n=>n>0).length,when=obj.exported?new Date(obj.exported).toLocaleDateString():'an unknown date';
  if(!await ask({title:'Import this backup?',text:`It has ${p.xp.toLocaleString()} XP and ${units} passed unit${units===1?'':'s'}, saved ${when}. Your current progress on this computer will be replaced.`,ok:'Import',danger:true,sealText:'!'}))return;
  applyBackup(obj,p);setMsg('backupMsg','Backup imported.');toast('sync','Backup imported',`${P.xp.toLocaleString()} XP restored`,'download');
};

// ---- Sync between PCs: progress is also kept in <folder>\Hangul Learner\progress.json, inside a folder that
// OneDrive or Google Drive already syncs. No account or server. Each PC turns it on once.
// When both PCs studied since they last agreed, the two copies are merged (mergeProgress in lesson.js) using the last agreed
// copy, which each PC keeps in localStorage (syncSnap). Only the very first sync on a PC that already has progress asks.
const syncDir=()=>lsGet('syncOn',false)?lsGet('syncPath',''):'';
let syncBusy=false,syncTimer=0;
const keepAside=data=>tauri.core.invoke('export_backup',{name:`before-sync-${stamp()}.json`,data});
function agreed(){ // this PC and the sync folder now hold the same progress
  lsSet('syncBase',P.savedAt||1);lsSet('syncSnap',P);lsSet('syncAt',Date.now());syncStatus(); // 1 = synced, even before the first save
}
async function syncWrite(){
  await tauri.core.invoke('sync_write',{dir:syncDir(),data:backupJson({saved:P.savedAt})});
  agreed();
}
function syncPush(){ // after every save, a few seconds later
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>{if(syncDir()&&loaded&&!syncBusy&&(+P.savedAt||0)>+lsGet('syncBase',0))syncWrite().catch(syncStatus)},3000);
}
async function syncPull(){
  if(!tauri||!syncDir()||!loaded||syncBusy)return;
  syncBusy=true;
  try{
    const txt=await tauri.core.invoke('sync_read',{dir:syncDir()});
    if(!txt){await syncWrite();return}
    let obj;try{obj=JSON.parse(txt)}catch{throw Error('the sync file is damaged')}
    const p=cleanBackup(obj),saved=+obj.saved||0,mine=+P.savedAt||0,base=+lsGet('syncBase',0);
    if(!p)throw Error('the sync file is damaged');
    if(saved===mine)return agreed();
    const snap=lsGet('syncSnap',null);
    if(base&&snap&&saved>base&&mine>base){ // both PCs studied since they last agreed: add the two together
      applyBackup({},mergeProgress(snap,P,p,mine>saved));await syncWrite();
      return toast('sync','Progress merged',`This PC and your other PC combined · ${P.xp.toLocaleString()} XP`,'download');
    }
    let useRemote=saved>mine;
    if(!base&&P.xp>0&&mine){ // first sync on this PC and it already has progress: let the learner choose
      useRemote=await ask({title:'Which progress should this PC use?',text:`The sync folder has ${p.xp.toLocaleString()} XP (saved ${new Date(saved).toLocaleString()}). This PC has ${P.xp.toLocaleString()} XP. The other copy is kept as a backup file in Documents\\Hangul Learner.`,ok:'Use the sync folder’s',cancel:'Keep this PC’s',sealText:'⇄'});
    }
    if(useRemote){
      if(mine>base)await keepAside(backupJson());
      applyBackup(obj,p,saved);agreed();
      toast('sync','Progress synced',`Continued from your other PC · ${P.xp.toLocaleString()} XP`,'download');
    }else{
      if(saved>base)await keepAside(txt);
      await syncWrite();
    }
    syncStatus();
  }catch(e){syncStatus(e)}finally{syncBusy=false}
}
function syncStatus(err){
  if(err instanceof Error||typeof err==='string')return setMsg('syncMsg','Could not sync: '+(err.message||err),true);
  const at=lsGet('syncAt',0);
  setMsg('syncMsg',syncDir()?(at?`Synced ${new Date(at).toLocaleString()}`:'Not synced yet'):'');
}
function renderSync(){swSet('syncSw',lsGet('syncOn',false));$('syncPath').value=lsGet('syncPath','');syncStatus()}
$('syncGroup').hidden=!tauri;
$('syncSw').onclick=async()=>{
  const on=!lsGet('syncOn',false);
  if(on&&!lsGet('syncPath',''))lsSet('syncPath',await tauri.core.invoke('sync_default'));
  if(on&&!lsGet('syncPath',''))return setMsg('syncMsg','Type the path of your OneDrive or Google Drive folder below first.',true);
  lsSet('syncOn',on);lsSet('syncBase',0);lsSet('syncSnap',null);renderSync();syncPull();
};
$('syncPath').onchange=e=>{lsSet('syncPath',e.target.value.trim());lsSet('syncBase',0);lsSet('syncSnap',null);renderSync();syncPull()};
$('syncNow').onclick=()=>syncPull();
renderSync();
setInterval(syncPull,120000);addEventListener('focus',()=>syncPull());
(function first(){loaded?syncPull():setTimeout(first,500)})();

