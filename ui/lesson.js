// Game logic, no DOM: exercises, steps, streaks, quests, achievements. Tested by tools/check.js.
const HEARTS=5,DAILY_GOAL=30,QUEST_XP=10,WEEKLY_XP=40;
const shuffle=a=>a.map(x=>[Math.random(),x]).sort((p,q)=>p[0]-q[0]).map(p=>p[1]);
const pickOne=a=>a[Math.floor(Math.random()*a.length)];

// Every unit has 4 steps on the path. Passing PASS_STEP unlocks the next unit.
const STEPS=[
  {name:'Learn 1',icon:'book',hearts:5,xp:10},
  {name:'Learn 2',icon:'book',hearts:5,xp:10},
  {name:'Practice',icon:'repeat',hearts:5,xp:10},
  {name:'Challenge',icon:'crown',hearts:3,xp:20},
];
const PASS_STEP=2,CHALLENGE_STEP=3;

// Sounds that are (nearly) identical in modern Korean never appear as options together; ㅇ and ㅏ both play as 아
const SAME=['ㅐㅔ','ㅒㅖ','ㅙㅞㅚ','ㅇㅏ'];
const soundsDifferent=(a,b)=>a!==b&&!SAME.some(s=>s.includes(a)&&s.includes(b));

// `answer` plus up to n-1 others from pool whose key(...) differs from every option already picked
function options(answer,pool,key,n=4,differ=(a,b)=>a!==b){
  const out=[answer];
  for(const x of shuffle(pool)){if(out.length===n)break;if(out.every(o=>differ(key(o),key(x))))out.push(x)}
  return shuffle(out);
}

const explainOf=(u,item)=>u.kind==='letter'?`${item.ch} sounds like “${item.rom}”`:u.kind==='syllable'?`${item.parts.join(' + ')} = ${item.ch}`:`${item.ch} = ${item.meaning}`;

// Exercise types per kind and difficulty. easy = recognition only, hard = recall without visual hints.
const TYPES={
  letter:{easy:['listen','read','rom2ch'],mixed:['listen','read','rom2ch'],hard:['listen','rom2ch']},
  syllable:{easy:['buildShown','listen'],mixed:['buildShown','buildHeard','listen'],hard:['buildHeard','listen']},
  word:{easy:['meaning','reverse','listen'],mixed:['meaning','listen','reverse','tiles'],hard:['tiles','listen','reverse']},
  grammar:{easy:['gmeaning','fill'],mixed:['fill','gmeaning','glisten','order'],hard:['order','fill','glisten']},
};

// type 'choice': pick options[].value === answer. 'tiles': tap tiles in order, joined === answer. 'intro': teaching card.
// key = item id for stats/mistakes; say + explain are played/shown when the answer is revealed.
function makeExercise(unitIdx,item,mode='mixed'){
  const u=typeof unitIdx==='number'?UNITS[unitIdx]:unitIdx;
  if(u.kind==='grammar')return grammarExercise(unitIdx,item,mode);
  const base={unit:u.id,key:item.ch,say:item.say,explain:explainOf(u,item)};
  const pool=typeof unitIdx==='number'?UNITS.slice(0,unitIdx+1).filter(x=>x.kind===u.kind&&x.section===u.section).flatMap(x=>x.items) // distractors: same level, units so far
    :[...u.items,...VOCAB.slice(0,80)]; // My words: own words plus beginner words as distractors
  const choice=(prompt,show,opts,label,big)=>({...base,type:'choice',prompt,...show,answer:item.ch,options:opts.map(o=>({value:o.ch,label:label(o),big}))});
  const tiles=(prompt,show,parts,extra)=>({...base,type:'tiles',prompt,...show,parts,answer:parts.join(''),
    tiles:shuffle([...parts,...shuffle([...new Set(extra)].filter(t=>!parts.includes(t))).slice(0,4)])});
  const tok=w=>w.includes(' ')?w.split(' '):[...w]; // phrases are built from whole words
  const multi=item.ch.includes(' ');
  const type=pickOne(TYPES[u.kind][mode]);
  const ex=(()=>{switch(type){
    case 'listen':
      if(u.kind==='letter')return choice('Which letter do you hear?',{play:item.say},options(item,pool,l=>l.ch,4,soundsDifferent),l=>l.ch,true);
      return choice(u.kind==='word'?'Which one do you hear?':'Which syllable do you hear?',{play:item.say},options(item,pool,x=>x.ch),x=>x.ch,true);
    case 'read':return choice('How does this letter sound?',{big:item.ch},options(item,pool,l=>l.rom),l=>l.rom,false);
    case 'rom2ch':return choice(`Which letter makes the sound “${item.rom}”?`,{},options(item,pool,l=>l.rom),l=>l.ch,true);
    case 'buildShown':return tiles('Build this syllable from its letters',{big:item.ch,play:item.say},item.parts,[...SYL_C,...SYL_V]);
    case 'buildHeard':return tiles('Build the syllable you hear',{play:item.say},item.parts,[...SYL_C,...SYL_V]);
    case 'meaning':return choice('What does this mean?',{big:item.ch,play:item.say},options(item,pool,w=>w.meaning),w=>w.meaning,false);
    case 'reverse':return choice(`Which one means “${item.meaning}”?`,{},options(item,pool,w=>w.meaning),w=>w.ch,true);
    case 'tiles':return tiles(`Write “${item.meaning}” in Korean`,{play:item.say},tok(item.ch),pool.filter(w=>w.ch.includes(' ')===multi).flatMap(w=>tok(w.ch)));
  }})();
  ex.skill=type==='listen'?'listen':['buildShown','buildHeard','tiles'].includes(type)?'write':'read'; // for skill quests
  return ex;
}

