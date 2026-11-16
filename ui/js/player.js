// ---- Lesson player ----
let L=null; // {make, meta:{unitIdx,step}, queue, total, done, hearts, right, wrong, combo, start, ex, sel, picked, answered, finished, passed}
const PRAISE=['Correct','Well done','Exactly','Nicely done','That’s right'];
// TOPIK exam countdown on Learn (set in Settings › Goals)
function examLine(){
  const x=examPlan(P);if(!x)return'';
  const lv=SECTIONS[x.level].title;
  const txt=x.days<0?`Your ${lv} exam date has passed. Set the next one in Settings › Goals.`
    :x.days===0?`${lv} exam today. 화이팅!`
    :x.left?`<b>${x.days} day${x.days===1?'':'s'}</b> to your ${lv} exam · ${x.left} unit${x.left===1?'':'s'} to go · ${x.perDay>1?`about ${x.perDay} units a day`:`about 1 unit every ${x.every} day${x.every===1?'':'s'}`}`
    :`<b>${x.days} day${x.days===1?'':'s'}</b> to your ${lv} exam · every unit passed: keep reviewing and take practice tests`;
  return`<p class="exam-line">${icon('award')}<span>${txt}</span></p>`;
}
function startLesson(make,meta){
  const queue=make();if(!queue.length)return;
  const resume=L?.resume||(typeof PL!=='undefined'&&PL.playing());
  if(typeof PL!=='undefined'&&PL.playing())PL.toggle(); // pause the podcast so lesson audio is clear; it plays on after the lesson
  const hearts=meta.step==null?HEARTS:STEPS[meta.step].hearts;
  clearTimeout(L?.sayT);
  L={make,meta,queue,total:queue.length,done:0,hearts,right:0,wrong:0,combo:0,start:Date.now(),resume,missed:new Map()};
  $('lesson').hidden=false;document.body.classList.add('in-lesson');document.querySelector('.app').inert=true;
  nextExercise();
}
function flushHeld(){held.splice(0).slice(-4).forEach(e=>toast(...e))}
function closeLesson(){
  clearTimeout(L?.sayT);const resume=L?.resume;
  flushHeld();$('lesson').hidden=true;document.body.classList.remove('in-lesson');document.querySelector('.app').inert=false;L=null;show('learn');
  if(resume&&typeof PL!=='undefined'&&!PL.playing())PL.toggle();
}
function renderTop(){
  $('lBar').style.width=L.done/L.total*100+'%';
  const bar=$('lBar').parentElement;bar.setAttribute('aria-valuemax',L.total);bar.setAttribute('aria-valuenow',Math.min(L.done,L.total));
  $('hearts').innerHTML=icon('heart')+L.hearts;
}
const KIND_KO={'New letter':'새 글자','New syllable':'새 음절','New word':'새 단어','New grammar':'새 문법'};
function nextExercise(){
  if(!L.queue.length)return finish(true);
  clearTimeout(L.sayT);
  const ex=L.ex=L.queue.shift();L.sel=null;L.picked=[];L.keys=[];L.answered=false;
  renderTop();
  const speakBtn=(cls='')=>`<button class="speak ${cls}" id="exPlay" aria-label="Play sound (R)">${icon('volume')}</button>`;
  let h;
  if(ex.type==='intro'){
    h=`<div class="intro-card"><span class="kicker">${KIND_KO[ex.prompt]} · ${ex.prompt}</span>
      <div class="glyph${long(ex.big)?' long':''}">${esc(ex.big)}</div><p class="intro-meaning">${esc(ex.explain)}</p>${ex.example?`<p class="intro-ex"><b lang="ko">${esc(ex.example[0])}</b><span>${esc(ex.example[1])}</span></p>`:''}${speakBtn()}</div>`;
  }else{
    h=`<h2 class="prompt">${esc(ex.prompt)}</h2>`;
    if(ex.big)h+=`<div class="prompt-glyph"><div class="glyph${long(ex.big)?' long':''}">${esc(ex.big)}</div>${ex.play?speakBtn():''}</div>`;
    else if(ex.play)h+=`<div class="listen">${speakBtn('lg')}<span class="muted">Listen, then answer.<br>Press R to replay.</span></div>`;
    h+=ex.type==='choice'
      ?`<div class="opts">${ex.options.map((o,n)=>`<button class="opt" data-v="${esc(o.value)}" aria-pressed="false"><span class="k">${n+1}</span>${o.big?`<b class="${[...o.label].length>8?'sm':[...o.label].length>4?'md':''}">${esc(o.label)}</b>`:`<span class="lbl">${esc(o.label)}</span>`}</button>`).join('')}</div>`
      :ex.type==='type'?`<div class="type-box lesson-type" id="lType" role="textbox" aria-label="Type the answer"><span class="caret"></span></div><p class="muted type-note">Type on your keyboard: keys follow the Korean 2-beolsik layout (no Korean keyboard setting needed). Shift gives ㄲ ㄸ ㅃ ㅆ ㅉ ㅒ ㅖ, Backspace undoes a key.</p>`
      :`<div class="answer-line" id="slots"></div><div class="bank" id="bank"></div>`;
  }
  $('exercise').innerHTML=`<div class="enter">${h}</div>`;
  if(ex.type==='tiles')renderTiles();
  setFoot('idle');
  $('kbd').textContent=ex.type==='intro'?'Enter continue'+(ex.play?' · R replay · Shift+R slowly':'')
    :ex.type==='type'?'Type the word · Enter check'
    :(ex.type==='choice'?`1–${ex.options.length} choose`:'1–9 pick a tile · Backspace undo')+' · Enter check'+(ex.play?' · R replay · Shift+R slowly':'');
  if(ex.play)speak(ex.play);
}
const ready=()=>L.ex.type==='intro'||(L.ex.type==='choice'?L.sel!=null:L.ex.type==='type'?L.keys.length>0:L.picked.length>0);
function renderTyped(){$('lType').innerHTML=`${esc(composeJamo(L.keys))}${L.answered?'':'<span class="caret"></span>'}`;setFoot('idle')}
function renderTiles(){
  const ex=L.ex,cls=ex.parts.join('').length>ex.parts.length?'tile word':'tile'; // phrase tiles are whole words
  $('slots').innerHTML=L.picked.map((t,j)=>`<button class="${cls}" data-j="${j}" ${L.answered?'disabled':''}>${esc(ex.tiles[t])}</button>`).join('')||'<span class="hint">Tap the tiles below in order</span>';
  let n=0; // free tiles are numbered: keys 1–9 pick them
  $('bank').innerHTML=ex.tiles.map((t,i)=>{const used=L.picked.includes(i),k=used?'':++n;return`<button class="${cls}${used?' used':''}" data-i="${i}" ${used||L.answered?'disabled':''} aria-label="${esc(t)}">${k&&k<10&&!L.answered?`<span class="tk">${k}</span>`:''}${esc(t)}</button>`}).join('');
  setFoot('idle');
}
function setFoot(state){
  const f=$('foot'),a=$('action'),fb=$('fb');
  f.className='lesson-foot'+(state==='ok'?' ok':state==='bad'?' bad':'');
  $('kbd').hidden=state!=='idle';
  if(state==='idle'){
    fb.innerHTML='';
    a.textContent=L.ex.type==='intro'?'Continue':'Check';a.className='btn btn-lg btn-ink';a.disabled=!ready();
  }else if(state==='ok'){
    fb.innerHTML=`${seal('정답','m')}<div><h3>${pickOne(PRAISE)}${L.combo>=3?`<span class="combo">${L.combo} in a row</span>`:''}</h3><p>${esc(L.ex.explain)}</p></div>`;
    a.textContent='Continue';a.className='btn btn-lg btn-jade';a.disabled=false;
  }else if(state==='bad'){
    fb.innerHTML=`<div><h3>아쉬워요<small>Not quite</small></h3><p>${esc(L.ex.explain)}</p></div>`;
    a.textContent=L.hearts>0?'Got it':'Continue';a.className='btn btn-lg btn-red';a.disabled=false;
  }else{ // finish
    fb.innerHTML='';a.textContent=L.passed?'Continue':'Try again';a.className='btn btn-lg btn-ink';a.disabled=false;
  }
  a.focus({preventScroll:true,focusVisible:false}); // Enter works right away; ring only for keyboard users
}
function select(v){
  if(L.answered)return;L.sel=v;
  $('exercise').querySelectorAll('.opt').forEach(o=>o.setAttribute('aria-pressed',o.dataset.v===v));
  setFoot('idle');
}
function check(){
  const ex=L.ex,value=ex.type==='choice'?L.sel:ex.type==='type'?composeJamo(L.keys):L.picked.map(i=>ex.tiles[i]).join('');
  L.answered=true;
  const right=value===ex.answer,s=stat(ex.key),d=todayStats(P);
  s.tries++;
  schedule(P,ex.key,ex.unit,right); // smart review: when to ask this again
  if(right){if(ex.smart)d.srs=(d.srs||0)+1;if(ex.grammar)d.grammar=(d.grammar||0)+1}
  if(right){s.right++;L.done++;L.right++;L.combo++;d.correct++;d[ex.skill]=(d[ex.skill]||0)+1;d.combo=Math.max(d.combo,L.combo);if(L.meta.step==null)delete P.mistakes[ex.key]} // only a review clears mistakes
  else{L.wrong++;L.combo=0;L.hearts--;P.mistakes[ex.key]=ex.unit;L.missed.set(ex.key,ex);
    L.queue.push(ex.type==='choice'?{...ex,options:shuffle([...ex.options])}:ex); // missed questions come back at the end, options in a new order
    $('hearts').classList.remove('hit');void $('hearts').offsetWidth;$('hearts').classList.add('hit')}
  if(ex.type==='choice'){
    $('exercise').querySelectorAll('.opt').forEach(o=>{o.disabled=true;if(o.dataset.v===ex.answer)o.classList.add('ok');else if(o.dataset.v===value)o.classList.add('bad')});
  }else if(ex.type==='type'){renderTyped();$('lType').classList.add(right?'ok':'bad')}else renderTiles();
  renderTop();setFoot(right?'ok':'bad');sfx(right?'ok':'bad');L.sayT=setTimeout(()=>speak(ex.say),350);save();
}
function onAction(){
  if(!L)return;
  if(L.finished)return L.passed?closeLesson():startLesson(L.make,L.meta);
  if(L.ex.type==='intro'){L.done++;stat(L.ex.key).heard++;todayStats(P).intros++;learned(P,L.ex.key,L.ex.unit);return nextExercise()}
  if(!L.answered)return ready()&&check();
  L.hearts>0?nextExercise():finish(false);
}
$('action').onclick=onAction;
$('exercise').onclick=e=>{
  const b=e.target.closest('button');if(!b||!L)return;
  if(b.id==='exPlay')return speak(L.ex.play);
  if(b.dataset.msave!==undefined){const r=itemFor(P,b.dataset.msave,b.dataset.unit);if(r&&addToNotebook(r[1].ch,r[1].meaning)){save();b.outerHTML=`<span class="muted miss-saved">${icon('star')}Saved</span>`}return}
  if(b.dataset.leave!==undefined)return closeLesson();
  if(L.answered||b.disabled)return;
  if(b.dataset.v!==undefined)select(b.dataset.v);
  else if(b.dataset.i!==undefined){L.picked.push(+b.dataset.i);renderTiles()}
  else if(b.dataset.j!==undefined){L.picked.splice(+b.dataset.j,1);renderTiles()}
};
// The items you got wrong in this lesson: hear them again, keep words in My words
function missedList(){
  if(!L.missed.size)return'';
  const rows=[...L.missed.values()].map(ex=>{
    const r=itemFor(P,ex.key,ex.unit),word=r&&(typeof r[0]==='number'?UNITS[r[0]].kind==='word':true);
    const save=word?(inNotebook(r[1].ch)?`<span class="muted miss-saved">${icon('star')}Saved</span>`:`<button class="link" data-msave="${esc(ex.key)}" data-unit="${esc(ex.unit)}">${icon('star')}Save</button>`):'';
    return`<li><button class="icon-btn" data-say="${esc(ex.say)}" aria-label="Hear">${icon('volume')}</button><span lang="ko">${esc(ex.explain)}</span>${save}</li>`}).join('');
  return`<div class="missed"><h3>To look at again</h3><ul>${rows}</ul></div>`;
}
function finish(passed){
  L.finished=true;L.passed=passed;renderTop();if(passed)$('lBar').style.width='100%';
  const secs=Math.round((Date.now()-L.start)/1000),acc=L.right+L.wrong?Math.round(L.right/(L.right+L.wrong)*100):100;
  let xp=0,unlock='';
  todayStats(P).seconds+=secs; // study time counts even when hearts run out
  if(passed){
    const day=dayKey(),d=todayStats(P,day),st=L.meta.step;
    xp=stepXp(st,L.hearts);P.xp+=xp;P.days[day]=(P.days[day]||0)+xp;
    d.lessons++;P.totals.lessons++;
    if(L.wrong===0){d.perfect++;P.totals.perfect++}
    if(st==null){d.reviews++;P.totals.reviews++;if(L.meta.smart)P.totals.smart=(P.totals.smart||0)+1}
    else{
      const u=UNITS[L.meta.unitIdx],k=u.id+':'+st,first=!(P.units[u.id]>0);
      P.steps[k]=(P.steps[k]||0)+1;
      if(st===PASS_STEP){d.practice++;P.units[u.id]=(P.units[u.id]||0)+1;const nu=UNITS.slice(L.meta.unitIdx+1).find(x=>x.section===u.section&&(x.kind==='grammar')===(u.kind==='grammar'));if(first&&nu){unlock=`Next lesson unlocked: ${nu.title}`;pushInbox('unlock',`${nu.title} is open`,`${SECTIONS[nu.section].title} · next lesson`)}}
      if(st===CHALLENGE_STEP){d.challenges++;P.totals.challenges++}
    }
  }
  const where=L.meta.step==null?'Review':`${UNITS[L.meta.unitIdx].title} · ${STEPS[L.meta.step].name}`;
  $('exercise').innerHTML=`<div class="finish enter">
    <div class="big-stamp${passed?'':' fail'}"><span>${passed?'참 잘했어요':'다시 해 봐요'}</span></div>
    <h2>${passed?(L.wrong===0?'A perfect lesson':'Lesson complete'):'Out of hearts'}</h2>
    <p>${passed?where:'What you missed is saved in Review mistakes.'}</p>
    <div class="results">${passed?`<div><b>+${xp}</b><small>XP</small></div>`:''}<div><b>${acc}%</b><small>accuracy</small></div><div><b>${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}</b><small>time</small></div></div>
    ${unlock?`<div class="unlock">${unlock}</div>`:''}
    ${missedList()}
    ${passed?'':'<p><button class="link" data-leave>Back to the path</button></p>'}</div>`;
  setFoot('finish');
  if(passed)sfx('done');
  save();flushHeld(); // rewards earned during the lesson appear on the result screen
}
$('quit').onclick=async()=>{
  if(L?.finished)return closeLesson();
  if(await ask({title:'Leave this lesson?',text:'You will lose the XP for this lesson. Anything you got wrong stays in Review mistakes.',ok:'Leave lesson',cancel:'Keep learning',danger:true,sealText:'?'}))closeLesson();
};
document.addEventListener('keydown',e=>{
  if(!L||$('lesson').hidden||$('ask').open||e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.key==='Enter'){e.preventDefault();return onAction()}
  if(e.key==='Escape')return $('quit').click();
  if(L.finished)return;
  if(L.ex.type==='type'&&!L.answered){ // typed answer: letter keys write Korean (2-beolsik), so R doesn't replay here
    const j=e.code==='Space'?' ':e.shiftKey&&SHIFT_JAMO[e.code]||KEY_JAMO[e.code];
    if(j){e.preventDefault();L.keys.push(j);renderTyped()}
    else if(e.code==='Backspace'){e.preventDefault();L.keys.pop();renderTyped()}
    return;
  }
  if(e.key==='r'||e.key==='R'){if(L.ex.play)speak(L.ex.play,e.shiftKey?.7:1);return}
  if(L.answered)return;
  const n=+e.key;
  if(n>=1&&n<=9){
    if(L.ex.type==='choice'&&L.ex.options[n-1])select(L.ex.options[n-1].value);
    if(L.ex.type==='tiles'){const free=L.ex.tiles.map((_,i)=>i).filter(i=>!L.picked.includes(i));if(free[n-1]!=null){L.picked.push(free[n-1]);renderTiles()}}
  }
  if(e.key==='Backspace'&&L.ex.type==='tiles'&&L.picked.length){L.picked.pop();renderTiles()}
});
