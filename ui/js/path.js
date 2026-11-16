// ---- Learn: levels, units and steps ----
// Ink-wash mountain ridges, drawn in currentColor at low opacity behind the hero
const WASH=`<svg class="wash" viewBox="0 0 360 150" preserveAspectRatio="none" aria-hidden="true"><path fill="currentColor" d="M0 150c30-8 48-40 72-52 18-9 30 10 46 6 24-6 36-52 62-58 22-5 34 30 54 34 18 4 30-14 48-10 30 7 52 44 78 50v30z"/><path fill="currentColor" opacity=".7" d="M40 150c26-6 40-24 64-28 26-4 40 18 66 16 34-3 54-36 90-38 40-2 70 26 100 30v20z"/></svg>`;
const openUnits=new Set(); // units the learner expanded by hand (kept across re-renders)
const LEVEL_SEAL=['한글','초급','초급','중급','중급','고급','고급']; // beginner / intermediate / advanced
const STEP_KO=['학습 1','학습 2','연습','도전'];
const unitsOf=si=>UNITS.map((u,i)=>[u,i]).filter(([u])=>u.section===si);
// Level tabs: 한글 (basics) | TOPIK 1..6, optional "All". sub(i) = small caption under each tab.
function levelTabs(el,attr,current,sub,withAll){
  const tab=i=>{const name=i<0?'All levels':SECTIONS[i].title,[cap,tip]=[].concat(sub(i));
    return`<button class="lv" ${attr}="${i}" aria-pressed="${i===current}" title="${name}${tip?' · '+tip:''}" aria-label="${name}${tip?', '+tip:''}"><b>${i<0?'All':i===0?'한글':i}</b><small>${cap}</small></button>`};
  el.innerHTML=(withAll?tab(-1):'')+tab(0)+'<span class="lv-group" aria-hidden="true">TOPIK</span>'+SECTIONS.slice(1).map((_,k)=>tab(k+1)).join('');
  el.querySelector('[aria-pressed=true]')?.scrollIntoView({block:'nearest',inline:'nearest'});
  fadeEdges(el);
}
// Horizontal scrollers: fade the edge that has more content; mouse wheel scrolls sideways.
function fadeEdges(el){
  const max=el.scrollWidth-el.clientWidth;
  el.classList.toggle('fade-l',el.scrollLeft>2);el.classList.toggle('fade-r',el.scrollLeft<max-2);
}
document.querySelectorAll('.scroller').forEach(el=>{
  el.addEventListener('scroll',()=>fadeEdges(el),{passive:true});
  el.addEventListener('wheel',e=>{if(el.scrollWidth>el.clientWidth&&Math.abs(e.deltaY)>Math.abs(e.deltaX)){el.scrollLeft+=e.deltaY;e.preventDefault()}},{passive:false});
});
addEventListener('resize',()=>document.querySelectorAll('.scroller').forEach(fadeEdges));
// Words and grammar are separate tracks in a level: the first unit of each is open, then each needs the one before it
const prevInTrack=i=>{const u=UNITS[i];for(let j=i-1;j>=0&&UNITS[j].section===u.section;j--)if((UNITS[j].kind==='grammar')===(u.kind==='grammar'))return UNITS[j];return null};
const unitOpen=i=>{const p=prevInTrack(i);return!p||(P.units[p.id]||0)>0};
const stepOpen=(u,i,k,s)=>s===0?unitOpen(i,k):stepDone(P,u,s-1);
const noun=u=>u.kind==='word'?'words':u.kind==='letter'?'letters':u.kind==='grammar'?'patterns':'syllables';
const what=u=>`${u.items.length} ${noun(u)}`;
const stepInfo=(u,s)=>{const half=s===0?Math.ceil(u.items.length/2):Math.floor(u.items.length/2);
  return[`${Math.min(10,half)} new ${noun(u)}`,`${Math.min(10,half)} new ${noun(u)}`,'10 mixed questions','12 questions · 3 hearts · bonus XP'][s]};