// Grammar: fill the blank (English shows the meaning), what a sentence means, which sentence you hear, word order.
function grammarExercise(unitIdx,item,mode){
  const u=UNITS[unitIdx];
  const others=UNITS.slice(0,unitIdx+1).filter(x=>x.kind==='grammar'&&x.section===u.section).flatMap(x=>x.items).filter(x=>x!==item);
  const sents=others.flatMap(o=>o.ex);
  const [ko,en]=pickOne(item.ex),[qko,qen,qa,qd]=item.q;
  const type=pickOne(TYPES.grammar[mode]);
  const base={unit:u.id,key:item.ch,say:ko,explain:`${item.ch} · ${item.meaning}. ${ko} = ${en}`};
  const choice=(prompt,show,answer,opts)=>({...base,type:'choice',prompt,...show,answer,options:opts.map(v=>({value:v,label:v,big:false}))});
  const ex=(()=>{switch(type){
    case 'fill':return{...choice(`Fill in the blank: “${qen}”`,{big:qko},qa,shuffle([qa,...qd])),say:fillQ(item.q),explain:`${fillQ(item.q)} = ${qen}`};
    case 'gmeaning':return choice('What does this sentence mean?',{big:ko,play:ko},en,options([ko,en],sents,s=>s[1]).map(s=>s[1]));
    case 'glisten':return choice('Which sentence do you hear?',{play:ko},ko,options([ko,en],sents,s=>s[0]).map(s=>s[0]));
    case 'order':{const parts=ko.split(' '),extra=shuffle(sents.flatMap(s=>s[0].split(' ')).filter(w=>!parts.includes(w))).slice(0,3);
      return{...base,type:'tiles',prompt:`Put the words in order: “${en}”`,play:ko,parts,answer:parts.join(''),tiles:shuffle([...parts,...extra])}}
  }})();
  ex.skill=type==='glisten'?'listen':type==='order'?'write':'read';
  ex.grammar=true;
  return ex;
}

function introCard(unitIdx,item){
  const u=typeof unitIdx==='number'?UNITS[unitIdx]:unitIdx;
  if(u.kind==='grammar')return{type:'intro',unit:u.id,key:item.ch,say:item.ex[0][0],play:item.ex[0][0],big:item.ch,prompt:'New grammar',
    explain:`${item.meaning} · ${item.note}`,example:item.ex[0],grammar:true};
  return{type:'intro',unit:u.id,key:item.ch,say:item.say,play:item.say,big:item.ch,
    prompt:u.kind==='letter'?'New letter':u.kind==='syllable'?'New syllable':'New word',
    explain:u.kind==='letter'?`Sounds like “${item.rom}”`:u.kind==='syllable'?`${item.parts.join(' + ')} = ${item.ch}`:item.meaning};
}

const fillTo=(list,n)=>{const out=[];while(list.length&&out.length<n)out.push(...shuffle(list));return out.slice(0,n)};

// Learn steps teach half the unit each (max 10 new items, intro cards first); Practice mixes all; Challenge is harder.
function buildStep(unitIdx,step){
  const items=UNITS[unitIdx].items,mid=Math.ceil(items.length/2);
  if(step<PASS_STEP){
    let half=step===0?items.slice(0,mid):items.slice(mid);
    if(half.length>10)half=shuffle(half).slice(0,10); // only the 70-syllable unit is bigger
    return[...half.map(it=>introCard(unitIdx,it)),...fillTo(half,Math.max(8,half.length)).map(it=>makeExercise(unitIdx,it,'easy'))];
  }
  if(step===PASS_STEP)return fillTo(items,10).map(it=>makeExercise(unitIdx,it,'mixed'));
  return fillTo(items,12).map(it=>makeExercise(unitIdx,it,'hard'));
}

