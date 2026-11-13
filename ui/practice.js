// Practice tools: word sheet (hear, save to My words, record yourself), My words, stroke order, typing.
// Loaded after listen.js (uses esc, lsGet, lsSet) and the main script.
const unitOfWord=ch=>UNITS.find(u=>u.kind==='word'&&u.items.some(it=>it.ch===ch));

// ---------------- Word sheet ----------------
let wsW=null,nativeBuf=null,mineBuf=null,recUrl=null,mediaRec=null,recTimer=0,wctx=null;
const audioCtx=()=>wctx??=new AudioContext();
function findWord(ch){
  const v=VOCAB.find(w=>w.ch===ch);if(v)return{...v,kicker:`${SECTIONS[v.section].title} · ${v.unit}`};
  const n=(P.notebook||[]).find(w=>w.ch===ch);return n?{ch:n.ch,meaning:n.meaning,say:n.ch,kicker:'My words',custom:true}:null;
}
function openWord(ch){
  const w=findWord(ch);if(!w)return;
  wsW=w;nativeBuf=mineBuf=null;if(recUrl){URL.revokeObjectURL(recUrl);recUrl=null}
  $('wsKicker').textContent=w.kicker;$('wsWord').textContent=w.ch;$('wsWord').classList.toggle('long',[...w.ch].length>6);$('wsMean').textContent=w.meaning;
  $('wsMine').disabled=$('wsBoth').disabled=true;$('wsLen').textContent='';
  setMsg('wsMsg',w.custom?'Your own words have no recorded voice: Hear uses your computer’s Korean voice if it has one.':'');
  $('wsFam').innerHTML=familiesOf(w.ch).map(h=>`<div class="fam"><b title="Hanja root"><span lang="zh">${h.han}</span>${h.ko} · ${esc(h.en)}</b>${h.words.map(x=>`<button class="wc" lang="ko" data-word="${esc(x)}"${x===w.ch?' aria-current="true"':''}>${esc(x)}</button>`).join('')}</div>`).join('');
  renderSave();drawWave();
  if(!$('wordSheet').open)$('wordSheet').showModal();$('wsClose').focus({focusVisible:false}); // also opened from a word family chip inside the sheet
  speak(w.say);stat(w.ch).heard++;todayStats(P).heard++;save();
  if(RECORDED.includes(w.say))fetch('audio/'+audioName(w.say)).then(r=>r.arrayBuffer()).then(b=>audioCtx().decodeAudioData(b)).then(buf=>{if(wsW===w){nativeBuf=buf;drawWave()}}).catch(()=>{});
}
document.addEventListener('click',e=>{const c=e.target.closest('[data-word]');if(c)openWord(c.dataset.word)});
const closeSheet=()=>{if(mediaRec?.state==='recording')mediaRec.stop();$('wordSheet').close()};
$('wsClose').onclick=closeSheet;
$('wordSheet').addEventListener('click',e=>{if(e.target===$('wordSheet'))closeSheet()});
$('wsHear').onclick=()=>wsW&&speak(wsW.say);
$('wsSlow').onclick=()=>wsW&&speak(wsW.say,0.7);

