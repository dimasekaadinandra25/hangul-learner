// TOPIK practice test (Test page) and the Stats page. Loaded after the main script and listen.js.

// ---------------- Practice test ----------------
const TEST_SECONDS=600,PASS_PCT=60,AREA_NAME={vocab:'Vocabulary',listening:'Listening',grammar:'Grammar',reading:'Reading'};
let TS=null,testTimer=0; // {si, qs, i, picks[], start, done, result}
const pct=(a,b)=>b?Math.round(a/b*100):0;
const bestOf=si=>{const t=(P.tests||[]).filter(x=>x.level===si);return t.length?Math.max(...t.map(x=>pct(x.score,x.total))):null};
function renderTest(){
  if(!TS)return renderPicker();
  if(TS.done)return TS.place?renderPlacement():renderResult();
  renderQuestion();
}
function renderPicker(){
  $('testBody').innerHTML=`<div class="panel place-cta"><div><b>Not sure where to start?</b><small>The placement test checks one level at a time (8 questions each) and stops at the first one that’s new to you.</small></div><button class="btn btn-ink" data-tplace>${icon('target')}Find my level</button></div><div class="levels-grid">${SECTIONS.map((s,si)=>{const b=bestOf(si);
    return`<button class="lvl-card" data-tlevel="${si}">${seal(LEVEL_SEAL[si],'s')}<b>${s.title}</b><small>${si?s.tag:'Letters, syllables and first words'}</small><small>${b==null?'Not taken yet':`Best: ${b}%`}</small></button>`}).join('')}</div>
    <p class="muted" style="margin-top:20px;font-size:.88rem">Questions come from every unit of the level, including ones you have not studied yet. Wrong answers go to Review mistakes and Smart review.</p>`;
}
// Reading, like the real exam: a short story of this level with its questions, in place of the same number of vocabulary questions.
// Hangul basics has no story, so its test stays as it was.
function withReading(qs,si){
  const s=pickOne(STORIES.filter(x=>x.level===si));if(!s)return qs;
  const rq=s.qs.map(([q,opts,a])=>({area:'reading',skill:'read',prompt:esc(q),passage:storyText(s),options:opts.map((o,j)=>({value:String(j),label:esc(o)})),answer:String(a)}));
  let drop=rq.length;
  return[...qs.filter(q=>!(q.area==='vocab'&&drop-->0)),...rq]; // reading comes last, as in TOPIK
}
function startTest(si){
  TS={si,qs:withReading(buildTest(si),si),i:0,picks:[],start:Date.now(),done:false};
  clearInterval(testTimer);testTimer=setInterval(tickTest,1000);
  renderQuestion();
}
const timeLeft=()=>Math.max(0,TEST_SECONDS-Math.floor((Date.now()-TS.start)/1000));
function tickTest(){
  if(!TS||TS.done)return clearInterval(testTimer);
  if(!timeLeft())return finishTest();
  const el=$('testTime');if(el){const s=timeLeft();el.textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;el.classList.toggle('low',s<60)}
}
function renderQuestion(){
  const q=TS.qs[TS.i],n=TS.qs.length,pick=TS.picks[TS.i];
  $('testBody').innerHTML=`<div class="test-top"><span class="muted">${TS.place?`Placement · ${SECTIONS[TS.si].title} · `:''}Question ${TS.i+1} of ${n}</span><div class="line" role="progressbar" aria-valuenow="${TS.i}" aria-valuemax="${n}" aria-label="Test progress"><i style="width:${TS.i/n*100}%"></i></div><span class="test-timer" id="testTime"></span></div>
    <div class="test-q"><span class="kicker">${AREA_NAME[q.area]}</span><h2 class="prompt">${q.prompt}</h2>
      ${q.passage?`<p class="test-passage" lang="ko">${esc(q.passage)}</p>`:''}
      ${q.big?`<div class="glyph${long(q.big)?' long':''}" lang="ko">${q.big}</div>`:''}
      ${q.play?`<div class="listen"><button class="speak lg" id="tqPlay" aria-label="Play sound (R)">${icon('volume')}</button><span class="muted">Listen, then answer.<br>Press R to replay.</span></div>`:''}
      <div class="opts">${q.options.map((o,k)=>`<button class="opt" data-tv="${esc(o.value)}" aria-pressed="${pick===o.value}"><span class="k">${k+1}</span>${o.big?`<b class="${[...o.label].length>8?'sm':[...o.label].length>4?'md':''}">${o.label}</b>`:`<span class="lbl">${o.label}</span>`}</button>`).join('')}</div>
      <div class="test-actions"><button class="link" id="tqQuit">Stop test</button><button class="btn btn-ink" id="tqNext" ${pick==null?'disabled':''}>${TS.i===n-1?'Finish test':'Next'}${icon('arrow')}</button></div></div>`;
  tickTest();
  if(q.play)speak(q.play);
}
$('testBody').addEventListener('click',async e=>{
  const lv=e.target.closest('[data-tlevel]');if(lv)return startTest(+lv.dataset.tlevel);
  if(e.target.closest('[data-tplace]'))return startPlacement();
  if(e.target.closest('[data-tgolearn]')){TS=null;renderTest();return show('learn')}
  if(!TS)return;
  const o=e.target.closest('[data-tv]');
  if(o&&!TS.done){TS.picks[TS.i]=o.dataset.tv;$('testBody').querySelectorAll('[data-tv]').forEach(b=>b.setAttribute('aria-pressed',b===o));$('tqNext').disabled=false;return}
  if(e.target.closest('#tqPlay'))return speak(TS.qs[TS.i].play);
  if(e.target.closest('#tqNext')){if(TS.i<TS.qs.length-1){TS.i++;renderQuestion()}else finishTest();return}
  if(e.target.closest('#tqQuit')){if(await ask({title:'Stop this test?',text:'Your answers so far will not be scored.',ok:'Stop test',cancel:'Keep going',danger:true}))stopTest();return}
  if(e.target.closest('[data-tagain]'))return startTest(TS.si);
  if(e.target.closest('[data-tlevels]')){TS=null;renderTest()}
});
document.addEventListener('keydown',e=>{
  if(view!=='test'||!TS||TS.done||L||document.querySelector('dialog[open]')||e.ctrlKey||e.altKey||e.metaKey)return;
  const n=+e.key,q=TS.qs[TS.i];
  if(n>=1&&n<=q.options.length)$('testBody').querySelectorAll('[data-tv]')[n-1].click();
  else if(e.key==='Enter'&&!$('tqNext').disabled){e.preventDefault();$('tqNext').click()}
  else if((e.key==='r'||e.key==='R')&&q.play)speak(q.play);
});
function stopTest(){clearInterval(testTimer);TS=null;renderTest()}
// ---- Placement test: levels in order, 8 questions each; 75% moves on. The first level not passed becomes the
// starting level on Learn. No XP, reviews or mistakes: it only finds where to begin. ----
const PLACE_N=8,PLACE_PASS=75;
function startPlacement(){
  TS={si:0,qs:buildTest(0,PLACE_N),i:0,picks:[],start:Date.now(),done:false,place:[]};
  clearInterval(testTimer);testTimer=setInterval(tickTest,1000);renderQuestion();
}
function finishPlacement(){
  clearInterval(testTimer);
  const p=pct(TS.qs.filter((q,k)=>TS.picks[k]===q.answer).length,TS.qs.length);TS.place.push([TS.si,p]);
  if(p>=PLACE_PASS&&TS.si<SECTIONS.length-1){
    const si=TS.si+1;Object.assign(TS,{si,qs:buildTest(si,PLACE_N),i:0,picks:[],start:Date.now()});
    testTimer=setInterval(tickTest,1000);return renderQuestion();
  }
  TS.done=true;TS.level=p>=PLACE_PASS?TS.si:TS.si; // the level being learned now (TOPIK 6 if everything passed)
  P.section=TS.level;P.placed=TS.level;save();renderTest();
}
function renderPlacement(){
  const s=SECTIONS[TS.level];
  $('testBody').innerHTML=`<div class="result-head">${seal(LEVEL_SEAL[TS.level],'l','jade')}<div><span class="kicker">Placement test</span><div class="score-big">${s.title}</div>
    <p style="margin:6px 0 0">Start here. Learn now opens at this level; earlier levels stay open for review.</p></div></div>
    <div class="chart-card"><h3>By level</h3><div class="hbars">${TS.place.map(([si,p])=>`<div><span>${SECTIONS[si].title}</span><div class="line" role="progressbar" aria-valuenow="${p}" aria-valuemax="100" aria-label="${SECTIONS[si].title}"><i style="width:${p}%"></i></div><em>${p}%${p>=PLACE_PASS?' ✓':''}</em></div>`).join('')}</div></div>
    <div class="btn-row"><button class="btn btn-ink" data-tgolearn>${icon('map')}Start learning</button><button class="btn" data-tlevels>All tests</button></div>`;
}
function finishTest(){
  if(TS.place)return finishPlacement();
  clearInterval(testTimer);
  const day=dayKey(),d=todayStats(P,day),areas={},wrong=[];
  TS.qs.forEach((q,k)=>{
    const ok=TS.picks[k]===q.answer;(areas[q.area]??=[0,0])[1]++;if(ok)areas[q.area][0]++;
    if(q.key)schedule(P,q.key,q.unit,ok,day); // reading questions are not review items
    if(ok){d.correct++;d[q.skill]=(d[q.skill]||0)+1}
    else{if(q.key)P.mistakes[q.key]=q.unit;wrong.push({q,pick:TS.picks[k]})}
  });
  const score=TS.qs.filter((q,k)=>TS.picks[k]===q.answer).length,total=TS.qs.length,xp=Math.round(score/total*20);
  P.xp+=xp;P.days[day]=(P.days[day]||0)+xp;d.seconds+=Math.min(TEST_SECONDS,Math.round((Date.now()-TS.start)/1000));
  (P.tests??=[]).push({at:Date.now(),level:TS.si,score,total,areas});P.tests=P.tests.slice(-50);
  TS={...TS,done:true,result:{score,total,areas,wrong,xp,timeUp:!timeLeft()}};
  save();renderTest();
}
const labelOf=(q,v)=>q.options.find(o=>o.value===v)?.label??'(no answer)';
function renderResult(){
  const{score,total,areas,wrong,xp,timeUp}=TS.result,p=pct(score,total),pass=p>=PASS_PCT;
  $('testBody').innerHTML=`<div class="result-head">${seal(pass?'합격':'연습','l',pass?'':'gold')}<div><span class="kicker">${SECTIONS[TS.si].title} · practice test${timeUp?' · time ran out':''}</span>
      <div class="score-big">${p}%</div><p style="margin:6px 0 0">${score} of ${total} right · +${xp} XP · ${pass?'Likely pass at this level. Try the next one.':`Keep practising: the pass mark is ${PASS_PCT}%.`}</p></div></div>
    <div class="chart-card"><h3>By area</h3><div class="area-bars">${Object.entries(areas).map(([a,[r,t]])=>`<div><span>${AREA_NAME[a]}</span><div class="line" role="progressbar" aria-valuenow="${r}" aria-valuemax="${t}" aria-label="${AREA_NAME[a]}"><i style="width:${pct(r,t)}%"></i></div><em class="muted">${r}/${t} · ${pct(r,t)}%</em></div>`).join('')}</div></div>
    ${wrong.length?`<h2 class="section-title">To review (${wrong.length})</h2><div class="wrong-list">${wrong.map(({q,pick})=>`<div><small class="muted">${AREA_NAME[q.area]} · ${q.prompt}</small><br>${q.big?`<b lang="ko">${q.big}</b> · `:''}Right answer: <b>${labelOf(q,q.answer)}</b>${pick!=null?` · yours: ${labelOf(q,pick)}`:''}</div>`).join('')}</div>`:'<p>A perfect score. Every question right.</p>'}
    <div class="btn-row" style="margin-top:22px"><button class="btn btn-ink" data-tagain>Take another ${SECTIONS[TS.si].title} test</button><button class="btn" data-tlevels>Choose a level</button></div>`;
}

