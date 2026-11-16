// ---- Quests & stamp collection ----
function renderQuests(){
  const day=dayKey(),d=todayStats(P,day),now=new Date(),wk=weekKey(),wc=P.weekClaims[wk]||[];
  const msDay=new Date(new Date().setHours(24,0,0,0))-now;
  const nextMon=new Date(now);nextMon.setHours(0,0,0,0);nextMon.setDate(nextMon.getDate()+((8-nextMon.getDay())%7||7)); // next Monday 00:00
  const msWeek=nextMon-now;
  $('qSummary').innerHTML=`<div><b>${d.claimed.length}/4</b><small>daily quests</small></div><div><b>${wc.length}/3</b><small>weekly quests</small></div><div><b>${P.tasks.length}/${TASKS.length}</b><small>tasks done</small></div>`;
  $('qReset').textContent=`New in ${Math.floor(msDay/3.6e6)}h ${Math.floor(msDay/6e4)%60}m`;
  $('wReset').textContent=`New in ${Math.floor(msWeek/864e5)}d ${Math.floor(msWeek/3.6e6)%24}h`;
  $('questList').innerHTML=dailyRows(false);
  $('weeklyList').innerHTML=weeklyRows(false);
  $('restNote').textContent=`Finish all 3 to earn a rest day: it covers a missed day so your streak continues (up to 2). You have ${P.freezes||0}.`;
  $('tCount').textContent=`${P.tasks.length} of ${TASKS.length} done`;
  $('taskList').innerHTML=taskRows();
  $('bCount').textContent=`${P.badges.length} of ${ACHIEVEMENTS.length} collected`;
  $('badgeList').innerHTML=ACHIEVEMENTS.map(a=>{
    const got=P.badges.includes(a.id),[c,t]=a.get(P);
    return`<div class="stamp-card">${seal(icon(a.icon),'m',got?'':'ghost')}<b>${a.name}</b><small>${a.desc}</small>
      ${got?'':`<div class="line" role="progressbar" aria-valuenow="${Math.min(c,t)}" aria-valuemax="${t}" aria-label="${a.name}"><i style="width:${Math.min(1,c/t)*100}%"></i></div><small>${Math.min(c,t)} / ${t}</small>`}</div>`;
  }).join('');
}