// ---- My words ----
const inNotebook=ch=>(P.notebook||[]).some(w=>w.ch===ch);
function renderSave(){
  const on=inNotebook(wsW.ch);
  $('wsSave').innerHTML=on?`${icon('star',true)}Saved · Remove`:`${icon('star',false)}Save to My words`;
  $('wsSave').setAttribute('aria-pressed',on);
}
function addToNotebook(ch,meaning){
  P.notebook??=[];if(inNotebook(ch))return false;
  P.notebook.push({ch,meaning,added:Date.now()});
  if(!P.srs?.[ch])(P.srs??={})[ch]={u:unitOfWord(ch)?.id||'mine',iv:0,ease:2.3,due:dayKey()}; // shows up in today's Smart review
  return true;
}
function removeFromNotebook(ch){
  P.notebook=(P.notebook||[]).filter(w=>w.ch!==ch);
  if(P.srs?.[ch]?.u==='mine')delete P.srs[ch];
}
$('wsSave').onclick=()=>{
  if(inNotebook(wsW.ch)){removeFromNotebook(wsW.ch);if(wsW.custom)closeSheet()}else addToNotebook(wsW.ch,wsW.meaning);
  if(!wsW.custom||inNotebook(wsW.ch))renderSave();save();
};
// the mini player's ☆ button saves (or removes) the word on its card
tauri?.event.listen('mini-save',e=>{
  const ch=String(e.payload?.ch||'').slice(0,40),meaning=String(e.payload?.meaning||'').slice(0,80);if(!ch||!meaning)return;
  inNotebook(ch)?removeFromNotebook(ch):addToNotebook(ch,meaning);save();update();
});
// Import a word list into My words (parseWordList is in practice-data.js)
$('importWords').onchange=async e=>{
  const f=e.target.files[0];e.target.value='';if(!f)return;
  if(f.size>5e6)return toast('sync','That file is too big','Word lists up to 5 MB','upload');
  const list=parseWordList(await f.text());let added=0;
  for(const[ko,en]of list.slice(0,2000))if(addToNotebook(ko,en))added++;
  save();toast('sync',added?`Imported ${added} word${added===1?'':'s'}`:'No new words found',list.length>added?`${list.length-added} already in My words or skipped`:'They are in My words and today’s Smart review','upload');
};
const renderMineCount=()=>{const n=(P.notebook||[]).length;$('mineCount').textContent=n?`(${n})`:''};
$('addWord').onsubmit=e=>{
  e.preventDefault();
  const ko=$('awKo').value.trim().slice(0,40),en=$('awEn').value.trim().slice(0,80);
  if(!/[가-힣]/.test(ko))return toast('sync','Type the word in Korean','Use the Korean keyboard, or copy it from somewhere.','keyboard');
  if(!en)return;
  if(!addToNotebook(ko,en))return toast('sync','Already in My words',ko,'star');
  $('awKo').value=$('awEn').value='';save();$('awKo').focus();
};

// Records the microphone for ms milliseconds -> an object URL of the recording (throws when there is no microphone)
async function recordClip(ms){
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  try{
    const chunks=[],rec=new MediaRecorder(stream),done=new Promise(r=>rec.onstop=r);
    rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);
    rec.start();setTimeout(()=>rec.state==='recording'&&rec.stop(),ms);await done;
    return URL.createObjectURL(new Blob(chunks,{type:rec.mimeType}));
  }finally{stream.getTracks().forEach(t=>t.stop())}
}

