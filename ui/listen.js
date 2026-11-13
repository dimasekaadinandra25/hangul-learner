// Listen: real Korean podcasts (RSS) and YouTube channels, a player dock, the mini window and tray controls.
// Loaded after the main script in index.html and uses its helpers ($, P, save, show, view, icon, seal, toast, todayStats).
// Feeds were checked when added (Nov 2026). A dead feed only shows "couldn't load"; replace it here.
const PODCASTS=[
  {id:'ttmik',name:'Talk To Me In Korean',level:'Lessons · all levels',seal:'톡',color:'',feed:'https://rss.libsyn.com/shows/18454/destinations/12619.xml'},
  {id:'smalltalk',name:'Small Talk Café',level:'Short dialogues',seal:'카페',color:'gold',feed:'https://feeds.castos.com/2m766'},
  {id:'yeoni',name:'Easy Korean with Yeoni Ssaem',level:'Easy Korean',seal:'연이',color:'jade',feed:'https://anchor.fm/s/db958680/podcast/rss'},
  {id:'julia',name:'Easy Korean Listening with Julia',level:'Easy Korean',seal:'듣기',color:'blue',feed:'https://anchor.fm/s/10b985f24/podcast/rss'},
  {id:'conv',name:'Conversational Korean',level:'Conversations',seal:'대화',color:'',feed:'https://www.spreaker.com/show/7056552/episodes/feed'},
  {id:'sbs',name:'고현준의 뉴스 브리핑 (SBS)',level:'Native-speed news',seal:'뉴스',color:'blue',feed:'https://wizard2.sbs.co.kr/w3/podcast/V2000010540.xml'},
];
const CHANNELS=[ // YouTube channel ids; the latest videos come from youtube.com/feeds/videos.xml
  {id:'UC5r3WHrX4Z7peSYpDlgktGw',name:'Talk To Me In Korean',level:'Lessons · all levels',seal:'톡',color:''},
  {id:'UCcA88_Z7wQWMoQ9bKwjuanA',name:'Korean Unnie 한국언니',level:'Lessons & culture',seal:'언니',color:'jade'},
  {id:'UC7ynjArlSFuXW23ssZAknyA',name:'GO! Billy Korean',level:'Lessons',seal:'빌리',color:'gold'},
  {id:'UCsgBUobNGksxIKTagZayKEw',name:'KoreanClass101',level:'Lessons · all levels',seal:'101',color:'blue'},
  {id:'UCJpIsrXze5HT3X64LDIIHUg',name:'Korean with Miss Vicky 빅키쌤',level:'Lessons',seal:'빅키',color:''},
];
const tauri=window.__TAURI__;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); // feed text is untrusted
const fmt=s=>{s=Math.max(0,Math.floor(s||0));const h=Math.floor(s/3600),m=Math.floor(s/60)%60,x=String(s%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${x}`:`${m}:${x}`};
const lsGet=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch(e){return d}};
const lsSet=(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const dateOf=t=>t?new Date(t).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}):'';

// ---- Feeds: downloaded by the Rust app (curl.exe, no CORS) every time a show is opened, newest first.
// The last copy is saved so the list shows instantly while checking, and still works offline. ----
const fetchText=url=>tauri?tauri.core.invoke('fetch_text',{url}):fetch(url).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.text()});
const feeds={};
const newestFirst=list=>list.sort((a,b)=>b.date-a.date);
const tag=(el,name)=>el.getElementsByTagName(name)[0]?.textContent?.trim()||'';
const plain=html=>new DOMParser().parseFromString(html,'text/html').body.textContent.replace(/\s+/g,' ').trim();
function parsePodcast(xml){
  const doc=new DOMParser().parseFromString(xml,'text/xml'),ch=doc.getElementsByTagName('channel')[0];
  if(!ch)throw Error('not a podcast feed');
  const about=plain(tag(ch,'itunes:summary')||[...ch.children].find(c=>c.tagName==='description')?.textContent||'');
  const items=[...doc.getElementsByTagName('item')].map(it=>{
    const d=tag(it,'itunes:duration');
    return{title:tag(it,'title'),desc:plain(tag(it,'description')||tag(it,'itunes:summary')).slice(0,1500),date:Date.parse(tag(it,'pubDate'))||0,url:it.getElementsByTagName('enclosure')[0]?.getAttribute('url')||'',
      dur:/^\d+$/.test(d)?fmt(+d):d.replace(/^00:/,'')};
  }).filter(e=>/^https?:\/\//.test(e.url));
  return{items:newestFirst(items).slice(0,40),about:about.length>220?about.slice(0,217)+'…':about};
}
function parseYouTube(xml){
  const doc=new DOMParser().parseFromString(xml,'text/xml');
  const all=[...doc.getElementsByTagName('entry')].map(e=>({id:tag(e,'yt:videoId'),title:tag(e,'title'),desc:tag(e,'media:description').slice(0,1500),date:Date.parse(tag(e,'published'))||0,
    short:(e.getElementsByTagName('link')[0]?.getAttribute('href')||'').includes('/shorts/')})).filter(v=>/^[\w-]{11}$/.test(v.id));
  const long=all.filter(v=>!v.short); // Shorts only when the channel has few full videos
  return{items:newestFirst(long.length>=6?long:all),about:'Latest videos from this channel.'};
}
const savedFeed=src=>feeds[src.id]||(feeds[src.id]=lsGet('feed:'+src.id,null)||undefined);
// Always asks the publisher for the current list. On failure it throws and the saved copy (if any) stays on screen.
// YouTube's feed service sometimes answers 404/500 for a moment: try again (also via the channel's uploads playlist)
async function fetchFeed(src){
  if(src.feed)return fetchText(src.feed);
  const urls=[`https://www.youtube.com/feeds/videos.xml?channel_id=${src.id}`,`https://www.youtube.com/feeds/videos.xml?playlist_id=UU${src.id.slice(2)}`];
  for(let k=0;;k++){
    try{return await fetchText(urls[k%2])}
    catch(e){if(k===2)throw e;await new Promise(r=>setTimeout(r,1200*(k+1)))}
  }
}
// When YouTube's feed is down (it has answered 404 for every channel at times), the list comes from YouTube's own embedded
// player instead: it is asked to cue the channel's uploads playlist and reports the video ids (getPlaylist); each title
// comes from YouTube's public oEmbed endpoint. Official interfaces only, no key. Dates aren't available that way.
// The player sometimes stays silent, so up to 3 tries (12 s each), alternating the two ways of loading a list.
function playlistIds(list,cue){
  const box=document.createElement('div');box.style.cssText='position:fixed;left:0;top:0;width:320px;height:320px;opacity:0;pointer-events:none'; // invisible; a tiny or off-screen player never loads the list
  const el=document.createElement('div');box.append(el);document.body.append(box);
  let p=null,poll=0,t=0;
  return new Promise((res,rej)=>{
    t=setTimeout(()=>rej(Error('YouTube did not answer')),12000);
    p=new YT.Player(el,{host:'https://www.youtube-nocookie.com',width:320,height:320,...(cue?{}:{playerVars:{listType:'playlist',list}}),events:{
      onReady:()=>{if(cue)p.cuePlaylist({listType:'playlist',list});poll=setInterval(()=>{const l=p.getPlaylist?.();if(l?.length)res(l)},300)},
      onError:e=>rej(Error('YouTube player error '+e.data))}});
  }).finally(()=>{clearTimeout(t);clearInterval(poll);try{p?.destroy()}catch{}box.remove()});
}
async function uploadsViaPlayer(src){
  await ytApi();
  const list='UU'+src.id.slice(2);let ids=null,err;
  for(let k=0;k<3&&!ids;k++)ids=await playlistIds(list,k%2===0).catch(e=>{err=e;return null});
  if(!ids)throw err;
  const items=await Promise.all(ids.filter(id=>/^[\w-]{11}$/.test(id)).slice(0,20).map(id=>
    fetchText(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`).then(t=>({id,title:String(JSON.parse(t).title||''),desc:'',date:0}),()=>null)));
  return items.filter(v=>v?.title);
}
async function loadFeed(src){
  let f;
  if(src.feed)f=parsePodcast(await fetchFeed(src));
  else try{f=parseYouTube(await fetchFeed(src))}
  catch(e){
    const items=await uploadsViaPlayer(src).catch(()=>[]);
    if(!items.length)throw Error('YouTube’s video list is down right now (their side, not the app or your internet)');
    f={items,about:'Latest videos from this channel. YouTube’s list service is down, so this list comes from YouTube’s player (no dates).',viaPlayer:true};
  }
  f={at:Date.now(),...f};
  if(!f.items.length)throw Error('no episodes found');
  lsSet('feed:'+src.id,f);epKey='';return feeds[src.id]=f; // epKey: re-read the playing episode's words
}

// ---- Player: one "now playing" (podcast audio or a YouTube video) shared by the dock, mini window and tray ----
const pod=new Audio();pod.preload='metadata';
let NP=null,yt=null,ytReady=null,resumeAt=0,seeking=false,rate=lsGet('rate',1),duckT=0,tick=0;
// While the mini window is open, a YouTube video plays THERE (a video can only play in one window).
// remote = its last report {id,t,d,state,at}; this window keeps the dock, quests and tray in charge.
let miniOpen=false,remote=null;
const ytOn=()=>NP?.kind==='yt';
const miniCmd=c=>tauri?.event.emit('mini-video-cmd',c).catch(()=>{});
const PL={
  playing:()=>ytOn()?(remote?remote.state===1:yt?.getPlayerState?.()===1):!!NP&&!pod.paused,
  time:()=>!ytOn()?pod.currentTime||0:remote?remote.t+(remote.state===1?(Date.now()-remote.at)/1000*rate:0)
    :yt?.getCurrentTime&&yt.getPlayerState()!==5?yt.getCurrentTime():resumeAt, // 5 = cued (paused at resumeAt)
  dur:()=>ytOn()?(remote?remote.d:yt?.getDuration?.()||0):pod.duration||0,
  toggle(){
    if(!NP)return;
    if(ytOn()&&remote)miniCmd({cmd:'toggle'});
    else if(ytOn()){if(!yt?.getPlayerState)return playVid(CHANNELS.find(c=>c.id===NP.src)||NP,NP,resumeAt);PL.playing()?yt.pauseVideo():yt.playVideo()}
    else pod.paused?pod.play().catch(playErr):pod.pause();
    setTimeout(refresh,60);
  },
  seek(t){ytOn()?(remote?miniCmd({cmd:'seek',t}):yt?.seekTo?.(t,true)):(pod.currentTime=t);setTimeout(update,60)},
  skip(s){const d=PL.dur(),t=PL.time()+s;PL.seek(Math.max(0,d?Math.min(d-1,t):t))},
};
const playErr=e=>toast('sync','Could not play this episode',e?.message?'Check your internet connection.':'','volume');
function setNow(src,o){
  shadowClose();
  NP={kind:src.feed?'pod':'yt',src:src.id,show:src.name,seal:src.seal,color:src.color,...o};
  if('mediaSession' in navigator)navigator.mediaSession.metadata=new MediaMetadata({title:NP.title,artist:NP.show,album:'Hangul Learner'});
  remember();
}
// Moves the current video into the mini window, starting at t.
function sendToMini(playing,t){
  const d=PL.dur();yt?.pauseVideo?.();
  remote={id:NP.id,t,d,state:playing?3:2,at:Date.now()}; // 3 = buffering until the mini window reports
  tauri.event.emit('mini-video',{id:NP.id,t,playing,rate}).catch(()=>{});refresh();
}
const dropRemote=()=>{if(remote){remote=null;tauri?.event.emit('mini-video',null).catch(()=>{})}};
function playEp(src,e){
  dropRemote();if(yt?.stopVideo)yt.stopVideo();$('ytWrap').hidden=true;$('ytNote').hidden=true;
  setNow(src,{title:e.title,url:e.url});
  pod.src=e.url;pod.playbackRate=rate;pod.play().catch(playErr);refresh();
}
const ytApi=()=>ytReady??=new Promise((res,rej)=>{
  window.onYouTubeIframeAPIReady=res;
  const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.onerror=()=>{ytReady=null;s.remove();rej(Error('offline'))};
  document.head.append(s);
});
async function playVid(src,v,start=0){
  pod.pause();
  setNow(src,{title:v.title,id:v.id});resumeAt=start;
  if(tauri&&miniOpen&&await tauri.core.invoke('mini_visible')){remote=null;$('ytWrap').hidden=true;return sendToMini(true,start)} // mini window is open: play it there
  $('ytWrap').hidden=LV.tab!=='yt';$('ytNote').hidden=true;refresh();
  try{await ytApi()}catch(e){$('ytNote').hidden=false;return}
  if(yt?.loadVideoById){yt.loadVideoById({videoId:v.id,startSeconds:start});yt.setPlaybackRate(rate);return}
  yt=new YT.Player('ytPlayer',{videoId:v.id,host:'https://www.youtube-nocookie.com',
    playerVars:{autoplay:1,start:Math.floor(start),rel:0,playsinline:1,...(location.origin.startsWith('http')?{origin:location.origin}:{})},
    events:{onReady:e=>{e.target.setPlaybackRate(rate);e.target.playVideo()},onStateChange:refresh,onError:()=>{$('ytNote').hidden=false}}});
}
function stopAll(){
  shadowClose();dropRemote();pod.pause();pod.removeAttribute('src');pod.load();if(yt?.stopVideo)yt.stopVideo();
  NP=null;lsSet('np',null);$('ytWrap').hidden=true;$('ytNote').hidden=true;refresh();
}
const remember=()=>NP&&lsSet('np',{...NP,t:Math.floor(PL.time())});

// App words found in the playing episode's title and description (cached per episode)
let epKey='',epList=[];
const itemWords=it=>findWords(`${it.title} ${it.desc||''}`);
function episodeWords(){
  const k=NP?(NP.url||NP.id):'';if(k===epKey)return epList;
  epKey=k;const it=NP&&(feeds[NP.src]||lsGet('feed:'+NP.src,null))?.items.find(i=>(i.url||i.id)===k);
  return epList=it?itemWords(it).slice(0,30).map(w=>({ch:w.ch,meaning:w.meaning,say:w.say})):[];
}

// Dock (bottom of every page) + state for the mini window. refresh() also redraws the episode list.
const refresh=()=>{update();if(view==='listen')renderListen()};
function update(){
  $('dock').hidden=!NP;
  if(NP){
    const on=PL.playing(),t=PL.time(),d=PL.dur();
    $('dSeal').innerHTML=seal(esc(NP.seal),'m',NP.color);$('dTitle').textContent=NP.title;$('dShow').textContent=NP.show;
    $('dPlay').innerHTML=icon(on?'pause':'play');$('dPlay').setAttribute('aria-label',on?'Pause':'Play');
    if(!seeking){$('dSeek').value=d?t/d*1000:0;$('dTime').textContent=d?`${fmt(t)} / ${fmt(d)}`:fmt(t)}
    $('dRate').textContent=rate+'×';
  }
  // the mini window's word card: copied Korean first, then words from the playing episode, then words due for Smart review, then your level
  const due=dueKeys(P).slice(0,30).map(k=>VOCAB.find(w=>w.ch===k)).filter(Boolean).map(w=>({ch:w.ch,meaning:w.meaning,say:w.say}));
  const ep=episodeWords();
  tauri?.event.emit('player-state',{ep,clip:typeof clipWords==='function'?clipWords():[],focus:typeof focusState==='function'?focusState():null,saved:(P.notebook||[]).map(w=>w.ch),...(NP&&{title:NP.title,show:NP.show,seal:NP.seal,color:NP.color,playing:PL.playing(),t:PL.time(),d:PL.dur()}),section:P.section||0,due}).catch(()=>{});
}
['play','pause','ended','loadedmetadata'].forEach(ev=>pod.addEventListener(ev,()=>{refresh();remember()}));
pod.addEventListener('error',()=>NP&&!ytOn()&&pod.getAttribute('src')&&playErr({message:'network'}));
// Every second: move the dock, and count listening time toward today's quests (saved once a minute)
setInterval(()=>{
  if(!NP)return;
  if(PL.playing()){const d=todayStats(P);d.podcastSec=(d.podcastSec||0)+1;P.totals.listenSec=(P.totals.listenSec||0)+1;if(++tick%60===0)save();if(tick%5===0)remember()}
  if(!$('dock').hidden)update();
},1000);

$('dPlay').onclick=()=>PL.toggle();
$('dBack').onclick=()=>PL.skip(-15);
$('dFwd').onclick=()=>PL.skip(30);
$('dClose').onclick=stopAll;
$('dRate').onclick=()=>{const R=[0.75,1,1.25,1.5];rate=R[(R.indexOf(rate)+1)%R.length];lsSet('rate',rate);pod.playbackRate=rate;yt?.setPlaybackRate?.(rate);if(remote)miniCmd({cmd:'rate',r:rate});update()};
$('dSeek').oninput=e=>{seeking=true;const d=PL.dur();$('dTime').textContent=`${fmt(e.target.value/1000*d)} / ${fmt(d)}`};
$('dSeek').onchange=e=>{seeking=false;PL.seek(e.target.value/1000*PL.dur())};
$('dMini').onclick=$('lMini').onclick=()=>tauri?tauri.core.invoke('toggle_mini'):toast('sync','Mini player','The mini player works in the desktop app.','pip');
$('ytOpen').onclick=()=>NP&&tauri?.core.invoke('open_external',{url:`https://www.youtube.com/watch?v=${NP.id}`});
// ---- Shadowing: replay a 5-second piece, record yourself saying it, then compare ----
let SH=null; // {a,b: seconds, url: your recording, timer, rec}
function shadowOpen(){
  if(!NP)return;
  if(SH)return shadowClose();
  const t=PL.time();SH={a:Math.max(0,t-5),b:Math.max(5,t),url:null};
  $('shadow').hidden=false;$('dShadow').setAttribute('aria-pressed',true);renderShadow();shPlay();
}
function shadowClose(){
  if(!SH)return;shStop(SH);if(SH.url)URL.revokeObjectURL(SH.url);SH=null;
  $('shadow').hidden=true;$('dShadow').setAttribute('aria-pressed',false);
}
function renderShadow(){if(!SH)return;$('shSeg').textContent=`${fmt(SH.a)} – ${fmt(SH.b)}`;$('shMine').disabled=$('shBoth').disabled=!SH.url}
// plays the piece once, then pauses (a seek can take a moment, so the end check waits a little)
// resolves true when the piece played to its end, false when something else (Replay, Next, Close) took over
function shPlay(){
  return new Promise(res=>{
    const sh=SH;if(!sh)return res(false);
    shStop(sh);sh.done=res;PL.seek(sh.a);if(!PL.playing())PL.toggle();
    const t0=Date.now(),max=(sh.b-sh.a)/rate*1000+4000;
    sh.timer=setInterval(()=>{
      const late=Date.now()-t0;
      if(SH!==sh)return shStop(sh);
      if(late>max||late>300&&PL.time()>=sh.b-0.05){if(PL.playing())PL.toggle();shStop(sh,true)}
    },80);
  });
}
function shStop(sh,ended=false){clearInterval(sh.timer);const d=sh.done;sh.done=null;d?.(ended)}
const playUrl=url=>new Promise(r=>{const a=new Audio(url);a.onended=a.onerror=r;a.play().catch(r)});
async function shRecord(){
  const sh=SH;if(!sh||sh.rec)return;
  shStop(sh);if(PL.playing())PL.toggle();
  sh.rec=true;$('shRec').classList.add('recording');$('shRecLbl').textContent='Recording… say it';
  try{
    const url=await recordClip(((sh.b-sh.a)/rate+1)*1000);
    if(SH!==sh)return URL.revokeObjectURL(url);
    if(sh.url)URL.revokeObjectURL(sh.url);sh.url=url;
    P.totals.recordings=(P.totals.recordings||0)+1;P.totals.shadow=(P.totals.shadow||0)+1;const d=todayStats(P);d.spoken=(d.spoken||0)+1;save();
    renderShadow();await playUrl(url);
  }catch(e){toast('sync','No microphone found','Check Windows Settings › Privacy › Microphone.','mic')}
  finally{sh.rec=false;$('shRec').classList.remove('recording');$('shRecLbl').textContent='Record me';renderShadow()}
}
const shMove=d=>{if(!SH)return;const len=SH.b-SH.a,dur=PL.dur();SH.a=Math.max(0,SH.a+d*len);SH.b=SH.a+len;if(dur&&SH.b>dur){SH.b=dur;SH.a=Math.max(0,dur-len)}renderShadow();shPlay()};
$('dShadow').onclick=shadowOpen;
$('shPlay').onclick=()=>shPlay();
$('shRec').onclick=shRecord;
$('shMine').onclick=()=>SH?.url&&playUrl(SH.url);
$('shBoth').onclick=async()=>{const sh=SH;if(!sh?.url)return;if(!await shPlay()||SH!==sh)return;await new Promise(r=>setTimeout(r,300));await playUrl(sh.url)};
$('shPrev').onclick=()=>shMove(-1);
$('shNext').onclick=()=>shMove(1);
$('shClose').onclick=shadowClose;

if('mediaSession' in navigator)[['play',()=>PL.toggle()],['pause',()=>PL.toggle()],['seekbackward',()=>PL.skip(-15)],['seekforward',()=>PL.skip(30)]]
  .forEach(([a,f])=>{try{navigator.mediaSession.setActionHandler(a,f)}catch(e){}});

// ---- Listen page: show grid -> episodes / videos ----
const wordsChip=it=>{const n=itemWords(it).length;return n?` · <span class="wchip" title="App words in this episode’s title and description: they appear in the mini player while it plays">${n} word${n===1?'':'s'} to learn</span>`:''};
let LV={tab:'pod',open:null,err:'',loading:false,fetched:null}; // fetched: show id already checked since it was opened
function renderListen(){
  const list=LV.tab==='pod'?PODCASTS:CHANNELS,src=list.find(s=>s.id===LV.open);
  $('lTabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.ltab===LV.tab));
  $('ytWrap').hidden=!(LV.tab==='yt'&&ytOn()&&!remote);
  $('ytMini').hidden=!(LV.tab==='yt'&&remote);
  if(!src){
    $('lBody').innerHTML=`<div class="shows">${list.map(s=>`<button class="show${NP?.src===s.id?' now':''}" data-show="${s.id}">${seal(esc(s.seal),'m',s.color)}<span><b>${esc(s.name)}</b><small>${esc(s.level)}</small></span>${NP?.src===s.id?`<span class="eq" aria-label="Playing">${icon('headphones')}</span>`:''}</button>`).join('')}</div>`;
    return;
  }
  const kept=savedFeed(src);
  if(LV.fetched!==src.id&&!LV.force&&!src.feed&&kept&&!kept.viaPlayer&&Date.now()-kept.at<6*3600e3)LV.fetched=src.id; // YouTube: a list from the last 6 hours is fresh enough
  LV.force=false;
  if(LV.fetched!==src.id&&LV.loading!==src.id){ // opened (or Refresh): get the newest episodes
    const lv=LV;lv.fetched=src.id;lv.loading=src.id;lv.err='';
    loadFeed(src).catch(e=>{if(lv.fetched===src.id)lv.err=String(e?.message||e).slice(0,120)}).finally(()=>{if(lv.loading===src.id)lv.loading=false;if(view==='listen'&&LV===lv)renderListen()});
  }
  const f=savedFeed(src);
  const status=LV.loading===src.id?`<span class="loading">${f?'Checking for new episodes…':'Loading episodes…'}</span>`
    :LV.err?`Couldn’t ${f?'check for new episodes':'load this feed'} (${esc(LV.err)}).${f?' Showing the last saved list.':src.feed?' Check your internet connection.':''} <button class="link" data-refresh>Try again</button>`
    :f?`Updated ${timeAgo(f.at)} · <button class="link" data-refresh>Refresh</button>`:'';
  const head=`<button class="link back" data-show="">${icon('back')}All ${LV.tab==='pod'?'podcasts':'channels'}</button>
    <div class="show-head">${seal(esc(src.seal),'m',src.color)}<div><h2>${esc(src.name)}</h2><p class="muted">${esc(f?.about||src.level)}</p></div></div>
    <p class="feed-status muted">${status}</p>`;
  if(!f){$('lBody').innerHTML=head;return}
  const on=PL.playing();
  $('lBody').innerHTML=head+(src.feed
    ?`<div class="eps">${f.items.map((e,i)=>{const now=NP?.url===e.url;
      return`<div class="ep${now?' now':''}"><button class="play-btn" data-ep="${i}" aria-label="${now&&on?'Pause':'Play'}: ${esc(e.title)}">${icon(now&&on?'pause':'play')}</button><div><b>${esc(e.title)}</b><small>${dateOf(e.date)}${e.dur?' · '+esc(e.dur):''}${wordsChip(e)}</small></div></div>`}).join('')}</div>`
    :`<div class="vids">${f.items.map((v,i)=>`<button class="vid${NP?.id===v.id?' now':''}" data-vid="${i}"><span class="thumb"><img src="https://i.ytimg.com/vi/${v.id}/mqdefault.jpg" alt="" loading="lazy">${NP?.id===v.id?`<span class="eq">${icon(on?'pause':'play')}</span>`:''}</span><b>${esc(v.title)}</b><small>${dateOf(v.date)}${wordsChip(v)}</small></button>`).join('')}</div>`);
}
$('listen').addEventListener('click',e=>{
  const t=e.target.closest('[data-ltab]');if(t){LV={tab:t.dataset.ltab,open:null,err:'',loading:false};return renderListen()}
  const s=e.target.closest('[data-show]');if(s){LV.open=s.dataset.show||null;LV.err='';LV.fetched=null;renderListen();return scrollTo(0,0)}
  if(e.target.closest('[data-refresh]')){LV.fetched=null;LV.force=true;return renderListen()}
  const src=(LV.tab==='pod'?PODCASTS:CHANNELS).find(x=>x.id===LV.open),f=src&&savedFeed(src);if(!f)return;
  const ep=e.target.closest('[data-ep]');
  if(ep){const it=f.items[+ep.dataset.ep];return NP?.url===it.url?PL.toggle():playEp(src,it)}
  const v=e.target.closest('[data-vid]');
  if(v){const it=f.items[+v.dataset.vid];NP?.id===it.id?PL.toggle():playVid(src,it);$('ytWrap').hidden=!!remote||miniOpen;scrollTo({top:0,behavior:'smooth'})}
});

// Coming back to the Listen page checks the open show again
document.querySelector('.nav-item[data-tab=listen]').addEventListener('click',()=>{LV.fetched=null;renderListen()});

// ---- Mini window and tray talk to this window through events ----
tauri?.event.listen('player-cmd',e=>{
  const c=e.payload;
  if(c==='toggle')PL.toggle();else if(c==='back')PL.skip(-15);else if(c==='fwd')PL.skip(30);
  else if(c==='listen'){tauri.core.invoke('show_main');show('listen')}
  else if(c==='duck'){pod.volume=.2;yt?.setVolume?.(20);clearTimeout(duckT);duckT=setTimeout(()=>{pod.volume=1;yt?.setVolume?.(100)},1800)} // mini window speaks a word
});
tauri?.event.listen('mini-ready',update);
tauri?.event.listen('mini-shown',()=>{miniOpen=true;if(ytOn()&&!remote)sendToMini(PL.playing(),PL.time());update()});
tauri?.event.listen('mini-hidden',()=>{miniOpen=false}); // the mini window answers with mini-video-end
tauri?.event.listen('mini-video-state',e=>{
  const p=e.payload;if(!remote||NP?.id!==p.id)return;
  const changed=remote.state!==p.state;remote={...p,at:Date.now()};changed?refresh():update();
});
// The mini window closed: continue the video here from the same second
tauri?.event.listen('mini-video-end',e=>{
  const p=e.payload;if(!remote||NP?.id!==p.id)return;
  remote=null;miniOpen=false;resumeAt=p.t; // (this can arrive before mini-hidden)
  if(p.playing)playVid(CHANNELS.find(c=>c.id===NP.src)||NP,NP,p.t);
  else{yt?.cueVideoById?.({videoId:NP.id,startSeconds:p.t});remember();refresh()}
});
$('ytBack').onclick=()=>tauri?.core.invoke('toggle_mini');

// Close to tray (per device, like the theme)
const trayOn=()=>lsGet('tray',true);
const renderTray=()=>{$('trayToggle').textContent='Close to tray: '+(trayOn()?'on':'off');$('trayToggle').title=trayOn()?'Closing the window keeps the app (and audio) running in the tray':'Closing the window quits the app'};
$('trayToggle').onclick=()=>{lsSet('tray',!trayOn());tauri?.core.invoke('close_to_tray',{on:trayOn()});renderTray()};
$('trayToggle').hidden=!tauri;
tauri?.core.invoke('close_to_tray',{on:trayOn()});renderTray();

// Resume where you left off (paused)
{const s=lsGet('np',null);
  if(s?.kind==='pod'&&s.url){NP=s;resumeAt=s.t||0;pod.src=s.url+(resumeAt?'#t='+resumeAt:'');pod.playbackRate=rate}
  else if(s?.kind==='yt'&&s.id){NP=s;resumeAt=s.t||0}
  update();}