function nextStep(si){ // first open, unfinished step in this level
  const list=unitsOf(si);
  for(let k=0;k<list.length;k++)for(let s=0;s<STEPS.length;s++){const[u,i]=list[k];if(stepOpen(u,i,k,s)&&!stepDone(P,u,s))return[i,s]}
  return null;
}
function renderPath(){
  const si=Math.min(P.section||0,SECTIONS.length-1),sec=SECTIONS[si],list=unitsOf(si),nx=nextStep(si),done=sectionPassed(P,si);
  levelTabs($('levels'),'data-sec',si,i=>{const n=sectionPassed(P,i),t=unitsOf(i).length;
    return[`<span class="lv-bar" aria-hidden="true"><i style="width:${n/t*100}%"></i></span>`,`${n} of ${t} units passed`]});
  $('hero').innerHTML=`<div class="hero"><div><span class="kicker">${sec.tag}</span><h2>${sec.title}</h2><p>${sec.desc}</p>
    <div class="progress-row"><div class="line" role="progressbar" aria-label="Units passed" aria-valuenow="${done}" aria-valuemax="${list.length}"><i style="width:${done/list.length*100}%"></i></div>${done} of ${list.length} units</div>
    ${nx?`<button class="btn btn-ink" data-unit="${nx[0]}" data-step="${nx[1]}">Continue · ${UNITS[nx[0]].title}, ${STEPS[nx[1]].name}${icon('arrow')}</button>`:'<span class="kicker">Every step in this level is complete.</span>'}</div>
    ${seal(LEVEL_SEAL[si],'l')}<span class="sun" aria-hidden="true"></span>${WASH}</div>`;
  const today=P.days[dayKey()]||0,dd=todayStats(P);
  $('todayStrip').innerHTML=`<div class="today"><svg class="ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="ring-bg" cx="18" cy="18" r="15.9"/><circle cx="18" cy="18" r="15.9" pathLength="100" stroke-dasharray="100" style="stroke:var(--red);stroke-linecap:round;stroke-dashoffset:${100-Math.min(1,today/DAILY_GOAL)*100}"/></svg>
    <div><b>${Math.min(today,DAILY_GOAL)}/${DAILY_GOAL}</b><small>XP today</small></div><div><b>${dd.claimed.length}/4</b><small>daily quests</small></div><div><b>${streak(activeDays(P))}</b><small>day streak</small></div><button class="link" data-mix title="10 mixed questions from everything you've passed">Daily mix</button><button class="link" data-go="quests">Quests</button></div>${examLine()}`;
  const t=nextTask(),[tc,tn]=t?t.get(P):[0,0];
  $('taskSlot').innerHTML=t?`<button class="slip task" data-go="quests"><span class="kicker">할 일</span><span style="flex:1"><b>${t.text}</b><small class="muted">Next task · ${Math.min(tc,tn)}/${tn} · +${t.xp} XP</small></span>${icon('arrow')}</button>`:'';
  const n=Object.keys(P.mistakes).length;
  $('reviewSlot').innerHTML=n?`<button class="slip" data-review><span class="kicker">복습</span><span><b>Review mistakes</b><small class="muted">${n} item${n===1?'':'s'} to practise · +10 XP</small></span>${icon('arrow')}</button>`:'';
  const due=dueKeys(P).length;
  $('smartSlot').innerHTML=due?`<button class="slip smart" data-smart><span class="kicker">기억</span><span style="flex:1"><b>Smart review</b><small class="muted">${due} item${due===1?'':'s'} due today · brings back what you are about to forget · +10 XP</small></span>${icon('arrow')}</button>`:'';
  const hasGrammar=list.some(([u])=>u.kind==='grammar');let wk=0,gk=0;
  $('path').innerHTML=list.map(([u,i],k)=>{
    const g=u.kind==='grammar',n=g?++gk:++wk,head=hasGrammar&&n===1?`<h3 class="track"><b>${g?'문법':'단어'}</b>${g?'Grammar':'Words'}</h3>`:'';
    const open=unitOpen(i,k)||stepDone(P,u,0),doneCount=STEPS.filter((_,s)=>stepDone(P,u,s)).length;
    const rows=STEPS.map((st,s)=>{
      const d=stepDone(P,u,s),o=d||stepOpen(u,i,k,s),cur=nx&&nx[0]===i&&nx[1]===s;
      const right=cur?`<span class="go">Start${icon('arrow')}</span>`:d?seal('완','s',s===CHALLENGE_STEP?'gold':''):o?'':icon('lock');
      return`<li class="${d?'done':o?'open':'locked'}${cur?' current':''}"><span class="node">${d?icon('check'):''}</span>
        <button class="row" data-unit="${i}" data-step="${s}" ${o?'':'disabled'} aria-label="${u.title}, ${st.name}${d?', complete':o?'':', locked'}">
        <span><b>${st.name}</b><small>${STEP_KO[s]} · ${stepInfo(u,s)}</small></span>${right}</button></li>`;
    }).join('');
    const expanded=(nx&&nx[0]===i)||openUnits.has(i);
    const pips=STEPS.map((_,s)=>`<i class="${stepDone(P,u,s)?(s===CHALLENGE_STEP?'gold':'on'):''}"></i>`).join('');
    const badge=doneCount===4?seal('완','s',''):open?`<span class="pips" aria-hidden="true">${pips}</span>`:icon('lock').replace('class="i','class="i lock');
    return`${head}<details class="unit${open?'':' locked'}${g?' grammar':''}" data-u="${i}"${expanded?' open':''}><summary class="unit-title" aria-label="${g?'Grammar':'Lesson'} ${n}: ${u.title}, ${doneCount} of 4 steps done"><span class="no">${g?'문법':'제'} ${n} ${g?'':'과'}</span><h3>${u.title}</h3><span class="meta">${what(u)}</span>${badge}${icon('chev').replace('class="i','class="i chev')}</summary><ol class="timeline">${rows}</ol></details>`;
  }).join('');
}
$('learn').onclick=e=>{
  const sm=e.target.closest('summary');if(sm){const d=sm.parentElement,i=+d.dataset.u;d.open?openUnits.delete(i):openUnits.add(i);return} // remember hand-opened units
  const c=e.target.closest('[data-sec]');if(c){P.section=+c.dataset.sec;return save()}
  if(e.target.closest('[data-review]'))return startLesson(()=>buildReview(P.mistakes,P),{step:null});
  if(e.target.closest('[data-mix]'))return buildMix(P).length?startLesson(()=>buildMix(P),{step:null}):toast('sync','Nothing to mix yet','Pass a unit first, then Daily mix asks about everything you know.','layers');
  if(e.target.closest('[data-smart]'))return startLesson(()=>buildSmart(P),{step:null,smart:true});
  const b=e.target.closest('[data-step]');if(!b||b.disabled)return;
  const i=+b.dataset.unit,s=+b.dataset.step;
  startLesson(()=>buildStep(i,s),{unitIdx:i,step:s});
};