// ---- Say it: record yourself, compare the sound shapes ----
let micOpening=false;
async function record(){
  if(mediaRec?.state==='recording'){mediaRec.stop();return}
  if(micOpening)return;
  let stream;micOpening=true;
  try{stream=await navigator.mediaDevices.getUserMedia({audio:true})}
  catch(e){return setMsg('wsMsg','No microphone found, or the app may not use it. Check Windows Settings › Privacy › Microphone.',true)}
  finally{micOpening=false}
  const chunks=[],w=wsW;mediaRec=new MediaRecorder(stream);
  mediaRec.ondataavailable=e=>e.data.size&&chunks.push(e.data);
  mediaRec.onstop=async()=>{
    clearTimeout(recTimer);stream.getTracks().forEach(t=>t.stop());
    $('wsRec').classList.remove('recording');$('wsRecLbl').textContent='Record again';
    if(wsW!==w||!chunks.length)return;
    const blob=new Blob(chunks,{type:mediaRec.mimeType});if(recUrl)URL.revokeObjectURL(recUrl);recUrl=URL.createObjectURL(blob);
    $('wsMine').disabled=false;$('wsBoth').disabled=!nativeBuf;
    P.totals.recordings=(P.totals.recordings||0)+1;todayStats(P).spoken=(todayStats(P).spoken||0)+1;save();
    try{mineBuf=await audioCtx().decodeAudioData(await blob.arrayBuffer());drawWave()}catch{}
    setMsg('wsMsg','');
  };
  mediaRec.start();
  $('wsRec').classList.add('recording');$('wsRecLbl').textContent='Stop';setMsg('wsMsg','Recording… say the word now.');
  recTimer=setTimeout(()=>mediaRec?.state==='recording'&&mediaRec.stop(),Math.min(6000,Math.max(2500,(nativeBuf?.duration||1.5)*1000+1500)));
}
$('wsRec').onclick=record;
// Pronunciation check: Windows listens once and picks what it heard from the word plus a few look-alikes
// (a list, not free dictation, so it works offline and a wrong sound doesn't count as the word).
function lookAlikes(ch,n=6){
  const syl=new Set(ch),len=[...ch].length,pool=VOCAB.filter(v=>v.ch!==ch&&!v.ch.includes(' ')&&Math.abs([...v.ch].length-len)<=1);
  const near=shuffle(pool.filter(v=>[...v.ch].some(c=>syl.has(c))));
  return[...near,...shuffle(pool)].map(v=>v.ch).filter((c,i,a)=>a.indexOf(c)===i).slice(0,n);
}
$('wsCheck').hidden=!tauri;
$('wsCheck').onclick=async()=>{
  const w=wsW;if(!w||mediaRec?.state==='recording')return;
  $('wsCheck').disabled=true;setMsg('wsMsg','Listening… say the word now.');
  try{
    const heard=(await tauri.core.invoke('recognize',{phrases:[w.ch,...lookAlikes(w.ch)]})).trim();
    if(wsW!==w)return;
    if(heard===w.ch){P.totals.pron=(P.totals.pron||0)+1;todayStats(P).spoken=(todayStats(P).spoken||0)+1;save();sfx('ok');setMsg('wsMsg',`Recognised: ${w.ch} ✓ Windows understood you.`)}
    else{sfx('bad');setMsg('wsMsg',heard?`Windows heard “${heard}”. Listen again and try once more.`:'Didn’t catch a word. Try again, a little closer to the microphone.',true)}
  }catch(e){
    setMsg('wsMsg',String(e).includes('NO_KOREAN')?'Windows needs its Korean speech pack for this: Settings › Time & language › Language & region › add Korean (or open its Language options) › Speech recognition. Then try again.':'Could not listen: '+e,true);
  }finally{$('wsCheck').disabled=false}
};
const playMine=()=>new Promise(r=>{if(!recUrl)return r();const a=new Audio(recUrl);a.onended=a.onerror=r;a.play().catch(r)});
$('wsMine').onclick=playMine;
$('wsBoth').onclick=()=>{const a=new Audio('audio/'+audioName(wsW.say));a.onended=()=>setTimeout(playMine,300);a.play().catch(()=>{})};
// loudness envelope with silence trimmed at both ends -> [values 0..1], seconds
function envelope(buf,n=120){
  const d=buf.getChannelData(0),win=Math.max(1,Math.floor(d.length/600)),rms=[];
  for(let i=0;i<d.length;i+=win){let s=0;for(let j=i;j<Math.min(d.length,i+win);j++)s+=d[j]*d[j];rms.push(Math.sqrt(s/win))}
  const max=Math.max(...rms)||1,on=rms.map(v=>v/max>0.08),a=on.indexOf(true),b=on.lastIndexOf(true);
  if(a<0)return{v:[],sec:0};
  const part=rms.slice(a,b+1).map(v=>v/max);
  return{v:Array.from({length:n},(_,k)=>part[Math.floor(k/n*part.length)]),sec:(b-a+1)*win/buf.sampleRate};
}
function drawWave(){
  const cv=$('wsWave'),g=cv.getContext('2d'),W=cv.width,H=cv.height,css=getComputedStyle(document.body);
  g.clearRect(0,0,W,H);
  const rows=[[nativeBuf,css.getPropertyValue('--ink').trim(),H*0.25],[mineBuf,css.getPropertyValue('--red').trim(),H*0.75]];
  const envs=rows.map(([b])=>b?envelope(b):null),longest=Math.max(0.5,...envs.map(e=>e?.sec||0));
  g.strokeStyle=css.getPropertyValue('--hair').trim();g.lineWidth=1;g.beginPath();g.moveTo(0,H/2);g.lineTo(W,H/2);g.stroke();
  rows.forEach(([,color,mid],k)=>{
    const e=envs[k];
    if(!e||!e.v.length){g.fillStyle=css.getPropertyValue('--muted').trim();g.font='26px Segoe UI, sans-serif';g.fillText(k?'Record to see your sound shape':(wsW?.custom?'No recorded voice for this word':'Loading…'),20,mid+9);return}
    const w=W*e.sec/longest,amp=H*0.22;
    g.fillStyle=color;g.beginPath();g.moveTo(0,mid);
    e.v.forEach((v,i)=>g.lineTo(i/(e.v.length-1)*w,mid-v*amp));
    for(let i=e.v.length-1;i>=0;i--)g.lineTo(i/(e.v.length-1)*w,mid+e.v[i]*amp);
    g.closePath();g.fill();
  });
  const[n,m]=envs;$('wsLen').textContent=n?.sec&&m?.sec?`Native ${n.sec.toFixed(1)} s · You ${m.sec.toFixed(1)} s`:'';
}