// ---- Smart review (spaced repetition) ----
// P.srs {key:{u:unitId, iv:days, ease, due:YYYY-MM-DD}}. A right answer on a due item pushes it further out
// (1 day, then x ease: ~3, 7, 16 … days, max 180); a wrong answer brings it back today and makes it come back sooner.
const addDays=(day,n)=>{const[y,m,d]=day.split('-').map(Number);return dayKey(new Date(y,m-1,d+n))};
function schedule(P,key,unit,right,day=dayKey()){
  P.srs??={};
  const s=P.srs[key]??={u:unit,iv:0,ease:2.3,due:day};
  s.u=unit;
  if(!right){s.iv=0;s.ease=Math.max(1.3,+(s.ease-0.2).toFixed(2));s.due=day;return s}
  if(s.due>day)return s; // already scheduled ahead: answering again early doesn't move it
  s.iv=s.iv?Math.min(180,Math.round(s.iv*s.ease)):1;s.ease=Math.min(2.8,+(s.ease+0.05).toFixed(2));s.due=addDays(day,s.iv);
  return s;
}
const learned=(P,key,unit,day=dayKey())=>{P.srs??={};P.srs[key]??={u:unit,iv:0,ease:2.3,due:addDays(day,1)}}; // after an intro card
// Learners from before Smart review: every item already answered right joins the schedule, spread over a week
function seedSrs(P,day=dayKey()){
  P.srs??={};if(P.srsSeeded)return;P.srsSeeded=true;let n=0;
  for(const u of UNITS)for(const it of u.items)if(P.stats[it.ch]?.right>0&&!P.srs[it.ch])P.srs[it.ch]={u:u.id,iv:1,ease:2.3,due:addDays(day,n++%7)};
}
const dueKeys=(P,day=dayKey())=>Object.entries(P.srs||{}).filter(([,s])=>s.due<=day).sort((a,b)=>a[1].due<b[1].due?-1:a[1].due>b[1].due?1:0).map(([k])=>k);
// My words as a unit object, so the normal exercises work for them
const notebookUnit=P=>({id:'mine',title:'My words',kind:'word',section:-1,items:(P.notebook||[]).map(w=>({ch:w.ch,meaning:w.meaning,say:w.ch}))});
function itemFor(P,key,uid){
  if(uid==='mine'){const nu=notebookUnit(P),it=nu.items.find(x=>x.ch===key);return it?[nu,it]:null}
  const i=UNITS.findIndex(u=>u.id===uid),it=i<0?null:UNITS[i].items.find(x=>x.ch===key);
  return it?[i,it]:null;
}
// Up to `limit` due items, oldest first, one question each
function buildSmart(P,day=dayKey(),limit=15){
  return dueKeys(P,day).flatMap(k=>{const r=itemFor(P,k,P.srs[k].u);return r?[r]:[]}).slice(0,limit).map(([u,it])=>({...makeExercise(u,it,'mixed'),smart:true}));
}

// ---- TOPIK practice test: choice questions only, no feedback until the end ----
// skill: vocab (meaning / reverse), listening, grammar (fill / sentence meaning)
function buildTest(si,n=20){
  const units=UNITS.map((u,i)=>[u,i]).filter(([u])=>u.section===si);
  const words=units.filter(([u])=>u.kind!=='grammar'),gram=units.filter(([u])=>u.kind==='grammar');
  // k choice questions of one area; items that can't make one (e.g. syllables for reading) are skipped
  const pick=(list,k,kind,mode)=>{
    const out=[],items=shuffle(list.flatMap(([u,i])=>u.items.map(it=>[i,it])));
    for(let n=0;out.length<k&&n<k*6&&items.length;n++){
      const[i,it]=items[n%items.length];
      for(let t=0;t<12;t++){const ex=makeExercise(i,it,mode);if(ex.type==='choice'&&(kind==='listening')===(ex.skill==='listen')){out.push({...ex,area:kind});break}}
    }
    return out;
  };
  const g=gram.length?Math.round(n*0.3):0,l=Math.round(n*0.3);
  return shuffle([...pick(words,n-g-l,'vocab','mixed'),...pick(words,l,'listening','mixed'),...pick(gram,g,'grammar','mixed')]);
}

