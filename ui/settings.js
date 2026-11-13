// Settings sheet: sound, tray, start with Windows, global shortcuts, daily reminder, backup export/import, reset.
// Loaded after listen.js (uses tauri, lsGet, lsSet, esc).
const swSet=(id,on)=>$(id).setAttribute('aria-checked',!!on);
const swOn=id=>$(id).getAttribute('aria-checked')==='true';
const setMsg=(id,text,bad)=>{$(id).textContent=text;$(id).classList.toggle('bad',!!bad)};

function openSettings(){renderSettings();$('settings').showModal();$('setClose').focus({focusVisible:false})}
document.addEventListener('click',e=>{if(e.target.closest('[data-settings]'))openSettings()});
$('setClose').onclick=()=>$('settings').close();
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
    if(!manual)toast('sync',`Update ${updFound.version} available`,'Open Settings › Updates to install it.','download');
  }catch(e){if(manual)setMsg('updMsg','Could not check for updates: '+e,true)}
}
async function installUpdate(){
  if(!await ask({title:`Install version ${updFound.version}?`,text:'The app downloads the update, closes and opens again. Your progress is kept.',ok:'Install and restart',sealText:'↑'}))return;
  let got=0,total=0;$('updBtn').disabled=true;
  try{
    await updFound.downloadAndInstall(ev=>{if(ev.event==='Started')total=ev.data.contentLength||0;else if(ev.event==='Progress'){got+=ev.data.chunkLength;setMsg('updMsg',total?`Downloading… ${Math.round(got/total*100)}%`:'Downloading…')}else if(ev.event==='Finished')setMsg('updMsg','Installing…')});
    await tauri.process.relaunch();
  }catch(e){setMsg('updMsg','Update failed: '+e,true);$('updBtn').disabled=false}
}
$('updBtn').onclick=()=>updFound?installUpdate():checkUpdate(true);
setTimeout(()=>{if(lsGet('updChecked','')!==dayKey())checkUpdate(false)},15000); // once a day, a little after start-up

// ---- Backup ----
const stamp=()=>new Date().toLocaleString('sv').replace(/[: ]/g,'-').slice(0,16); // 2026-11-11-08-30
function backupJson(){
  return JSON.stringify({app:'hangul-learner',version:1,exported:new Date().toISOString(),progress:P,
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
    notebook:(Array.isArray(p.notebook)?p.notebook:[]).slice(0,2000).map(w=>({ch:str(w?.ch,40),meaning:str(w?.meaning,80),added:+w?.added||0})).filter(w=>w.ch&&w.meaning),
    tests:(Array.isArray(p.tests)?p.tests:[]).slice(-50).filter(t=>Number.isFinite(t?.score)&&Number.isFinite(t?.total)&&t.total>0),
    drills:Object.fromEntries(['num','verb','part','sound','read'].map(k=>[k,{right:Math.max(0,+p.drills?.[k]?.right||0),tries:Math.max(0,+p.drills?.[k]?.tries||0)}])),
    stories:Object.fromEntries(STORIES.filter(s=>p.stories?.[s.id]).map(s=>[s.id,{best:Math.max(0,Math.min(s.qs.length,+p.stories[s.id].best||0)),at:+p.stories[s.id].at||0}])),
    section:Math.max(0,Math.min(SECTIONS.length-1,+p.section||0)),
    days:Object.fromEntries(Object.entries(p.days&&typeof p.days==='object'?p.days:{}).filter(([k,v])=>/^\d{4}-\d\d-\d\d$/.test(k)&&Number.isFinite(+v)).map(([k,v])=>[k,+v])),
    drillMiss:Object.fromEntries(['num','verb','part','sound'].map(k=>[k,(Array.isArray(p.drillMiss?.[k])?p.drillMiss[k]:[]).filter(r=>typeof r==='string'&&r.length<60).slice(-60)])),
    talks:Object.fromEntries(DIALOGUES.filter(d=>p.talks?.[d.id]).map(d=>[d.id,Math.max(0,+p.talks[d.id]||0)]))};
}
$('importFile').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  let obj;try{obj=JSON.parse(await file.text())}catch{return setMsg('backupMsg','That file is not a Hangul Learner backup.',true)}
  const p=cleanBackup(obj);
  if(!p)return setMsg('backupMsg','That file is not a Hangul Learner backup.',true);
  const units=Object.values(p.units||{}).filter(n=>n>0).length,when=obj.exported?new Date(obj.exported).toLocaleDateString():'an unknown date';
  if(!await ask({title:'Import this backup?',text:`It has ${p.xp.toLocaleString()} XP and ${units} passed unit${units===1?'':'s'}, saved ${when}. Your current progress on this computer will be replaced.`,ok:'Import',danger:true,sealText:'!'}))return;
  const f=freshProgress();P={...f,...p,totals:{...f.totals,...p.totals}};
  for(const[k,v]of Object.entries(obj.settings||{}))if(['theme','tray','rate','shortcuts','reminder','wotd','focusLen'].includes(k)&&typeof v==='string')localStorage.setItem(k,v.slice(0,200));
  setTheme(getTheme());renderTray();renderWotd();$('focusLen').value=lsGet('focusLen','25-5');tauri?.core.invoke('close_to_tray',{on:trayOn()});applyShortcuts();
  save();renderSettings();setMsg('backupMsg','Backup imported.');toast('sync','Backup imported',`${P.xp.toLocaleString()} XP restored`,'download');
};