// ---------------- Stroke order (Write › Trace) ----------------
const BOX=[30,310]; // the template's 100x100 box on the 340px pad
const toPad=([x,y])=>[BOX[0]+x*(BOX[1]-BOX[0])/100,BOX[0]+y*(BOX[1]-BOX[0])/100];
const fromPad=([x,y])=>[(x-BOX[0])*100/(BOX[1]-BOX[0]),(y-BOX[0])*100/(BOX[1]-BOX[0])];
let myStrokes=[],anim=0;
const guideCv=$('wGuideCv'),gctx=guideCv.getContext('2d');
function strokePath(g,s,upto=1){
  const pts=samplePoints([s],2),n=Math.max(2,Math.round(pts.length*upto));
  g.beginPath();pts.slice(0,n).forEach((p,i)=>{const[x,y]=toPad(p);i?g.lineTo(x,y):g.moveTo(x,y)});g.stroke();
}
function drawGuide(progress=null){ // progress: [stroke index, 0..1] while animating
  const strokes=STROKES[cur().ch]||[],css=getComputedStyle(document.body),ink=css.getPropertyValue('--ink').trim(),red=css.getPropertyValue('--red').trim();
  gctx.clearRect(0,0,340,340);
  if(guideCv.hidden)return;
  Object.assign(gctx,{lineWidth:15,lineCap:'round',lineJoin:'round',strokeStyle:ink,globalAlpha:.1});
  strokes.forEach(s=>strokePath(gctx,s));
  if(progress){Object.assign(gctx,{strokeStyle:red,globalAlpha:.75});strokes.forEach((s,i)=>{if(i<progress[0])strokePath(gctx,s);else if(i===progress[0])strokePath(gctx,s,progress[1])})}
  gctx.globalAlpha=1;
  strokes.forEach((s,i)=>{ // numbered start points
    if(progress&&i>progress[0])return;
    const[x,y]=toPad(s[0]);gctx.fillStyle=red;gctx.beginPath();gctx.arc(x,y,11,0,7);gctx.fill();
    gctx.fillStyle='#fff';gctx.font='bold 13px Segoe UI, sans-serif';gctx.textAlign='center';gctx.textBaseline='middle';gctx.fillText(i+1,x,y+1);
  });
}
$('wOrder').onclick=()=>{
  cancelAnimationFrame(anim);guideCv.hidden=false;$('wGuide').textContent='Guide on';$('wGuide').setAttribute('aria-pressed',true);
  const n=(STROKES[cur().ch]||[]).length,t0=performance.now(),per=700;
  const step=t=>{const k=(t-t0)/per,i=Math.floor(k);if(i>=n)return drawGuide();drawGuide([i,k-i]);anim=requestAnimationFrame(step)};
  anim=requestAnimationFrame(step);
};
$('wGuide').onclick=e=>{guideCv.hidden=!guideCv.hidden;e.currentTarget.textContent='Guide '+(guideCv.hidden?'off':'on');e.currentTarget.setAttribute('aria-pressed',!guideCv.hidden);drawGuide()};
// collect what you draw (in template units) next to the main pad handlers
const padPos=e=>{const r=cv.getBoundingClientRect();return fromPad([(e.clientX-r.left)*cv.width/r.width,(e.clientY-r.top)*cv.height/r.height])};
let drawingNow=false;
cv.addEventListener('pointerdown',e=>{drawingNow=true;myStrokes.push([padPos(e)])});
cv.addEventListener('pointermove',e=>{if(drawingNow)myStrokes[myStrokes.length-1].push(padPos(e))});
addEventListener('pointerup',()=>{drawingNow=false});
const resetStrokes=()=>{myStrokes=[];$('wScore').innerHTML=''};
$('wClear').addEventListener('click',resetStrokes);
$('wNext').addEventListener('click',()=>{resetStrokes();drawGuide()});
$('wSel').addEventListener('change',()=>{resetStrokes();drawGuide()});
$('wCheck').onclick=()=>{
  const ch=cur().ch,tpl=STROKES[ch],mine=myStrokes.filter(s=>s.length>1||s.length===1);
  if(!mine.length)return $('wScore').innerHTML='<span class="muted">Draw the letter first, then check.</span>';
  const score=strokeScore(tpl,mine),stars=score>=90?3:score>=75?2:score>=55?1:0;
  P.bestStroke=Math.max(P.bestStroke||0,score);P.totals.strokes=(P.totals.strokes||0)+1;save();
  const count=mine.length===tpl.length?`${tpl.length} stroke${tpl.length===1?'':'s'}, right count`:`you used ${mine.length} stroke${mine.length===1?'':'s'}; ${ch} has ${tpl.length}`;
  $('wScore').innerHTML=`<b>${score}%</b><span>${'★'.repeat(stars)}${'☆'.repeat(3-stars)}</span><span class="muted">match · ${count}${score<75?' · try “Show stroke order”':''}</span>`;
};
$('wGhost').hidden=true; // the stroke guide replaces the font ghost
drawGuide();