// mistakes: {itemKey: unitId}. Each mistaken item is practised twice, up to 10 questions.
function buildReview(mistakes,P={}){
  const list=Object.entries(mistakes).flatMap(([key,uid])=>{
    const r=itemFor(P,key,uid);
    return r?[r]:[];
  });
  return fillTo(list,Math.min(10,list.length*2)).map(([i,it])=>makeExercise(i,it,'mixed'));
}

// ---- Progress ----
// stats {key:{heard,right,tries,written}}, days {YYYY-MM-DD: xp}, units {unitId: practice passes},
// steps {"unitId:step": passes}, mistakes {key: unitId}, daily = today's quest counters, badges = unlocked achievement ids
// log {YYYY-MM-DD: daily counters}, weekClaims {weekKey: [questIds]}, tasks = finished task ids,
// inbox = recent notifications [{kind,title,body,at}], inboxSeen = time the inbox was last opened
// srs = smart review schedule, notebook = My words [{ch,meaning,added}], tests = practice test results [{at,level,score,total,areas}]
const freshProgress=()=>({stats:{},xp:0,days:{},units:{},steps:{},mistakes:{},section:0,bestStreak:0,badges:[],srs:{},notebook:[],tests:[],drills:{},stories:{},drillMiss:{},talks:{},
  totals:{lessons:0,perfect:0,challenges:0,reviews:0,quests:0,weekly:0,built:0,searches:0,fullDays:0,listenSec:0,smart:0,recordings:0,typed:0,strokes:0,focus:0,shadow:0,dictation:0},bestStroke:0,
  log:{},weekClaims:{},tasks:[],inbox:[],inboxSeen:0});
const isMastered=(P,k)=>{const s=P.stats[k];return!!s&&s.right>=3&&s.right/s.tries>=0.75};
// Units passed before steps existed count as having their Learn and Practice steps done.
const stepDone=(P,unit,step)=>(P.steps[unit.id+':'+step]||0)>0||(step<=PASS_STEP&&(P.units[unit.id]||0)>0);
const stepXp=(step,heartsLeft)=>step==null?10:STEPS[step].xp+heartsLeft*(step===CHALLENGE_STEP?2:1);

const dayKey=(d=new Date())=>d.toLocaleDateString('sv'); // local YYYY-MM-DD
// A streak survives until a full day is missed, so if today isn't done yet count from yesterday.
function streak(days,today=new Date()){
  const d=new Date(today);let n=0;
  if(!days[dayKey(d)])d.setDate(d.getDate()-1);
  while(days[dayKey(d)]){n++;d.setDate(d.getDate()-1)}
  return n;
}

