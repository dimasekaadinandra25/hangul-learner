// ---- Views ----
let view='learn';
function show(v){
  view=v;
  document.querySelectorAll('.nav-item[data-tab]').forEach(x=>x.dataset.tab===v?x.setAttribute('aria-current','page'):x.removeAttribute('aria-current'));
  $('navMore').classList.toggle('cur',['quests','letters','write','test','stats'].includes(v));
  document.querySelectorAll('main>section').forEach(s=>s.hidden=s.id!==v);
  render();scrollTo(0,0);
}
document.querySelectorAll('.nav-item[data-tab]').forEach(b=>b.onclick=()=>{moreOpen(false);show(b.dataset.tab)});
// More (narrow windows): the pages that don't fit in the bottom bar
const moreOpen=on=>{$('morePanel').hidden=!on;$('navMore').setAttribute('aria-expanded',on);if(on)$('morePanel').querySelector('button').focus({focusVisible:false})};
$('navMore').onclick=()=>moreOpen($('morePanel').hidden);
document.addEventListener('click',e=>{if(!$('morePanel').hidden&&!e.target.closest('#morePanel,#navMore'))moreOpen(false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('morePanel').hidden){moreOpen(false);$('navMore').focus()}});

function render(){
  DAILY_GOAL=GOALS.includes(+P.goal)?+P.goal:30;
  renderStats();renderSfx();renderTheme();
  if(view==='learn')renderPath();
  if(view==='quests')renderQuests();
  if(view==='vocab')renderVocab();
  if(view==='letters')renderLetters();
  if(view==='listen'&&typeof renderListen==='function')renderListen();
  if(view==='test'&&typeof renderTest==='function')renderTest();
  if(view==='stats'&&typeof renderStatsPage==='function')renderStatsPage();
  if(view==='practice'&&typeof renderPractice==='function')renderPractice();
  if(view==='vocab'&&typeof renderMineCount==='function')renderMineCount();
  if(view==='write')$('wCount').textContent=`Practised ${P.stats[cur().ch]?.written||0} times`;
}
const setStat=(k,v)=>document.querySelectorAll(`[data-stat="${k}"]`).forEach(e=>e.textContent=v);
// One quest/task row: checkbox, text, progress line, reward
const qRow=(q,c,done,reward,compact)=>`<div class="quest${done?' done':''}${compact?' compact':''}"><span class="check">${done?icon('check'):''}</span>
  <div class="qbody"><b>${q.text}</b>${done&&q.target===1?'':`<div class="qline"><div class="line" role="progressbar" aria-valuenow="${c}" aria-valuemax="${q.target}" aria-label="${q.text}"><i style="width:${c/q.target*100}%"></i></div><span>${c}/${q.target}</span></div>`}</div>
  ${compact?'':`<span class="reward">+${reward} XP</span>`}</div>`;
function dailyRows(compact){const day=dayKey(),d=todayStats(P,day);return dailyQuests(day).map(q=>qRow(q,questProgress(P,q,day),d.claimed.includes(q.id),QUEST_XP,compact)).join('')}
function weeklyRows(compact){const wk=weekKey(),wc=P.weekClaims[wk]||[];return weeklyQuests(wk).map(q=>qRow(q,weekProgress(P,q,wk),wc.includes(q.id),WEEKLY_XP,compact)).join('')}
function taskRows(){
  let group='';
  return TASKS.map(t=>{const[c,n]=t.get(P),head=t.group!==group?`<div class="task-group">${group=t.group}</div>`:'';
    return head+qRow({text:t.text,target:n},Math.min(c,n),P.tasks.includes(t.id),t.xp)}).join('');
}
const nextTask=()=>TASKS.find(t=>!P.tasks.includes(t.id));
function renderStats(){
  const day=dayKey(),today=P.days[day]||0,s=streak(activeDays(P));
  setStat('streak',s);setStat('xp',P.xp.toLocaleString());setStat('words',wordsMastered(P));
  setStat('today',`${Math.min(today,DAILY_GOAL)}/${DAILY_GOAL}`);
  document.querySelectorAll('.ring-fg').forEach(c=>c.style.strokeDashoffset=100-Math.min(1,today/DAILY_GOAL)*100);
  setStat('hint',today>=DAILY_GOAL?'Goal reached. Well done.':s>0&&!today?'Study today to keep your streak.':`${DAILY_GOAL-today} XP to go today`);
  setStat('badges',`${P.badges.length} of ${ACHIEVEMENTS.length} collected`);
  setStat('letters',ALL.filter(l=>mastered(l.ch)).length);
  $('railQuests').innerHTML=dailyRows(true)+`<p class="rail-note">This week: ${(P.weekClaims[weekKey()]||[]).length}/3 weekly · Tasks: ${P.tasks.length}/${TASKS.length}</p>`;
  const unread=P.inbox.filter(n=>n.at>(P.inboxSeen||0)).length;setStat('unread',unread>9?'9+':unread||'');
  $('railBadges').innerHTML=P.badges.slice(-6).map(id=>{const a=ACHIEVEMENTS.find(x=>x.id===id);return a?`<span title="${a.name}">${seal(icon(a.icon),'m')}</span>`:''}).join('')||'<span class="muted">Finish a lesson to earn your first stamp.</span>';
}
