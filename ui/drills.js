// Practice page: numbers, verb endings, particles, graded reading, role-play dialogues, sound changes (data in practice-data.js).
// Loaded after practice.js (uses shuffle, pickOne from lesson.js; esc, lsGet, lsSet, openWord, addToNotebook, inNotebook,
// recordClip, playUrl and the main script's helpers).
let PT=lsGet('ptab','num'),DQ=null; // tab, current question
const PX={numType:'all',numMode:'read',verbLevel:'1',verbForm:'all',partType:'all',miss:false,slow:false,sound:null,story:null,en:false,shown:new Set(),pick:{},checked:false};
const drillStats=kind=>{P.drills??={};return P.drills[kind]??={right:0,tries:0}};
const SLOW=0.7; // "Slow" playback speed

// ---- Mistakes: a wrong answer keeps its question (ref) until you get it right in "Mistakes" mode ----
const missList=kind=>{P.drillMiss??={};return P.drillMiss[kind]??=[]};
const addMiss=(kind,ref)=>{const l=missList(kind);if(!l.includes(ref)){l.push(ref);if(l.length>60)l.shift()}};
const dropMiss=(kind,ref)=>{const l=missList(kind);if(!l.includes(ref))return;P.drillMiss[kind]=l.filter(r=>r!==ref);if(PX.miss&&!P.drillMiss[kind].length)P.totals.missCleared=(P.totals.missCleared||0)+1};