// ---- Daily quests: 4 per day (one XP quest + three others), the same all day ----
const QUESTS=[
  {id:'xp30',text:'Earn 30 XP',metric:'xp',target:30,icon:'zap'},
  {id:'xp60',text:'Earn 60 XP',metric:'xp',target:60,icon:'zap'},
  {id:'xp100',text:'Earn 100 XP',metric:'xp',target:100,icon:'zap'},
  {id:'lessons2',text:'Complete 2 lessons',metric:'lessons',target:2,icon:'book'},
  {id:'lessons3',text:'Complete 3 lessons',metric:'lessons',target:3,icon:'book'},
  {id:'lessons5',text:'Complete 5 lessons',metric:'lessons',target:5,icon:'book'},
  {id:'correct15',text:'Answer 15 questions correctly',metric:'correct',target:15,icon:'check'},
  {id:'correct30',text:'Answer 30 questions correctly',metric:'correct',target:30,icon:'check'},
  {id:'correct50',text:'Answer 50 questions correctly',metric:'correct',target:50,icon:'check'},
  {id:'combo8',text:'Get 8 correct answers in a row',metric:'combo',target:8,icon:'flame'},
  {id:'combo15',text:'Get 15 correct answers in a row',metric:'combo',target:15,icon:'flame'},
  {id:'combo25',text:'Get 25 correct answers in a row',metric:'combo',target:25,icon:'flame'},
  {id:'perfect1',text:'Finish a lesson without mistakes',metric:'perfect',target:1,icon:'star'},
  {id:'perfect2',text:'Finish 2 lessons without mistakes',metric:'perfect',target:2,icon:'star'},
  {id:'write5',text:'Practise writing 5 letters',metric:'written',target:5,icon:'pen'},
  {id:'write10',text:'Practise writing 10 letters',metric:'written',target:10,icon:'pen'},
  {id:'review1',text:'Complete a mistakes review',metric:'reviews',target:1,icon:'rotate'},
  {id:'heard10',text:'Tap 10 letters or words to hear them',metric:'heard',target:10,icon:'volume'},
  {id:'listen8',text:'Answer 8 listening questions correctly',metric:'listen',target:8,icon:'volume'},
  {id:'read10',text:'Answer 10 reading questions correctly',metric:'read',target:10,icon:'layers'},
  {id:'build5',text:'Build 5 answers from tiles',metric:'write',target:5,icon:'type'},
  {id:'intros5',text:'Learn 5 new letters or words',metric:'intros',target:5,icon:'sparkles'},
  {id:'minutes10',text:'Study for 10 minutes',metric:'minutes',target:10,icon:'clock'},
  {id:'minutes20',text:'Study for 20 minutes',metric:'minutes',target:20,icon:'clock'},
  {id:'practice1',text:'Pass a Practice step',metric:'practice',target:1,icon:'repeat'},
  {id:'challenge1',text:'Finish a Challenge step',metric:'challenges',target:1,icon:'crown'},
  {id:'podcast10',text:'Listen to Korean podcasts or videos for 10 minutes',metric:'podcast',target:10,icon:'headphones'},
  {id:'podcast20',text:'Listen to Korean podcasts or videos for 20 minutes',metric:'podcast',target:20,icon:'headphones'},
  {id:'srs10',text:'Get 10 Smart review answers right',metric:'srs',target:10,icon:'repeat'},
  {id:'grammar5',text:'Answer 5 grammar questions correctly',metric:'grammar',target:5,icon:'book'},
  {id:'typed5',text:'Type 5 words correctly on the Write page',metric:'typed',target:5,icon:'keyboard'},
  {id:'spoken3',text:'Record yourself saying 3 words',metric:'spoken',target:3,icon:'mic'},
  {id:'drill10',text:'Answer 10 questions right on the Practice page',metric:'drill',target:10,icon:'target'},
  {id:'drill25',text:'Answer 25 questions right on the Practice page',metric:'drill',target:25,icon:'target'},
  {id:'dict5',text:'Type 5 words you hear (Write › Listen)',metric:'dict',target:5,icon:'headphones'},
  {id:'focus1',text:'Finish a focus timer session',metric:'focus',target:1,icon:'clock'},
  {id:'talk1',text:'Finish a role-play conversation (Practice › Talk)',metric:'talks',target:1,icon:'mic'},
];
const seeded=key=>{let h=0;for(const c of key)h=(h*31+c.charCodeAt(0))>>>0;return()=>(h=(Math.imul(h,1103515245)+12345)>>>0)/2**32};
function pickSeeded(list,n,rnd){const l=[...list],out=[];while(out.length<n&&l.length)out.push(l.splice(Math.floor(rnd()*l.length),1)[0]);return out}
function dailyQuests(day){
  const rnd=seeded(day);
  return[...pickSeeded(QUESTS.filter(q=>q.metric==='xp'),1,rnd),...pickSeeded(QUESTS.filter(q=>q.metric!=='xp'),3,rnd)];
}
const emptyDaily=day=>({date:day,lessons:0,correct:0,combo:0,perfect:0,written:0,reviews:0,heard:0,challenges:0,
  practice:0,intros:0,listen:0,read:0,write:0,seconds:0,podcastSec:0,srs:0,typed:0,spoken:0,grammar:0,drill:0,dict:0,focus:0,talks:0,claimed:[]});
function todayStats(P,day=dayKey()){P.log??={};return P.log[day]??=emptyDaily(day)}
// One day's value for a quest metric. xp lives in P.days; minutes come from seconds (podcast: from podcastSec).
function metricOn(P,day,metric){
  if(metric==='xp')return P.days[day]||0;
  const d=P.log?.[day];if(!d)return 0;
  return metric==='minutes'?Math.floor((d.seconds||0)/60):metric==='podcast'?Math.floor((d.podcastSec||0)/60):d[metric]||0;
}
const questProgress=(P,q,day=dayKey())=>Math.min(q.target,metricOn(P,day,q.metric));