// ---------------- Typing (Write › Type) and dictation (Write › Listen: type the word you hear) ----------------
let wTab='trace';
$('wTabs').onclick=e=>{const b=e.target.closest('[data-wtab]');if(!b)return;if(wTab!==b.dataset.wtab)raceReset();wTab=b.dataset.wtab;renderWriteTabs();if(wTab!=='trace'){tPick();$('tBox').focus()}};
function renderWriteTabs(){
  $('wTabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.wtab===wTab));
  $('wTrace').hidden=wTab!=='trace';$('wType').hidden=wTab==='trace';
}
renderWriteTabs();
const typeable=w=>keysFor(w).every(j=>j===' '||JAMO_KEY[j]);
function typeLevels(){
  const opts=SECTIONS.map((s,i)=>[String(i),s.title+' words']);
  if((P.notebook||[]).length)opts.push(['mine','My words']);
  const cur=$('tLevel').value||String(Math.min(P.section||0,SECTIONS.length-1));
  $('tLevel').innerHTML=opts.map(([v,t])=>`<option value="${v}">${esc(t)}</option>`).join('');
  $('tLevel').value=opts.some(o=>o[0]===cur)?cur:'0';
}
let TY={word:null,keys:[],wrong:0,count:0,done:0,start:0,shift:false};
// Typing race: as many words as you can in 60 seconds; the clock starts with your first key. Best score: P.raceBest.
const RACE_SEC=60;let raceTimer=0;
const raceLeft=()=>TY.start?Math.max(0,RACE_SEC-(Date.now()-TY.start)/1000):RACE_SEC;
function raceReset(){clearInterval(raceTimer);Object.assign(TY,{done:0,count:0,wrong:0,start:0,over:false})}
function raceTick(){
  $('tLeft').textContent=Math.ceil(raceLeft());
  if(raceLeft()>0)return;
  clearInterval(raceTimer);TY.over=true;TY.solved=true;
  const acc=TY.count?Math.round((TY.count-TY.wrong)/TY.count*100):100,best=Math.max(+P.raceBest||0,TY.done),record=TY.done>(+P.raceBest||0)&&TY.done>0;
  P.raceBest=best;P.totals.races=(P.totals.races||0)+1;save();
  $('tWord').textContent=`${TY.done} word${TY.done===1?'':'s'}`;$('tMean').textContent=`${record?'New best! ':''}${acc}% accuracy · best ${best} words. Press Skip to race again.`;
  $('tBox').innerHTML='';sfx(record?'done':'ok');
}
function tPick(){
  typeLevels();
  const v=$('tLevel').value,list=(v==='mine'?(P.notebook||[]).map(w=>({ch:w.ch,meaning:w.meaning,say:w.ch})):VOCAB.filter(w=>w.section===+v)).filter(w=>typeable(w.ch)&&w.ch!==TY.word?.ch);
  if(wTab==='race'&&TY.over)raceReset(); // Skip after a race starts a new one
  TY.word=list[Math.floor(Math.random()*list.length)]||VOCAB[0];TY.keys=[];TY.dict=wTab==='dict';TY.solved=false;
  $('tWord').textContent=TY.dict?'？':TY.word.ch;$('tMean').textContent=TY.dict?'Listen, then type the word you hear. Hear plays it again.':TY.word.meaning;$('tBox').className='type-box';
  if(TY.dict)setTimeout(()=>speak(TY.word.say),250);
  tRender();
}
function tRender(){
  const target=keysFor(TY.word.ch),typed=TY.keys,onTrack=typed.every((j,i)=>j===target[i]);
  $('tBox').innerHTML=`${esc(composeJamo(typed))}<span class="caret"></span>`;
  const next=onTrack&&!TY.dict?target[typed.length]:null,hint=next&&JAMO_KEY[next]; // no key hints when typing from listening
  $('tKb').querySelectorAll('.key').forEach(k=>k.classList.toggle('next',!!hint&&k.dataset.code===hint.code||next===' '&&k.dataset.code==='Space'||!onTrack&&k.dataset.code==='Backspace'));
  $('tDoneLbl').textContent=TY.dict?'heard and typed':'words';
  $('tRaceBox').hidden=wTab!=='race';if(wTab==='race')$('tLeft').textContent=Math.ceil(raceLeft());
  $('tKb').querySelector('[data-code=Shift]').classList.toggle('shift-next',!!hint?.shift);
  $('tDone').textContent=TY.done;
  $('tAcc').textContent=TY.count?Math.round((TY.count-TY.wrong)/TY.count*100)+'%':'100%';
  $('tSpeed').textContent=TY.start&&TY.count>1?Math.round(TY.count/((Date.now()-TY.start)/60000)):0;
}
function tKey(j){
  if(!TY.word||TY.solved)return; // solved: the next word comes in a moment
  const target=keysFor(TY.word.ch);
  if(j==='Backspace'){TY.keys.pop();$('tBox').classList.remove('bad');return tRender()}
  if(composeJamo(TY.keys)===TY.word.ch)return;
  if(!TY.start){TY.start=Date.now();if(wTab==='race'){clearInterval(raceTimer);raceTimer=setInterval(raceTick,250)}}
  TY.count++;
  const ok=TY.keys.every((x,i)=>x===target[i])&&target[TY.keys.length]===j;
  if(!ok){TY.wrong++;$('tBox').classList.add('bad')}else $('tBox').classList.remove('bad');
  TY.keys.push(j);tRender();
  if(composeJamo(TY.keys)===TY.word.ch){
    TY.done++;TY.solved=true;const d=todayStats(P);
    if(TY.dict){P.totals.dictation=(P.totals.dictation||0)+1;d.dict=(d.dict||0)+1;$('tWord').textContent=TY.word.ch;$('tMean').textContent=TY.word.meaning}
    else{P.totals.typed=(P.totals.typed||0)+1;d.typed=(d.typed||0)+1}
    const race=wTab==='race';if(!race)speak(TY.word.say); // racing: no audio, next word at once
    $('tBox').classList.add('ok');save();tRender();const w=TY.word;setTimeout(()=>{if(TY.word===w&&!TY.over)tPick()},race?150:TY.dict?1600:900);
  }
}
// on-screen keyboard
$('tKb').innerHTML=KEY_ROWS.map((row,r)=>`<div class="kb-row">${r===2?'<button class="key" data-code="Shift" aria-label="Shift">⇧</button>':''}${row.map(c=>`<button class="key" data-code="${c}"><small>${c.slice(3)}</small>${KEY_JAMO[c]}${SHIFT_JAMO[c]?`<sup>${SHIFT_JAMO[c]}</sup>`:''}</button>`).join('')}${r===0?'<button class="key" data-code="Backspace" aria-label="Backspace">⌫</button>':''}</div>`).join('')
  +'<div class="kb-row"><button class="key wide" data-code="Space" aria-label="Space">space</button></div>';
$('tKb').onclick=e=>{
  const k=e.target.closest('.key');if(!k)return;
  const c=k.dataset.code;
  if(c==='Shift'){TY.shift=!TY.shift;k.classList.toggle('next',TY.shift);return}
  if(c==='Backspace')tKey('Backspace');else if(c==='Space')tKey(' ');else{tKey(TY.shift&&SHIFT_JAMO[c]||KEY_JAMO[c]);TY.shift=false}
  $('tBox').focus();
};
document.addEventListener('keydown',e=>{
  if(view!=='write'||wTab==='trace'||L||document.querySelector('dialog[open]')||e.ctrlKey||e.altKey||e.metaKey)return;
  if(e.target.closest?.('select,input'))return;
  if(KEY_JAMO[e.code]){e.preventDefault();tKey(e.shiftKey&&SHIFT_JAMO[e.code]||KEY_JAMO[e.code])}
  else if(e.code==='Backspace'){e.preventDefault();tKey('Backspace')}
  else if(e.code==='Space'){e.preventDefault();tKey(' ')}
  else if(e.code==='Enter'&&composeJamo(TY.keys)===TY.word?.ch)tPick();
});
$('tLevel').onchange=tPick;
$('tSkip').onclick=()=>{tPick();$('tBox').focus()};
$('tSay').onclick=()=>TY.word&&speak(TY.word.say);