// ---- questions: {kind, ref, kicker, big, sub, say, listen, right, wrong (best first), note} -> up to 4 shuffled options ----
const makeQ=q=>{const opts=shuffle([q.right,...[...new Set(q.wrong)].filter(x=>x&&x!==q.right).slice(0,3)]);return{...q,opts,answer:opts.indexOf(q.right),picked:null}};
// each builder takes a ref (to repeat a missed question) or picks a new one from the current filters
function numQ(ref){
  const i=NUM_ITEMS[+ref]?+ref:NUM_ITEMS.indexOf(pickOne(NUM_ITEMS.filter(n=>PX.numType==='all'||n.type===PX.numType)));
  const it=NUM_ITEMS[i],T=NUM_TYPES[it.type],near=shuffle(T.near(it.val));
  if(PX.numMode==='listen')return makeQ({kind:'num',ref:String(i),kicker:`${T.label} · listening`,sub:'Listen, then choose what you heard.',say:it.ko,listen:true,
    right:T.show(it.val),wrong:near.map(T.show),note:`${T.show(it.val)} = ${it.ko}. ${T.note}`});
  return makeQ({kind:'num',ref:String(i),kicker:T.label,big:T.show(it.val),sub:`${T.q} Choose how to say it.`,say:it.ko,ko:true,
    right:it.ko,wrong:[...shuffle(T.slips(it.val).filter(Boolean)),...near.map(T.ko)],note:T.note});
}
function verbQ(ref){
  let v,form;
  if(ref){const[ch,f]=ref.split('|');v=VERBS.find(w=>w.ch===ch);form=f}
  if(!v){v=pickOne(VERBS.filter(w=>PX.verbLevel==='all'||w.section===+PX.verbLevel));const fs=formsFor(v.ch);form=PX.verbForm!=='all'&&fs.includes(PX.verbForm)?PX.verbForm:pickOne(fs)}
  const F=VERB_FORMS[form],irr=irrOf(v.ch),right=conj(v.ch,form),others=formsFor(v.ch).filter(f=>f!==form).map(f=>conj(v.ch,f));
  return makeQ({kind:'verb',ref:`${v.ch}|${form}`,kicker:`${F.label} · ${SECTIONS[v.section].title}`,big:v.ch,bigKo:true,sub:`${v.meaning} → ${F.ask}`,say:right,ko:true,
    right,wrong:[...shuffle(verbWrongs(v.ch,form)),...shuffle(others)],note:(irr?IRR_NOTE[irr]+' ':'')+F.note});
}
function partQ(ref){
  let noun,k;
  if(ref)[noun,k]=ref.split('|');
  if(!NOUNS.some(n=>n.ch===noun)||!PARTICLES[k]){noun=pickOne(NOUNS).ch;k=PX.partType==='all'?pickOne(Object.keys(PARTICLES)):PX.partType}
  const p=PARTICLES[k],w=NOUNS.find(n=>n.ch===noun),others=shuffle(Object.keys(PARTICLES).filter(x=>x!==k)).slice(0,2).map(x=>withParticle(noun,x));
  return makeQ({kind:'part',ref:`${noun}|${k}`,kicker:`${p.label} · ${p.name}`,big:noun,bigKo:true,sub:`“${w.meaning}” + ${p.name} (${p.label}). Which is right?`,say:withParticle(noun,k),ko:true,
    right:withParticle(noun,k),wrong:[wrongParticle(noun,k),...others],note:p.note});
}
function soundQ(ref){
  let r,ei;
  if(ref){const[id,x]=ref.split('|');r=SOUNDS.find(s=>s.id===id);ei=+x}
  if(!r?.ex[ei]){r=pickOne(PX.sound==='all'||!PX.sound?SOUNDS:SOUNDS.filter(x=>x.id===PX.sound));ei=Math.floor(Math.random()*r.ex.length)}
  const[w,pron,mean,bad]=r.ex[ei];
  return makeQ({kind:'sound',ref:`${r.id}|${ei}`,kicker:`${r.ko} · ${r.name}`,big:w,bigKo:true,sub:`“${mean}”. How is it said?`,say:w,ko:true,right:`[${pron}]`,wrong:[`[${w}]`,`[${bad}]`],note:r.rule});
}
const BUILD={num:numQ,verb:verbQ,part:partQ,sound:soundQ};
function newQ(kind){
  if(PX.miss){const l=missList(kind);if(l.length)return BUILD[kind](pickOne(l.length>1&&DQ?.kind===kind?l.filter(r=>r!==DQ.ref):l));PX.miss=false}
  return BUILD[kind]();
}
const missChip=kind=>{const n=missList(kind).length;return n||PX.miss?`<div class="chips" role="group" aria-label="Mistakes"><button data-miss aria-pressed="${PX.miss}" title="Practise the questions you got wrong until you get them right">${icon('rotate')}Mistakes · ${n}</button></div>`:''};
const slowChip=()=>`<button class="chip-slow" data-slow aria-pressed="${PX.slow}" title="Play recordings at ${SLOW}× speed">${icon('clock')}Slow</button>`;
function quizHtml(q){
  const s=drillStats(q.kind),done=q.picked!=null,good=q.picked===q.answer;
  return`<div class="panel drill" aria-live="polite">
    <div class="drill-top"><span class="kicker">${esc(q.kicker)}${PX.miss?' · mistakes':''}</span><span class="muted">${s.right} right${s.tries?` · ${Math.round(s.right/s.tries*100)}%`:''}</span></div>
    ${q.big?`<div class="drill-big${q.bigKo?' ko':''}" lang="${q.bigKo?'ko':'en'}">${esc(q.big)}</div>`:''}
    <p class="drill-sub">${esc(q.sub)}</p>
    ${q.listen||done?`<div class="btn-row"><button class="btn" data-dsay>${icon('volume')}${q.listen&&!done?'Hear again':'Hear it'}</button><button class="btn" data-dslow title="Play at ${SLOW}× speed">${icon('clock')}Slowly</button></div>`:''}
    <div class="opts drill-opts">${q.opts.map((o,i)=>`<button class="opt${done?i===q.answer?' ok':i===q.picked?' bad':'':''}" data-dopt="${i}"${done?' disabled':''}><span class="k">${i+1}</span><b class="${q.ko?'ko ':''}${[...o].length>8?'sm':'md'}">${esc(o)}</b></button>`).join('')}</div>
    ${done?`<div class="drill-fb ${good?'good':'bad'}"><b>${good?'Right! +1 XP':'Not quite. Answer: '+esc(q.opts[q.answer])}</b><p>${esc(q.note)}</p>${good?'':'<p class="muted">Saved to Mistakes: it comes back until you get it right.</p>'}</div>
      <div class="btn-row drill-next"><button class="btn btn-ink" data-dnext>Next${icon('arrow')}</button><span class="kbd-hint">1–4 choose · Enter next · R hear</span></div>`:''}
  </div>`;
}
function answerDrill(i){
  if(!DQ||DQ.picked!=null)return;
  DQ.picked=i;const good=i===DQ.answer,s=drillStats(DQ.kind),say=DQ.say,day=dayKey();
  s.tries++;
  if(good){s.right++;const d=todayStats(P);d.drill=(d.drill||0)+1;P.xp+=1;P.days[day]=(P.days[day]||0)+1;dropMiss(DQ.kind,DQ.ref)}
  else addMiss(DQ.kind,DQ.ref);
  sfx(good?'ok':'bad');setTimeout(()=>speak(say,PX.slow?SLOW:1),good?200:450);save();
  document.querySelector('[data-dnext]')?.focus({focusVisible:false});
}
const nextDrill=()=>{DQ=BUILD[PT]?newQ(PT):null;renderPractice();document.querySelector('[data-dopt]')?.focus({focusVisible:false})};