// ---- Weekly quests: 3 per week (Monday-Sunday), bigger targets, +WEEKLY_XP each ----
const WEEKLY=[
  {id:'w-xp300',text:'Earn 300 XP this week',metric:'xp',target:300,icon:'zap'},
  {id:'w-lessons15',text:'Complete 15 lessons',metric:'lessons',target:15,icon:'book'},
  {id:'w-days5',text:'Study on 5 different days',metric:'days',target:5,icon:'flame'},
  {id:'w-correct150',text:'Answer 150 questions correctly',metric:'correct',target:150,icon:'check'},
  {id:'w-perfect5',text:'Finish 5 lessons without mistakes',metric:'perfect',target:5,icon:'star'},
  {id:'w-challenge3',text:'Finish 3 Challenge steps',metric:'challenges',target:3,icon:'crown'},
  {id:'w-minutes60',text:'Study for 60 minutes',metric:'minutes',target:60,icon:'clock'},
  {id:'w-write25',text:'Practise writing 25 letters',metric:'written',target:25,icon:'pen'},
  {id:'w-goal4',text:'Reach your daily goal on 4 days',metric:'goal',target:4,icon:'target'},
  {id:'w-podcast60',text:'Listen to Korean for 60 minutes',metric:'podcast',target:60,icon:'headphones'},
  {id:'w-srs50',text:'Get 50 Smart review answers right',metric:'srs',target:50,icon:'repeat'},
  {id:'w-drill100',text:'Answer 100 questions right on the Practice page',metric:'drill',target:100,icon:'target'},
  {id:'w-focus5',text:'Finish 5 focus timer sessions',metric:'focus',target:5,icon:'clock'},
];
function weekKey(d=new Date()){const m=new Date(d);m.setDate(m.getDate()-(m.getDay()+6)%7);return dayKey(m)} // Monday of that week
function weekDays(week){const[y,mo,da]=week.split('-').map(Number);return Array.from({length:7},(_,i)=>dayKey(new Date(y,mo-1,da+i)))}
const weeklyQuests=week=>pickSeeded(WEEKLY,3,seeded('week'+week));
function weekProgress(P,q,week=weekKey()){
  const days=weekDays(week);
  const v=q.metric==='days'?days.filter(d=>(P.days[d]||0)>0).length
    :q.metric==='goal'?days.filter(d=>(P.days[d]||0)>=DAILY_GOAL).length
    :days.reduce((sum,d)=>sum+metricOn(P,d,q.metric),0);
  return Math.min(q.target,v);
}