// ---------------- Stats ----------------
function renderStatsPage(){
  const days=Object.entries(P.days).filter(([,x])=>x>0),gram=GRAMMAR_ITEMS.filter(g=>isMastered(P,g.ch)).length;
  const tiles=[[P.xp.toLocaleString(),'total XP'],[P.bestStreak||streak(activeDays(P)),'best streak (days)'],[days.length,'study days'],
    [`${wordsMastered(P)}<small>/${VOCAB.length}</small>`,'words mastered'],[`${gram}<small>/${GRAMMAR_ITEMS.length}</small>`,'grammar patterns mastered'],
    [((P.totals.listenSec||0)/3600).toFixed(1),'hours listened'],[P.totals.smart||0,'Smart reviews'],[(P.tests||[]).length,'practice tests']];
  // heatmap: 26 weeks, Monday first
  const today=new Date(),start=new Date(weekKey(today)+'T12:00:00');start.setDate(start.getDate()-25*7);
  const cells=[];for(let d=new Date(start);cells.length<26*7;d.setDate(d.getDate()+1)){const k=dayKey(d),x=P.days[k]||0,future=d>today;
    cells.push(`<i class="${future?'future':x>=60?'l4':x>=30?'l3':x>=15?'l2':x>0?'l1':''}" title="${d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}: ${x} XP"></i>`)}
  // XP per week, last 12 weeks
  const weeks=Array.from({length:12},(_,k)=>{const w=new Date(weekKey(today)+'T12:00:00');w.setDate(w.getDate()-(11-k)*7);const key=dayKey(w);return[key,weekDays(key).reduce((s,d)=>s+(P.days[d]||0),0)]});
  const max=Math.max(1,...weeks.map(w=>w[1])),top=weeks.findIndex(w=>w[1]===max);
  const short=k=>{const[,m,d]=k.split('-');return`${+m}/${+d}`};
  // Smart review forecast: words due each day for the next 14 days (today includes anything overdue)
  const tk=dayKey(today),due=Object.values(P.srs||{}).map(s=>s.due),fc=Array.from({length:14},(_,i)=>{const k=addDays(tk,i);return[k,due.filter(d=>i?d===k:d<=k).length]});
  const fmax=Math.max(1,...fc.map(f=>f[1])),ftop=fc.findIndex(f=>f[1]===fmax),fday=(k,i)=>i?new Date(k+'T12:00').toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}):'Today';
  // answers right by skill, last 70 days
  const sum=f=>Object.values(P.log||{}).reduce((s,d)=>s+(d[f]||0),0);
  $('statsBody').innerHTML=`<div class="tiles">${tiles.map(([v,l])=>`<div><b>${v}</b><small>${l}</small></div>`).join('')}</div>
    <div class="chart-card"><h3>Study calendar</h3><p>XP per day, last 6 months. Hover a day for its total.</p>
      <div class="heat" role="img" aria-label="Study calendar: ${days.length} study days">${cells.join('')}</div>
      <div class="heat-key">Less <i style="background:var(--hair-2)"></i><i class="l1" style="background:color-mix(in srgb,var(--red) 30%,var(--card))"></i><i style="background:color-mix(in srgb,var(--red) 55%,var(--card))"></i><i style="background:color-mix(in srgb,var(--red) 80%,var(--card))"></i><i style="background:var(--red)"></i> More</div></div>
    <div class="chart-card"><h3>XP per week</h3><p>Last 12 weeks, Monday to Sunday.</p>
      <div class="bars" role="img" aria-label="XP per week">${weeks.map(([k,x],i)=>`<div title="Week of ${short(k)}: ${x} XP">${i===top&&x||i===11?`<span>${x}</span>`:''}<i style="height:${x/max*100}%"></i></div>`).join('')}</div>
      <div class="bar-x">${weeks.map(([k],i)=>`<span>${i%3===2||i===11?short(k):''}</span>`).join('')}</div></div>
    <div class="chart-card"><h3>Smart review forecast</h3><p>Words due each day, next 2 weeks. Today includes anything overdue.</p>
      <div class="bars" role="img" aria-label="Smart review forecast: ${fc[0][1]} due today, ${fc.reduce((s,f)=>s+f[1],0)} in the next 2 weeks">${fc.map(([k,x],i)=>`<div title="${fday(k,i)}: ${x} word${x===1?'':'s'} due">${(i===0||i===ftop)&&x?`<span>${x}</span>`:''}<i style="height:${x/fmax*100}%"></i></div>`).join('')}</div>
      <div class="bar-x">${fc.map(([k],i)=>`<span>${i===0?'Today':i%4===0?short(k):''}</span>`).join('')}</div></div>
    <div class="chart-card"><h3>Progress by level</h3><p>Units passed (words and grammar).</p>
      <div class="hbars">${SECTIONS.map((s,si)=>{const n=sectionPassed(P,si),t=s.units.length;return`<div><span>${s.title}</span><div class="line" role="progressbar" aria-valuenow="${n}" aria-valuemax="${t}" aria-label="${s.title}"><i style="width:${n/t*100}%"></i></div><em>${n}/${t} units</em></div>`}).join('')}</div></div>
    <div class="chart-card"><h3>Right answers by skill</h3><p>Last 10 weeks.</p>
      <div class="tiles" style="margin:0">${[['listen','listening'],['read','reading'],['write','building / writing'],['grammar','grammar'],['typed','words typed'],['spoken','recordings']].map(([f,l])=>`<div><b>${sum(f).toLocaleString()}</b><small>${l}</small></div>`).join('')}</div></div>
    <div class="chart-card"><h3>Practice page and tools</h3><p>Right answers and accuracy per drill, all time.</p>
      <div class="tiles" style="margin:0">${[['num','Numbers'],['verb','Verb endings'],['part','Particles'],['sound','Sound changes']].map(([k,l])=>{const s=P.drills?.[k]||{},r=+s.right||0,t=+s.tries||0;return`<div><b>${r}${t?`<small> · ${Math.round(r/t*100)}%</small>`:''}</b><small>${l}</small></div>`}).join('')}
        <div><b>${storiesRead(P)}<small>/${STORIES.length}</small></b><small>stories read</small></div><div><b>${talksDone(P)}<small>/${DIALOGUES.length}</small></b><small>conversations</small></div>
        <div><b>${+P.totals.focus||0}</b><small>focus sessions</small></div><div><b>${+P.totals.shadow||0}</b><small>shadowing recordings</small></div><div><b>${+P.totals.dictation||0}</b><small>words typed from listening</small></div></div></div>
    ${(P.tests||[]).length?`<div class="chart-card"><h3>Practice tests</h3><p>Most recent first.</p><div class="hbars">${P.tests.slice(-6).reverse().map(t=>`<div><span>${SECTIONS[t.level]?.title||'?'}</span><div class="line" role="progressbar" aria-valuenow="${t.score}" aria-valuemax="${t.total}" aria-label="Score"><i style="width:${pct(t.score,t.total)}%;background:${pct(t.score,t.total)>=PASS_PCT?'var(--jade)':'var(--gold)'}"></i></div><em>${pct(t.score,t.total)}% · ${new Date(t.at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</em></div>`).join('')}</div></div>`:''}`;
}
