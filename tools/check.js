// Sanity check for game logic: node tools/check.js
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const ui=f=>fs.readFileSync(path.join(__dirname,'..','ui',f),'utf8');
globalThis.assert=assert;
vm.runInThisContext(ui('vocab.js')+ui('grammar.js')+ui('data.js')+ui('lesson.js')+ui('hangul-ime.js')+ui('strokes.js')+ui('practice-data.js')+`
// numbers: sino / native readings, counters, 만 groups, month exceptions
assert.strictEqual(sino(15000),'만 오천');assert.strictEqual(sino(34500),'삼만 사천오백');assert.strictEqual(sino(120000),'십이만');assert.strictEqual(sino(2026),'이천이십육');assert.strictEqual(sino(10),'십');
assert.strictEqual(native(20,1),'스무');assert.strictEqual(native(21,1),'스물한');assert.strictEqual(native(4,0),'넷');assert.strictEqual(native(4,1),'네');
assert.strictEqual(NUM_TYPES.time.ko([3,15]),'세 시 십오 분');assert.strictEqual(NUM_TYPES.date.ko([6,6]),'유월 육일');assert.strictEqual(NUM_TYPES.date.ko([10,9]),'시월 구일');
for(const it of NUM_ITEMS){const T=NUM_TYPES[it.type],wrong=new Set([...T.slips(it.val),...T.near(it.val).map(T.ko)].filter(x=>x&&x!==it.ko));
  assert(wrong.size>=2,'number distractors '+it.ko);assert(!wrong.has(it.ko));assert(!new Set(T.near(it.val).map(T.show)).has(T.show(it.val))||wrong.size>=2)}
// verbs: regular, merging vowels, 하다, every irregular group
{const W={가다:['가요','갔어요','갑니다','갈 거예요'],먹다:['먹어요','먹었어요','먹습니다','먹을 거예요'],하다:['해요','했어요','합니다','할 거예요'],보다:['봐요','봤어요','봅니다','볼 거예요'],
  마시다:['마셔요','마셨어요','마십니다','마실 거예요'],걱정되다:['걱정돼요','걱정됐어요','걱정됩니다','걱정될 거예요'],바쁘다:['바빠요','바빴어요','바쁩니다','바쁠 거예요'],쉬다:['쉬어요','쉬었어요','쉽니다','쉴 거예요'],
  덥다:['더워요','더웠어요','덥습니다','더울 거예요'],돕다:['도와요','도왔어요','돕습니다','도울 거예요'],듣다:['들어요','들었어요','듣습니다','들을 거예요'],낫다:['나아요','나았어요','낫습니다','나을 거예요'],
  그렇다:['그래요','그랬어요','그렇습니다','그럴 거예요'],하얗다:['하얘요','하얬어요','하얗습니다','하얄 거예요'],모르다:['몰라요','몰랐어요','모릅니다','모를 거예요'],부르다:['불러요','불렀어요','부릅니다','부를 거예요'],
  알다:['알아요','알았어요','압니다','알 거예요'],좋다:['좋아요','좋았어요','좋습니다','좋을 거예요'],씻다:['씻어요','씻었어요','씻습니다','씻을 거예요'],받다:['받아요','받았어요','받습니다','받을 거예요']};
  for(const[v,f]of Object.entries(W))assert.deepStrictEqual(['present','past','formal','future'].map(x=>conj(v,x)),f,'conjugation '+v);}
assert(VERBS.length>=100,'verb pool');
for(const v of VERBS)for(const f of Object.keys(VERB_FORMS)){const r=conj(v.ch,f),w=verbWrongs(v.ch,f);assert(/^[가-힣 ]+$/.test(r),'form '+r);assert(!w.includes(r),'wrong answer equals the answer: '+r);
  assert(!w.some(x=>/[ㄱ-ㅎㅏ-ㅣ]/.test(x)),'loose jamo in '+w)}
for(const v of['보다','주다','되다','마시다','보내다'])assert(!verbWrongs(v,'present').includes(v.slice(0,-1)+(v==='보다'?'아요':'어요')),'valid unmerged form marked wrong: '+v);
// casual and honorific endings, particles, word-list import
{const W={가다:['가','가세요'],먹다:['먹어','드세요'],읽다:['읽어','읽으세요'],알다:['알아','아세요'],덥다:['더워','더우세요'],듣다:['들어','들으세요'],그렇다:['그래','그러세요'],모르다:['몰라','모르세요'],공부하다:['공부해','공부하세요'],자다:['자','주무세요'],좋다:['좋아','좋으세요']};
  for(const[v,f]of Object.entries(W))assert.deepStrictEqual([conj(v,'casual'),conj(v,'honor')],f,'casual/honorific '+v);}
assert(!formsFor('있다').includes('honor')&&formsFor('가다').includes('honor'));
for(const v of VERBS)for(const f of formsFor(v.ch)){const w=verbWrongs(v.ch,f);assert(!w.includes(conj(v.ch,f)),'wrong = right: '+v.ch+' '+f)}
assert(!verbWrongs('가다','honor').includes('가시어요'),'가시어요 is valid Korean');
assert.deepStrictEqual(Object.keys(PARTICLES).map(k=>withParticle('책',k)),['책은','책이','책을','책과','책으로']);
assert.deepStrictEqual(Object.keys(PARTICLES).map(k=>withParticle('커피',k)),['커피는','커피가','커피를','커피와','커피로']);
assert.strictEqual(withParticle('지하철','toward'),'지하철로','ㄹ takes 로');assert.strictEqual(wrongParticle('책','object'),'책를');
assert(NOUNS.length>=60&&NOUNS.every(n=>/^[가-힣]+$/.test(n.ch)&&!/^to /.test(n.meaning)),'noun pool');
assert.deepStrictEqual(parseWordList('#separator:tab\\n사과\\tapple\\n"<b>학교</b>","school, place"\\nbook,책\\n사과,again\\nnohangul,x\\n바나나;banana\\n\\n'),[['사과','apple'],['학교','school, place'],['책','book'],['바나나','banana']]);
for(const d of DIALOGUES){assert(d.lines.length>=6&&d.lines.every(([r,ko,en])=>/^[AB]$/.test(r)&&ko&&en&&RECORDED.includes(ko)),'dialogue '+d.id)}
for(const n of NOUNS)for(const k of Object.keys(PARTICLES))assert(RECORDED.includes(withParticle(n.ch,k)),'not recorded: '+withParticle(n.ch,k));
// sounds and stories: every example has a distinct answer, every story has its answers and recorded lines
for(const r of SOUNDS)for(const[w,p,m,bad]of r.ex)assert(w&&p&&m&&bad&&new Set([w,p,bad]).size===3,'sound example '+w);
for(const s of STORIES){assert(s.lines.length>=5&&s.qs.length===2&&s.qs.every(([q,o,a])=>q&&o.length===4&&o[a]),'story '+s.id);
  assert(storyWords(s).length>=5,'story words '+s.id);assert(!storyWords(s).some(w=>(s.skip||[]).includes(w.ch)));assert(storyGloss(s).every(([ko])=>!VOCAB.some(w=>w.ch===ko)))}
assert(!storyWords(STORIES[0]).some(w=>w.ch==='네'),'네 명 is not 네 (yes)');
for(const t of[...NUM_ITEMS.map(n=>n.ko),...STORIES.flatMap(s=>s.lines.map(l=>l[0])),conj('가다','past')])assert(RECORDED.includes(t),'not recorded: '+t);
// new tasks read the new progress fields
assert.deepStrictEqual(TASKS.find(t=>t.id==='t-numbers').get({...freshProgress(),drills:{num:{right:7,tries:9}}}),[7,20]);
assert.deepStrictEqual(TASKS.find(t=>t.id==='t-stories').get({...freshProgress(),stories:{family:{best:2},cafe:{best:1}}}),[1,14]);

// episode words: words start a Korean word; short nouns need an ending; verbs match by stem
{const f=t=>findWords(t).map(w=>w.ch);
  assert.deepStrictEqual(f('오늘은 학교에서 친구를 만났어요.'),['오늘','학교','친구']);
  assert(!f('생산 공장').includes('산'),'산 inside 생산');assert(f('주말에 산에 갔어요').includes('산'),'산에');
  assert(f('매일 한국어를 공부해요').includes('공부하다'),'verb by stem');
  assert.deepStrictEqual(f('Learn Korean with stories'),[]);assert.deepStrictEqual(f(''),[]);
}
// typing: every word, letter and syllable round-trips through its key presses; IME rules
for(const t of [...VOCAB.map(w=>w.ch),...SYLL.map(s=>s.ch),'안녕하세요','닭','앉아요','읽어요','괜찮아요','왜','뷁'])assert.strictEqual(composeJamo(keysFor(t)),t,'typing '+t);
assert.strictEqual(composeJamo(['ㄱ','ㅏ','ㄱ','ㅏ']),'가가','받침 moves to the next syllable');
assert.strictEqual(composeJamo(['ㄷ','ㅏ','ㄹ','ㄱ']),'닭','double 받침');
assert.strictEqual(composeJamo(['ㄷ','ㅏ','ㄹ','ㄱ','ㅣ']),'달기','double 받침 splits before a vowel');
assert.strictEqual(composeJamo(['ㅗ','ㅏ']),'ㅘ');assert.strictEqual(composeJamo(['ㄱ','ㄱ']),'ㄱㄱ');
assert(keysFor('왜').length===3&&keysFor('닭').length===4);
for(const j of new Set(keysFor(VOCAB.map(w=>w.ch).join('')).filter(j=>/[ㄱ-ㅣ]/.test(j))))assert(JAMO_KEY[j],'no key for '+j);
// stroke order: data for all 40 letters; tracing the template scores high, scribbles score low
for(const l of ALL){const s=STROKES[l.ch];assert(s&&s.length&&s.every(st=>st.length>=2&&st.every(p=>p[0]>=0&&p[0]<=100&&p[1]>=0&&p[1]<=100)),'strokes '+l.ch)}
for(const l of ALL)assert(strokeScore(STROKES[l.ch],STROKES[l.ch])>=98,'perfect trace '+l.ch);
assert(strokeScore(STROKES['ㄱ'],STROKES['ㄴ'])<50,'ㄴ is not ㄱ');
assert(strokeScore(STROKES['ㅏ'],STROKES['ㅏ'].map(s=>s.map(([x,y])=>[x+3,y-2])))>=90,'small offsets are fine');
assert.strictEqual(strokeScore(STROKES['ㅏ'],[]),0);
`+`
const keys=VOCAB.map(w=>w.ch); // a word may equal a practice syllable (코, 비); that's fine
assert.strictEqual(parseWordList('\\ufeff학교,school\\r\\n"책, 공책","book, notebook"\\r\\n').length,2,'exported CSV reads back');
// rest days: a missed yesterday is covered while the streak is alive; none left = streak breaks
{const t=new Date(2026,10,13,12),P={days:{'2026-11-10':10,'2026-11-11':10},freezes:1};assert.deepStrictEqual(useRestDays(P,t),['2026-11-12']);assert.strictEqual(P.freezes,0);assert.strictEqual(streak(activeDays(P),t),3);
  const Q={days:{'2026-11-10':10},freezes:0};assert.deepStrictEqual(useRestDays(Q,t),[]);const R={days:{},freezes:2};assert.deepStrictEqual(useRestDays(R,t),[],'no streak to save')}
// sync merge: both PCs studied since they last agreed
{const base={xp:100,days:{'2026-11-10':100},stats:{가:{heard:2,right:1,tries:2,written:0}},totals:{lessons:3},units:{t1:1},srs:{가:{u:'a',iv:1,ease:2.3,due:'2026-11-11'}},
    notebook:[{ch:'사과',meaning:'apple'},{ch:'책',meaning:'book'}],tasks:['t1'],badges:[],mistakes:{x:'u1',y:'u2'},log:{'2026-11-10':{lessons:3,claimed:['q1']}},section:1,tests:[],stories:{},drillMiss:{num:['a','b']},weekClaims:{},bestStreak:2};
  const a={...base,xp:150,days:{'2026-11-10':100,'2026-11-12':50},stats:{가:{heard:4,right:2,tries:3,written:0}},totals:{lessons:5},units:{t1:2},
    notebook:[{ch:'사과',meaning:'apple'},{ch:'책',meaning:'book'},{ch:'물',meaning:'water'}],tasks:['t1','t2'],mistakes:{x:'u1'},section:2,tests:[{at:5,score:1,total:2}],drillMiss:{num:['a','b','c']},bestStreak:3};
  const b={...base,xp:130,days:{'2026-11-10':100,'2026-11-12':10,'2026-11-13':20},stats:{가:{heard:3,right:1,tries:2,written:1},나:{heard:1,right:1,tries:1,written:0}},totals:{lessons:4,focus:1},
    srs:{가:{u:'a',iv:3,ease:2.4,due:'2026-11-15'}},notebook:[{ch:'사과',meaning:'apple'}],tasks:['t1','t3'],mistakes:{x:'u1',y:'u2',z:'u3'},log:{'2026-11-10':{lessons:3,claimed:['q1','q2']},'2026-11-13':{lessons:1,claimed:[]}},
    tests:[{at:7,score:2,total:2}],drillMiss:{num:['b']}};
  const m=mergeProgress(base,a,b,true);
  assert.strictEqual(m.xp,180);assert.deepStrictEqual(m.days,{'2026-11-10':100,'2026-11-12':60,'2026-11-13':20});
  assert.deepStrictEqual(m.stats,{가:{heard:5,right:2,tries:3,written:1},나:{heard:1,right:1,tries:1,written:0}});
  assert.deepStrictEqual(m.totals,{lessons:6,focus:1});assert.deepStrictEqual(m.units,{t1:2});
  assert.strictEqual(m.srs.가.due,'2026-11-15','only b reviewed it');assert.deepStrictEqual(m.notebook.map(w=>w.ch),['사과','물'],'책 removed on b, 물 added on a');
  assert.deepStrictEqual(m.tasks,['t1','t2','t3']);assert.deepStrictEqual(m.mistakes,{x:'u1',z:'u3'},'y fixed on a, z new on b');
  assert.deepStrictEqual(m.log['2026-11-10'],{lessons:3,claimed:['q1','q2']});assert.strictEqual(m.section,2,'newer copy');assert.deepStrictEqual(m.tests.map(t=>t.at),[5,7]);
  assert.deepStrictEqual(m.drillMiss.num,['b','c'],'a fixed on b, c new on a');assert.strictEqual(m.bestStreak,3);
  assert.deepStrictEqual(mergeProgress(base,base,base,true).xp,100,'nothing changed: nothing doubled');}
for(const h of HANJA)for(const w of h.words){assert(keys.includes(w),'hanja word not in vocabulary: '+w);assert(w.includes(h.ko),'hanja word lacks its root: '+w+' '+h.ko)}
assert.deepStrictEqual(familiesOf('학생').map(h=>h.han),['學','生']);
for(const[k,r]of[['학교','hakgyo'],['한국어','hangugeo'],['감사합니다','gamsahamnida'],['사랑해','saranghae'],['서울','seoul']])assert.strictEqual(romanize(k),r);
assert.strictEqual(new Set(keys).size,keys.length,'duplicate word across units');
assert.strictEqual(new Set(UNITS.map(u=>u.id)).size,UNITS.length,'duplicate unit id');
for(const w of VOCAB)assert(w.ch&&w.meaning&&!/[=|]/.test(w.ch+w.meaning),'bad vocab entry '+w.ch);

for(let round=0;round<100;round++)UNITS.forEach((u,i)=>STEPS.forEach((st,s)=>{
  const lesson=buildStep(i,s);
  assert(lesson.length>=8,u.id+' step '+s+' too short');
  if(s<PASS_STEP)assert(lesson.some(e=>e.type==='intro')&&!lesson.some(e=>e.type==='tiles'&&u.kind!=='syllable'),'learn steps teach first, no word tiles');
  for(const ex of lesson){
    assert(RECORDED.includes(ex.say),'no audio for '+ex.say);
    if(ex.play)assert(RECORDED.includes(ex.play),'no audio for '+ex.play);
    assert(ex.explain&&ex.prompt,'missing text');
    if(ex.type==='choice'){
      const vals=ex.options.map(o=>o.value),labels=ex.options.map(o=>o.label);
      assert.strictEqual(vals.length,4,u.id+' needs 4 options');
      assert(vals.includes(ex.answer));
      assert.strictEqual(new Set(labels).size,4,'duplicate labels '+labels);
    }else if(ex.type==='tiles'){
      assert.strictEqual(ex.parts.join(''),ex.answer);
      let rest=[...ex.tiles];
      for(const t of ex.parts){const k=rest.indexOf(t);assert(k>=0,'missing tile '+t);rest.splice(k,1)}
    }else assert.strictEqual(ex.type,'intro');
  }
}));
assert.strictEqual(buildReview({}).length,0);
// grammar: every pattern complete, questions have 4 different options, the filled sentence is recorded
for(const g of GRAMMAR_ITEMS){
  assert(g.ch&&g.meaning&&g.note&&g.ex.length===2&&g.ex.every(e=>e[0]&&e[1]),'grammar entry '+g.ch);
  assert(g.q[0].includes('___')&&g.q[1]&&new Set([g.q[2],...g.q[3]]).size===4,'grammar question '+g.ch);
  assert(RECORDED.includes(fillQ(g.q)),'no audio for '+fillQ(g.q));
}
assert.strictEqual(new Set(GRAMMAR_ITEMS.map(g=>g.ch)).size,GRAMMAR_ITEMS.length,'duplicate grammar pattern');
assert(SECTIONS.slice(1).every(s=>s.units.filter(u=>u.kind==='grammar').length===4),'4 grammar units per TOPIK level');

// smart review: first right answer -> tomorrow, then growing; early answers don't move it; wrong -> today
{const S={srs:{}},day='2026-11-10';
  learned(S,'사과','words2',day);assert.strictEqual(S.srs['사과'].due,'2026-11-11');
  assert.deepStrictEqual(dueKeys(S,day),[]);assert.deepStrictEqual(dueKeys(S,'2026-11-11'),['사과']);
  schedule(S,'사과','words2',true,'2026-11-11');assert.strictEqual(S.srs['사과'].iv,1);assert.strictEqual(S.srs['사과'].due,'2026-11-12');
  schedule(S,'사과','words2',true,'2026-11-11');assert.strictEqual(S.srs['사과'].due,'2026-11-12','early answers do not move it');
  schedule(S,'사과','words2',true,'2026-11-12');assert(S.srs['사과'].iv>=2,'interval grows');
  const ease=S.srs['사과'].ease;schedule(S,'사과','words2',false,'2026-11-13');assert.strictEqual(S.srs['사과'].due,'2026-11-13');assert(S.srs['사과'].ease<ease);
  assert.strictEqual(addDays('2026-12-31',1),'2027-01-01');
  S.notebook=[{ch:'고구마',meaning:'sweet potato'},{ch:'감자',meaning:'potato'}];schedule(S,'고구마','mine',false,day);
  S.srs['ㄱ']={u:'cons1',iv:0,ease:2.3,due:day};S.srs['없는말']={u:'cons1',iv:0,ease:2.3,due:day};
  const sm=buildSmart(S,day);assert.strictEqual(sm.length,2,'one question per due item, unknown items skipped');
  for(const ex of sm){assert(ex.smart);if(ex.type==='choice')assert.strictEqual(ex.options.length,4,'4 options for My words too')}
  assert.strictEqual(buildReview({'고구마':'mine'},S).length,2);
}
// practice test: 20 choice questions per level with all three areas (grammar from TOPIK 1 on)
for(let si=0;si<SECTIONS.length;si++)for(let r=0;r<20;r++){
  const t=buildTest(si);
  assert(t.length>=18&&t.every(e=>e.type==='choice'&&e.options.length===4),'test '+si);
  const areas=new Set(t.map(e=>e.area));
  assert(areas.has('vocab')&&areas.has('listening')&&(si===0||areas.has('grammar')),'test areas '+si+' '+[...areas]);
  assert(t.filter(e=>e.area==='listening').every(e=>e.skill==='listen'),'listening questions play audio');
}
assert.strictEqual(buildReview({'ㄱ':'cons1','gone':'cons1'}).length,2);

const d=s=>new Date(s+'T12:00:00');
assert.strictEqual(streak({},d('2026-11-10')),0);
assert.strictEqual(streak({'2026-11-09':10,'2026-11-08':5},d('2026-11-10')),2,'alive from yesterday');
assert.strictEqual(streak({'2026-11-10':10,'2026-11-09':10,'2026-11-07':10},d('2026-11-10')),2,'gap breaks streak');

for(let i=0;i<60;i++){
  const day=dayKey(new Date(2026,0,1+i)),q=dailyQuests(day);
  assert.strictEqual(new Set(q.map(x=>x.id)).size,4,'4 different quests');
  assert.strictEqual(q[0].metric,'xp');
  assert(q.slice(1).every(x=>x.metric!=='xp'),'only one XP quest');
  assert.deepStrictEqual(dailyQuests(day),q,'same quests all day');
}
// weeks start on Monday; weekly quests are stable for the whole week
assert.strictEqual(weekKey(d('2026-11-10')),'2026-11-09');
assert.strictEqual(weekKey(d('2026-11-15')),'2026-11-09','Sunday belongs to the week before');
assert.strictEqual(weekKey(d('2026-11-16')),'2026-11-16');
assert.deepStrictEqual(weekDays('2026-11-09'),['2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-14','2026-11-15']);
assert.strictEqual(new Set(weeklyQuests('2026-11-09').map(x=>x.id)).size,3);
assert.deepStrictEqual(weeklyQuests('2026-11-09'),weeklyQuests('2026-11-09'));

const P=freshProgress();
for(const a of ACHIEVEMENTS){const [c,t]=a.get(P);assert(Number.isFinite(c)&&t>0,a.id)}
for(const t of TASKS){const [c,n]=t.get(P);assert(Number.isFinite(c)&&n>0&&t.xp>0,t.id)}
assert.strictEqual(new Set([...QUESTS,...WEEKLY,...TASKS].map(x=>x.id)).size,QUESTS.length+WEEKLY.length+TASKS.length,'unique quest/task ids');
P.units={vowels:1};assert(stepDone(P,UNITS[0],0)&&stepDone(P,UNITS[0],PASS_STEP)&&!stepDone(P,UNITS[0],CHALLENGE_STEP),'old saves keep passed units');
assert.strictEqual(questProgress(P,QUESTS[0],'2026-11-10'),0);
// weekly sums: xp from P.days, minutes from logged seconds, "days" counts study days
P.days={'2026-11-09':40,'2026-11-11':20,'2026-11-20':99};
todayStats(P,'2026-11-09').seconds=1500;todayStats(P,'2026-11-10').seconds=2000;
assert.strictEqual(weekProgress(P,WEEKLY.find(q=>q.id==='w-xp300'),'2026-11-09'),60);
assert.strictEqual(weekProgress(P,WEEKLY.find(q=>q.id==='w-minutes60'),'2026-11-09'),58);
assert.strictEqual(weekProgress(P,WEEKLY.find(q=>q.id==='w-days5'),'2026-11-09'),2);
assert.strictEqual(weekProgress(P,WEEKLY.find(q=>q.id==='w-goal4'),'2026-11-09'),1);
assert.strictEqual(questProgress(P,QUESTS.find(q=>q.id==='minutes20'),'2026-11-10'),20,'capped at target');
console.log('all checks passed');
`);