// ---- Tasks: one-time milestones with an XP reward, grouped into chapters ----
const heardCount=(P,list)=>list.filter(l=>P.stats[l.ch]?.heard).length;
const writtenCount=P=>Object.values(P.stats).filter(s=>s.written).length;
const unitPassed=(P,id)=>(P.units[id]||0)>0;
const listenedMin=P=>Math.floor((P.totals.listenSec||0)/60);
const drillRight=(P,kind)=>+P.drills?.[kind]?.right||0;
const talksDone=P=>Object.values(P.talks||{}).filter(n=>+n>0).length;
const storiesRead=P=>Object.values(P.stories||{}).filter(s=>s&&+s.best>=2).length; // every story has 2 questions
const TASKS=[
  {id:'t-hear',group:'Getting started',text:'Tap a letter to hear it',xp:5,get:P=>[heardCount(P,ALL),1]},
  {id:'t-first',group:'Getting started',text:'Finish your first lesson',xp:10,get:P=>[P.totals.lessons,1]},
  {id:'t-write',group:'Getting started',text:'Trace a letter on the Write page',xp:5,get:P=>[writtenCount(P),1]},
  {id:'t-build',group:'Getting started',text:'Build and hear a syllable on the Letters page',xp:5,get:P=>[P.totals.built,1]},
  {id:'t-search',group:'Getting started',text:'Search the word list',xp:5,get:P=>[P.totals.searches,1]},
  {id:'t-podcast',group:'Getting started',text:'Listen to a Korean podcast or video for 5 minutes',xp:10,get:P=>[Math.min(listenedMin(P),5),5]},
  {id:'t-vowels',group:'Hangul',text:'Pass the Basic vowels unit',xp:15,get:P=>[+unitPassed(P,'vowels'),1]},
  {id:'t-cons',group:'Hangul',text:'Hear all 14 basic consonants',xp:15,get:P=>[heardCount(P,GROUPS[0][1]),14]},
  {id:'t-write10',group:'Hangul',text:'Write 10 different letters',xp:20,get:P=>[writtenCount(P),10]},
  {id:'t-letters10',group:'Hangul',text:'Master 10 letters',xp:20,get:P=>[ALL.filter(l=>isMastered(P,l.ch)).length,10]},
  {id:'t-basics',group:'Hangul',text:'Finish Hangul basics',xp:50,get:P=>[sectionPassed(P,0),SECTIONS[0].units.length]},
  {id:'t-topik',group:'TOPIK',text:'Pass your first TOPIK unit',xp:20,get:P=>[UNITS.filter(u=>u.section>0&&unitPassed(P,u.id)).length,1]},
  {id:'t-words25',group:'TOPIK',text:'Master 25 words',xp:25,get:P=>[wordsMastered(P),25]},
  {id:'t-topik1',group:'TOPIK',text:'Finish TOPIK 1',xp:50,get:P=>[sectionPassed(P,1),SECTIONS[1].units.length]},
  {id:'t-words100',group:'TOPIK',text:'Master 100 words',xp:50,get:P=>[wordsMastered(P),100]},
  {id:'t-challenge',group:'Habits',text:'Finish a Challenge step',xp:15,get:P=>[P.totals.challenges,1]},
  {id:'t-review',group:'Habits',text:'Clear mistakes in a review',xp:10,get:P=>[P.totals.reviews,1]},
  {id:'t-perfect',group:'Habits',text:'Finish a lesson without mistakes',xp:10,get:P=>[P.totals.perfect,1]},
  {id:'t-streak3',group:'Habits',text:'Study 3 days in a row',xp:20,get:P=>[P.bestStreak,3]},
  {id:'t-goal3',group:'Habits',text:'Reach your daily goal on 3 days',xp:20,get:P=>[Object.values(P.days).filter(x=>x>=DAILY_GOAL).length,3]},
  {id:'t-allday',group:'Habits',text:'Complete all 4 daily quests in one day',xp:25,get:P=>[P.totals.fullDays,1]},
  {id:'t-weekly',group:'Habits',text:'Complete a weekly quest',xp:15,get:P=>[P.totals.weekly,1]},
  {id:'t-streak7',group:'Habits',text:'Study 7 days in a row',xp:40,get:P=>[P.bestStreak,7]},
  {id:'t-smart',group:'Tools',text:'Finish a Smart review',xp:10,get:P=>[P.totals.smart||0,1]},
  {id:'t-notebook',group:'Tools',text:'Save 5 words to My words',xp:10,get:P=>[(P.notebook||[]).length,5]},
  {id:'t-grammar',group:'Tools',text:'Pass your first grammar unit',xp:20,get:P=>[UNITS.filter(u=>u.kind==='grammar'&&unitPassed(P,u.id)).length,1]},
  {id:'t-test',group:'Tools',text:'Take a TOPIK practice test',xp:15,get:P=>[(P.tests||[]).length,1]},
  {id:'t-test80',group:'Tools',text:'Score 80% or more on a practice test',xp:30,get:P=>[Math.max(0,...(P.tests||[]).map(t=>Math.round(t.score/t.total*100))),80]},
  {id:'t-speak',group:'Tools',text:'Record yourself and compare with the native voice',xp:10,get:P=>[P.totals.recordings||0,1]},
  {id:'t-type',group:'Tools',text:'Type 10 words correctly',xp:15,get:P=>[P.totals.typed||0,10]},
  {id:'t-stroke',group:'Tools',text:'Score 80% or more on a stroke-order check',xp:15,get:P=>[P.bestStroke||0,80]},
  {id:'t-numbers',group:'Practice',text:'Get 20 number questions right',xp:15,get:P=>[drillRight(P,'num'),20]},
  {id:'t-verbs',group:'Practice',text:'Get 20 verb-ending questions right',xp:15,get:P=>[drillRight(P,'verb'),20]},
  {id:'t-sounds',group:'Practice',text:'Get 15 sound-change questions right',xp:15,get:P=>[drillRight(P,'sound'),15]},
  {id:'t-story',group:'Practice',text:'Read a story and answer every question right',xp:10,get:P=>[storiesRead(P),1]},
  {id:'t-stories',group:'Practice',text:'Read all 6 stories',xp:40,get:P=>[storiesRead(P),6]},
  {id:'t-dict',group:'Practice',text:'Type 10 words you hear (Write › Listen)',xp:15,get:P=>[P.totals.dictation||0,10]},
  {id:'t-shadow',group:'Practice',text:'Shadow a podcast: replay 5 seconds and record yourself',xp:10,get:P=>[P.totals.shadow||0,1]},
  {id:'t-focus',group:'Practice',text:'Finish a focus timer session',xp:10,get:P=>[P.totals.focus||0,1]},
  {id:'t-particles',group:'Practice',text:'Get 20 particle questions right',xp:15,get:P=>[drillRight(P,'part'),20]},
  {id:'t-miss',group:'Practice',text:'Clear your Mistakes list in a drill',xp:15,get:P=>[P.totals.missCleared||0,1]},
  {id:'t-talk',group:'Practice',text:'Finish a role-play conversation',xp:10,get:P=>[talksDone(P),1]},
  {id:'t-talks',group:'Practice',text:'Finish all 4 conversations',xp:30,get:P=>[talksDone(P),4]},
  {id:'t-import',group:'Practice',text:'Have 25 words in My words',xp:15,get:P=>[(P.notebook||[]).length,25]},
];

