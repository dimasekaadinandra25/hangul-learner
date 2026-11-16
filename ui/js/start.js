// ---- Start ----
$('wGhost').textContent=cur().ch;
render();
store.load().then(json=>{
  try{
    const s=JSON.parse(json),f=freshProgress();
    P={...f,...s,totals:{...f.totals,...s.totals},stats:s.stats||s.letters||{}}; // `letters` = older save format
    if(s.daily&&!s.log)P.log={[s.daily.date]:{...emptyDaily(s.daily.date),...s.daily}}; // older saves kept only today
    const cutoff=dayKey(new Date(Date.now()-70*864e5));
    for(const k of Object.keys(P.log))if(k<cutoff)delete P.log[k];
    delete P.letters;delete P.quiz;delete P.daily;
    seedSrs(P); // learners from before Smart review: what they know joins the schedule
    migrateKeys(P);
  }catch(e){
    console.error('progress file unreadable, starting fresh',e);
    const name=`progress-unreadable-${dayKey()}-${Date.now()}.json`;
    (window.__TAURI__?__TAURI__.core.invoke('export_backup',{name,data:json}):Promise.resolve(lsSet('progressUnreadable',json)))
      .then(()=>toast('sync','Your progress file could not be read','A copy is kept in Documents › Hangul Learner as '+name+'. You start fresh; Settings › Backup › Import brings back a backup.','bell'))
      .catch(err=>console.error('could not keep the unreadable file',err));
  }
  const ev=checkRewards(false);loaded=true;render();
  restCheck();setInterval(restCheck,1800000);
  // first launch: offer the placement test to learners who already know some Korean
  if(!P.xp&&!Object.keys(P.units).length&&!lsGet('placeAsked',false))setTimeout(async()=>{if(lsGet('placeAsked',false))return;lsSet('placeAsked',true);if(await ask({title:'Know some Korean already?',text:'A short placement test finds your level, so you don’t start from the alphabet. You can also take it later on the Test page.',ok:'Find my level',cancel:'Start from Hangul',sealText:'?'})){show('test');startPlacement()}},1500) // a missed day is covered by a rest day (also when the app stays open overnight)
  if(ev.length)toast('sync',`${ev.length} reward${ev.length===1?'':'s'} from your progress`,'Open the bell to see them all.');
}).catch(e=>{console.error('load failed',e);toast('sync','Could not open your progress','Nothing will be saved until you restart the app, so your file stays as it is. '+String(e).slice(0,100),'bell')});