// ---- page ----
const chips=(name,list,cur)=>`<div class="chips" role="group" aria-label="${name}">${list.map(([v,t])=>`<button data-chip="${name}" data-v="${v}" aria-pressed="${v===cur&&!PX.miss}">${t}</button>`).join('')}</div>`;
function renderPractice(){
  $('pTabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.ptab===PT));
  let html='';
  if(BUILD[PT]&&(PT!=='sound'||PX.sound)){
    if(DQ?.kind!==PT)DQ=newQ(PT);
    const bar=PT==='num'?chips('numType',[['all','All'],...Object.entries(NUM_TYPES).map(([k,t])=>[k,t.label])],PX.numType)+chips('numMode',[['read','Read'],['listen','Listen']],PX.numMode)
      :PT==='verb'?chips('verbLevel',[['1','TOPIK 1'],['2','TOPIK 2'],['3','TOPIK 3'],['all','All']],PX.verbLevel)+chips('verbForm',[['all','All endings'],...Object.entries(VERB_FORMS).map(([k,f])=>[k,f.label])],PX.verbForm)
      :PT==='part'?chips('partType',[['all','All'],...Object.entries(PARTICLES).map(([k,p])=>[k,p.label])],PX.partType):'';
    html=(PT==='sound'?`<button class="link back" data-squiz="">${icon('back')}All rules</button>`:'')+`<div class="drill-bar">${bar}${missChip(PT)}${slowChip()}</div>`+quizHtml(DQ);
  }else if(PT==='sound')html=soundList();
  else if(PT==='talk'){const d=DIALOGUES.find(x=>x.id===TK.id);html=d?talkView(d):talkList()}
  else{const s=STORIES.find(x=>x.id===PX.story);html=s?storyView(s):storyList()}
  $('pBody').innerHTML=html;
}
function soundList(){
  return`<div class="btn-row" style="margin-bottom:18px"><button class="btn btn-ink" data-squiz="all">${icon('play')}Quiz all rules</button>${missList('sound').length?`<button class="btn" data-squiz="all" data-missgo>${icon('rotate')}Mistakes · ${missList('sound').length}</button>`:''}<span class="muted" style="align-self:center">Tap an example to hear it. Korean is written one way and said another.</span></div>
  <div class="rules">${SOUNDS.map(r=>`<div class="panel rule"><div class="rule-head"><div><span class="kicker">${r.ko}</span><h3>${r.name}</h3></div><button class="btn" data-squiz="${r.id}">Quiz</button></div>
    <p>${esc(r.rule)}</p><div class="rule-ex">${r.ex.map(([w,p,m])=>`<button class="rx" data-say="${esc(w)}" title="Hear it"><b class="ko">${esc(w)}</b><span class="ko">[${esc(p)}]</span><small>${esc(m)}</small></button>`).join('')}</div></div>`).join('')}</div>`;
}

// ---- Reading ----
const storyResult=s=>{const r=P.stories?.[s.id];return r&&{best:Math.min(s.qs.length,+r.best||0)}}; // stories come from backups too: numbers only
function storyList(){
  return`<div class="stories">${STORIES.map(s=>{const r=storyResult(s);return`<button class="story" data-story="${s.id}">${seal(s.level+'급','m',r?'jade':'')}
    <span><b class="ko">${s.title}</b><small>${s.en} · TOPIK ${s.level} · ${s.lines.length} sentences</small></span>${r?`<span class="story-done">${icon('check')}${r.best}/${s.qs.length}</span>`:''}</button>`}).join('')}</div>`;
}
function storyView(s){
  const words=storyWords(s),gloss=storyGloss(s),n=s.qs.length,score=s.qs.filter(([,,a],i)=>PX.pick[i]===a).length;
  return`<button class="link back" data-story="">${icon('back')}All stories</button>
  <div class="story-head"><div><span class="kicker">TOPIK ${s.level} · 읽기</span><h2 class="ko" lang="ko">${s.title}</h2><p class="muted">${s.en}</p></div>
    <div class="btn-row"><button class="btn" data-sall>${icon(sQueue.on?'pause':'play')}${sQueue.on?'Stop':'Hear all'}</button>${slowChip()}<button class="btn" data-sen aria-pressed="${PX.en}">${PX.en?'Hide':'Show'} English</button></div></div>
  <div class="panel story-text">${s.lines.map((l,i)=>`<button class="sent${PX.en||PX.shown.has(i)?' open':''}${sQueue.on&&sQueue.i===i?' now':''}" data-sline="${i}"><span class="ko" lang="ko">${esc(l[0])}</span><small>${esc(l[1])}</small></button>`).join('')}</div>
  <p class="muted" style="font-size:.9rem;margin:8px 0 0">Tap a sentence to hear it and see what it means.</p>
  <h2 class="section-title">Words in this story</h2>
  <div class="wchips">${words.map(w=>`<button class="wc" data-word="${esc(w.ch)}" title="Hear it, save it or say it"><b class="ko">${esc(w.ch)}</b><small>${esc(w.meaning)}</small></button>`).join('')}
    ${gloss.map(([ko,en])=>{const on=inNotebook(ko);return`<button class="wc gloss" data-gloss="${esc(ko)}" data-en="${esc(en)}" title="${on?'In My words: tap to open':'Save to My words'}"><b class="ko">${esc(ko)}</b><small>${esc(en)}</small>${icon(on?'check':'plus')}</button>`}).join('')}</div>
  <h2 class="section-title">Questions</h2>
  <div class="panel story-qs">${s.qs.map(([q,opts,a],qi)=>`<div class="sq-row" role="group" aria-label="${esc(q)}"><b>${qi+1}. ${esc(q)}</b><div class="sq-opts">${opts.map((o,oi)=>{const p=PX.pick[qi]===oi;
      return`<button class="sq${PX.checked?oi===a?' ok':p?' bad':'':''}" data-sq="${qi}" data-so="${oi}" aria-pressed="${p}"${PX.checked?' disabled':''}>${esc(o)}</button>`}).join('')}</div></div>`).join('')}
    ${PX.checked?`<div class="drill-fb ${score===n?'good':'bad'}"><b>${score} of ${n} right${score===n?'. Well read!':''}</b></div><button class="btn" data-sretry>Try again</button>`
      :`<button class="btn btn-ink" data-scheck${Object.keys(PX.pick).length<n?' disabled':''}>Check answers</button>`}</div>`;
}
function checkStory(s){
  const n=s.qs.length,score=s.qs.filter(([,,a],i)=>PX.pick[i]===a).length,day=dayKey(),r=(P.stories??={})[s.id],first=!r||(+r.best||0)<n&&score===n;
  P.stories[s.id]={best:Math.max(score,+r?.best||0),at:Date.now()};
  const gain=Math.max(0,score-(+r?.best||0)),st=drillStats('read');if(!r)st.tries+=n;st.right+=gain;const d=todayStats(P);d.drill=(d.drill||0)+gain;
  if(score===n&&first){P.xp+=5;P.days[day]=(P.days[day]||0)+5;toast('task','Story read',`${s.title} · +5 XP`,'book')}
  PX.checked=true;sfx(score===n?'done':'bad');save();
}
// One audio element for stories and dialogues: plays a recorded line, resolves when it ends
const sAudio=new Audio(),sQueue={on:false,i:-1,run:0};
const playLine=text=>new Promise(r=>{sAudio.src='audio/'+audioName(text);sAudio.playbackRate=PX.slow?SLOW:1;sAudio.onended=sAudio.onerror=()=>setTimeout(r,350);sAudio.play().catch(r)});
async function hearAll(s){
  const run=++sQueue.run;sQueue.on=true;
  for(let i=0;i<s.lines.length;i++){
    if(run!==sQueue.run)return;
    sQueue.i=i;renderPractice();
    await playLine(s.lines[i][0]);
  }
  if(run===sQueue.run){sQueue.on=false;sQueue.i=-1;renderPractice()}
}
const stopHearAll=()=>{sQueue.run++;sQueue.on=false;sQueue.i=-1;sAudio.pause();TK.run++};

// ---- Talk: role-play a dialogue. The app says the other part; on your turn you hear it, record yourself and compare ----
const TK={id:null,role:null,i:-1,run:0,rec:false,urls:{}};
const talkDone=d=>!!P.talks?.[d.id];
function talkList(){
  return`<p class="muted" style="margin:0 0 14px">Pick a conversation and a part. The app plays the other person; on your turn, say your line, record it and compare it with the native speaker.</p>
  <div class="stories">${DIALOGUES.map(d=>`<button class="story" data-talk="${d.id}">${seal(d.level+'급','m',talkDone(d)?'jade':'')}
    <span><b class="ko">${d.title}</b><small>${d.en} · TOPIK ${d.level} · ${d.lines.length} lines</small></span>${talkDone(d)?`<span class="story-done">${icon('check')}Done</span>`:''}</button>`).join('')}</div>`;
}
function talkView(d){
  const who=r=>r==='A'?d.a:d.b,cur=d.lines[TK.i],mine=cur&&cur[0]===TK.role,ended=TK.role&&TK.i>=d.lines.length;
  const roles=`<div class="btn-row">${['A','B'].map(r=>`<button class="btn${TK.role===r?' btn-ink':''}" data-role="${r}">Be ${esc(who(r))}</button>`).join('')}${slowChip()}<button class="btn" data-sen aria-pressed="${PX.en}">${PX.en?'Hide':'Show'} English</button></div>`;
  return`<button class="link back" data-talk="">${icon('back')}All conversations</button>
  <div class="story-head"><div><span class="kicker">TOPIK ${d.level} · 대화</span><h2 class="ko" lang="ko">${d.title}</h2><p class="muted">${d.en}</p></div>${roles}</div>
  <div class="panel talk">${d.lines.map(([r,ko,en],i)=>{const me=r===TK.role,now=i===TK.i;
    return`<div class="bubble${me?' me':''}${now?' now':''}${TK.role&&i>TK.i&&!ended?' later':''}"><small>${esc(who(r))}${me?' · you':''}</small>
      <button class="b-line" data-tline="${i}" title="Hear it"><span class="ko" lang="ko">${esc(ko)}</span>${PX.en||now&&me?`<em>${esc(en)}</em>`:''}</button>
      ${TK.urls[i]?`<button class="link" data-tmine="${i}">${icon('play')}My recording</button>`:''}</div>`}).join('')}</div>
  <div class="talk-bar">${!TK.role?'<span class="muted">Choose your part to start.</span>'
    :ended?`<b>Conversation done!</b><button class="btn" data-tstart>${icon('rotate')}Again</button>`
    :TK.i<0?`<button class="btn btn-ink" data-tstart>${icon('play')}Start</button>`
    :mine?`<span class="kicker">Your turn</span><button class="btn" data-thear>${icon('volume')}Hear it</button><button class="btn btn-red${TK.rec?' recording':''}" data-trec><span class="rec-dot"></span>${TK.rec?'Recording… say it':'Record me'}</button>${TK.urls[TK.i]?`<button class="btn" data-tboth>${icon('repeat')}Native, then me</button>`:''}<button class="btn btn-ink" data-tnext>Next${icon('arrow')}</button>`
    :`<span class="muted">${esc(who(cur[0]))} is speaking…</span>`}</div>`;
}
// moves to line i: the other part plays and moves on by itself; your part waits for Next
async function talkGo(d,i){
  const run=++TK.run;TK.i=i;renderPractice();
  if(i>=d.lines.length){talkFinish(d);return}
  if(d.lines[i][0]===TK.role)return;
  await playLine(d.lines[i][1]);
  if(run===TK.run)talkGo(d,i+1);
}
function talkFinish(d){
  const first=!talkDone(d),day=dayKey();
  (P.talks??={})[d.id]=(+P.talks[d.id]||0)+1;P.totals.talks=(P.totals.talks||0)+1;const t=todayStats(P);t.talks=(t.talks||0)+1;
  if(first){P.xp+=5;P.days[day]=(P.days[day]||0)+5;toast('task','Conversation done',`${d.title} · +5 XP`,'mic')}
  sfx('done');save();
}
async function talkRecord(d){
  const i=TK.i,run=TK.run;if(TK.rec)return;
  TK.rec=true;renderPractice();
  try{
    const url=await recordClip(Math.min(9000,2200+[...d.lines[i][1]].length*170/(PX.slow?SLOW:1)));
    if(TK.urls[i])URL.revokeObjectURL(TK.urls[i]);TK.urls[i]=url;
    P.totals.recordings=(P.totals.recordings||0)+1;const t=todayStats(P);t.spoken=(t.spoken||0)+1;
    TK.rec=false;save();if(run===TK.run)await playUrl(url);
  }catch(e){toast('sync','No microphone found','Check Windows Settings › Privacy › Microphone.','mic')}
  finally{TK.rec=false;renderPractice()}
}
const talkReset=()=>{stopHearAll();Object.values(TK.urls).forEach(u=>URL.revokeObjectURL(u));Object.assign(TK,{i:-1,urls:{},rec:false})};

$('pTabs').onclick=e=>{const b=e.target.closest('[data-ptab]');if(!b)return;PT=b.dataset.ptab;lsSet('ptab',PT);stopHearAll();PX.miss=false;DQ=null;renderPractice()};
$('pBody').addEventListener('click',e=>{
  const t=e.target.closest('button');if(!t)return;
  if(t.dataset.dopt!=null)return answerDrill(+t.dataset.dopt);
  if(t.hasAttribute('data-dnext'))return nextDrill();
  if(t.hasAttribute('data-dsay'))return DQ&&speak(DQ.say);
  if(t.hasAttribute('data-dslow'))return DQ&&speak(DQ.say,SLOW);
  if(t.hasAttribute('data-slow')){PX.slow=!PX.slow;return renderPractice()}
  if(t.hasAttribute('data-miss')){PX.miss=!PX.miss;return nextDrill()}
  if(t.dataset.chip){PX[t.dataset.chip]=t.dataset.v;PX.miss=false;return nextDrill()}
  if(t.dataset.squiz!=null){PX.sound=t.dataset.squiz||null;PX.miss=t.hasAttribute('data-missgo');DQ=null;renderPractice();return scrollTo(0,0)}
  if(t.dataset.story!=null){stopHearAll();Object.assign(PX,{story:t.dataset.story||null,shown:new Set(),pick:{},checked:false});renderPractice();return scrollTo(0,0)}
  if(t.dataset.talk!=null){talkReset();Object.assign(TK,{id:t.dataset.talk||null,role:null});renderPractice();return scrollTo(0,0)}
  if(t.hasAttribute('data-sen')){PX.en=!PX.en;return renderPractice()}
  const d=DIALOGUES.find(x=>x.id===TK.id);
  if(PT==='talk'&&d){
    if(t.dataset.role){talkReset();TK.role=t.dataset.role;return renderPractice()}
    if(t.hasAttribute('data-tstart')){talkReset();return talkGo(d,0)}
    if(t.dataset.tline!=null){const i=+t.dataset.tline;if(TK.role&&TK.i>=0&&TK.i<d.lines.length&&d.lines[TK.i][0]!==TK.role)return;stopHearAll();playLine(d.lines[i][1]);return}
    if(t.hasAttribute('data-thear'))return playLine(d.lines[TK.i][1]);
    if(t.hasAttribute('data-trec'))return talkRecord(d);
    if(t.dataset.tmine!=null)return playUrl(TK.urls[+t.dataset.tmine]);
    if(t.hasAttribute('data-tboth')){const i=TK.i;return playLine(d.lines[i][1]).then(()=>TK.urls[i]&&playUrl(TK.urls[i]))}
    if(t.hasAttribute('data-tnext'))return talkGo(d,TK.i+1);
    return;
  }
  const s=STORIES.find(x=>x.id===PX.story);if(!s)return;
  if(t.dataset.sline!=null){const i=+t.dataset.sline;stopHearAll();PX.shown.has(i)?PX.shown.delete(i):PX.shown.add(i);speak(s.lines[i][0],PX.slow?SLOW:1);todayStats(P).heard++;return renderPractice()}
  if(t.hasAttribute('data-sall')){if(sQueue.on){stopHearAll();renderPractice()}else hearAll(s);return}
  if(t.dataset.sq!=null){PX.pick[+t.dataset.sq]=+t.dataset.so;return renderPractice()}
  if(t.hasAttribute('data-scheck'))return checkStory(s);
  if(t.hasAttribute('data-sretry')){PX.pick={};PX.checked=false;return renderPractice()}
  if(t.dataset.gloss){const ko=t.dataset.gloss;if(inNotebook(ko))return openWord(ko);addToNotebook(ko,t.dataset.en);save();toast('sync','Saved to My words',ko,'star')}
});
document.addEventListener('keydown',e=>{
  if(view!=='practice'||!DQ||!$('pBody').querySelector('.drill')||L||document.querySelector('dialog[open]')||e.ctrlKey||e.altKey||e.metaKey||e.target.closest?.('input,select,textarea'))return;
  if(/^[1-4]$/.test(e.key)&&DQ.picked==null&&+e.key<=DQ.opts.length){e.preventDefault();answerDrill(+e.key-1)}
  else if(e.key==='Enter'&&DQ.picked!=null){e.preventDefault();nextDrill()}
  else if(e.key.toLowerCase()==='r'&&(DQ.listen||DQ.picked!=null))speak(DQ.say,PX.slow?SLOW:1);
});
document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.tab!=='practice')stopHearAll()})); // leaving the page stops Hear all