// ---- Achievements: get(P) -> [current, target] ----
const sectionPassed=(P,si)=>UNITS.filter(u=>u.section===si&&(P.units[u.id]||0)>0).length;
const wordsMastered=P=>VOCAB.filter(w=>isMastered(P,w.ch)).length;
const ACHIEVEMENTS=[
  {id:'first',name:'First steps',desc:'Finish your first lesson',icon:'star',get:P=>[P.totals.lessons,1]},
  {id:'lessons50',name:'Dedicated',desc:'Finish 50 lessons',icon:'book',get:P=>[P.totals.lessons,50]},
  {id:'streak3',name:'Warming up',desc:'Reach a 3-day streak',icon:'flame',get:P=>[P.bestStreak,3]},
  {id:'streak7',name:'Week warrior',desc:'Reach a 7-day streak',icon:'flame',get:P=>[P.bestStreak,7]},
  {id:'streak30',name:'Unstoppable',desc:'Reach a 30-day streak',icon:'flame',get:P=>[P.bestStreak,30]},
  {id:'ears',name:'Good listener',desc:'Listen to Korean for 5 hours',icon:'headphones',get:P=>[listenedMin(P),300]},
  {id:'xp100',name:'Rising star',desc:'Earn 100 XP',icon:'zap',get:P=>[P.xp,100]},
  {id:'xp1000',name:'XP hunter',desc:'Earn 1,000 XP',icon:'zap',get:P=>[P.xp,1000]},
  {id:'xp5000',name:'Scholar',desc:'Earn 5,000 XP',icon:'zap',get:P=>[P.xp,5000]},
  {id:'perfect10',name:'Perfectionist',desc:'Finish 10 lessons without a mistake',icon:'target',get:P=>[P.totals.perfect,10]},
  {id:'challenge10',name:'Champion',desc:'Finish 10 Challenge steps',icon:'crown',get:P=>[P.totals.challenges,10]},
  {id:'quests20',name:'Quest hunter',desc:'Complete 20 daily quests',icon:'gift',get:P=>[P.totals.quests,20]},
  {id:'words50',name:'Word collector',desc:'Master 50 words',icon:'layers',get:P=>[wordsMastered(P),50]},
  {id:'words200',name:'Walking dictionary',desc:'Master 200 words',icon:'layers',get:P=>[wordsMastered(P),200]},
  {id:'memory',name:'Memory keeper',desc:'Finish 20 Smart reviews',icon:'repeat',get:P=>[P.totals.smart||0,20]},
  {id:'grammar6',name:'Grammar builder',desc:'Pass 6 grammar units',icon:'book',get:P=>[UNITS.filter(u=>u.kind==='grammar'&&unitPassed(P,u.id)).length,6]},
  {id:'test90',name:'Test ace',desc:'Score 90% or more on a practice test',icon:'award',get:P=>[Math.max(0,...(P.tests||[]).map(t=>Math.round(t.score/t.total*100))),90]},
  {id:'speaker',name:'Brave speaker',desc:'Record yourself 50 times',icon:'mic',get:P=>[P.totals.recordings||0,50]},
  {id:'talker',name:'Conversation partner',desc:'Finish all 4 role-play conversations',icon:'mic',get:P=>[talksDone(P),4]},
  {id:'drills200',name:'Drill master',desc:'Answer 200 Practice-page questions right',icon:'target',get:P=>[['num','verb','part','sound','read'].reduce((s,k)=>s+drillRight(P,k),0),200]},
  {id:'bookworm',name:'Bookworm',desc:'Read all 6 stories',icon:'book',get:P=>[storiesRead(P),6]},
  {id:'focus10',name:'Deep focus',desc:'Finish 10 focus timer sessions',icon:'clock',get:P=>[P.totals.focus||0,10]},
  ...SECTIONS.map((s,i)=>({id:'sec-'+s.id,name:i?`${s.title} graduate`:'Hangul hero',desc:`Pass every unit in ${s.title}`,icon:'award',
    get:P=>[sectionPassed(P,i),s.units.length]})),
];
