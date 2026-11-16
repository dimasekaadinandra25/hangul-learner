// ---- Sound: pre-recorded neural voice (every syllable is recorded); computer's own voice only for your own unrecorded words ----
const player=new Audio();
function speak(text,rate=1){ // rate < 1 plays slower (same pitch)
  speak.run=(speak.run||0)+1;player.onended=null; // stops a syllable-by-syllable word still playing
  if('speechSynthesis' in window)speechSynthesis.cancel();
  if(RECORDED.includes(text)){
    const slow=rate<1&&SLOW_CLIPS.has(text); // a real slow recording instead of a stretched one
    const male=!slow&&MALE_CLIPS.has(text)&&lsGet('voice','female')==='male';
    player.src='audio/'+(slow?'s-':male?'m-':'')+audioName(text);player.defaultPlaybackRate=player.playbackRate=slow?1:rate;player.play().catch(()=>{});
    if(typeof PL!=='undefined'&&PL.playing()){duck(15000);player.addEventListener('ended',unduck,{once:true})} // the podcast goes quiet while a word plays
    return;
  }
  if(!('speechSynthesis' in window))return;
  if(!speechSynthesis.getVoices().some(v=>v.lang.replace('_','-').toLowerCase().startsWith('ko'))){
    const syl=[...text].filter(c=>c!==' ');
    if(syl.length&&syl.every(c=>/[가-힣]/.test(c))){ // no Korean system voice: say it syllable by syllable from the recordings
      const run=speak.run=(speak.run||0)+1,next=i=>{if(run!==speak.run||i>=syl.length)return;player.src='audio/'+audioName(syl[i]);player.playbackRate=rate;player.onended=()=>next(i+1);player.play().catch(()=>{})};
      return next(0);
    }
    if(!speak.warned){speak.warned=true;toast('sync','No Korean voice on this computer','Some of your own words can’t be said. Add Korean in your system’s language or speech settings to hear them.','volume')}
  }
  const u=new SpeechSynthesisUtterance(text);u.lang='ko-KR';u.rate=0.8*rate;
  const v=speechSynthesis.getVoices().find(v=>v.lang.replace('_','-').toLowerCase().startsWith('ko'));if(v)u.voice=v;
  speechSynthesis.speak(u);
}
// Sound effects, synthesized: soft bell (right), wood block (wrong), pentatonic phrase + stamp thump (lesson done)
let actx=null;
function sfx(kind){
  if(P.sfx===false)return;
  try{
    actx??=new AudioContext();
    const t0=actx.currentTime+.01;
    const note=(f,dt,dur,type='sine',vol=.16)=>{const o=actx.createOscillator(),g=actx.createGain();o.type=type;o.frequency.value=f;
      g.gain.setValueAtTime(.0001,t0+dt);g.gain.exponentialRampToValueAtTime(vol,t0+dt+.01);g.gain.exponentialRampToValueAtTime(.0001,t0+dt+dur);
      o.connect(g).connect(actx.destination);o.start(t0+dt);o.stop(t0+dt+dur+.05)};
    if(kind==='ok'){note(1046.5,0,.6);note(1568,.07,.7,'sine',.1)}
    if(kind==='bad'){note(180,0,.16,'triangle',.22);note(135,.09,.2,'triangle',.18)}
    if(kind==='done'){[523.3,587.3,659.3,784,880,1046.5].forEach((f,i)=>note(f,i*.1,.5,'sine',.13));note(90,.68,.18,'sine',.35)}
  }catch(e){console.error(e)}
}
function renderSfx(){
  const on=P.sfx!==false;
  $('sfxToggle').textContent='Sound effects: '+(on?'on':'off');
  $('sfxBtn').innerHTML=icon(on?'volume':'mute');$('sfxBtn').setAttribute('aria-pressed',on);
}
$('sfxToggle').onclick=$('sfxBtn').onclick=()=>{P.sfx=P.sfx===false;save()};
document.addEventListener('click',e=>{
  const go=e.target.closest('[data-go]');if(go)return show(go.dataset.go);
  const b=e.target.closest('[data-say]');if(!b)return;
  speak(b.dataset.say);todayStats(P).heard++;
  if(b.dataset.letter)stat(b.dataset.letter).heard++;
  save();
});
