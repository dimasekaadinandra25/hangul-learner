// Practice page data: number reading, verb endings, sound-change rules, graded stories. Shared by the app and tools/*.js.
// Loaded after data.js. Every Korean answer here is added to RECORDED, so `npm run audio` records it.
const PD=typeof VOCAB!=='undefined'?{VOCAB,UNITS,VOW,FIN,RECORDED,findWords}:require('./data.js');

// ---------------- Numbers ----------------
// Sino-Korean (일 이 삼): money, minutes, dates, phone numbers. Native (하나 둘 셋): hours, age, counting things.
const SINO=['','일','이','삼','사','오','육','칠','팔','구'];
function sino(n){
  if(n===0)return'영';
  const four=x=>[[1000,'천'],[100,'백'],[10,'십']].map(([u,w])=>{const d=Math.floor(x/u)%10;return d?(d>1?SINO[d]:'')+w:''}).join('')+SINO[x%10];
  const man=Math.floor(n/10000),rest=n%10000; // a space after the 만 group: 만 오천
  return[man?(man>1?four(man):'')+'만':'',rest?four(rest):''].filter(Boolean).join(' ');
}
const N1=['','하나','둘','셋','넷','다섯','여섯','일곱','여덟','아홉'],N10=['','열','스물','서른','마흔','쉰','예순','일흔','여든','아흔'];
const C1=['','한','두','세','네','다섯','여섯','일곱','여덟','아홉']; // before a counter: 한 개, 두 명, 스무 살
const native=(n,counter)=>{const t=Math.floor(n/10),o=n%10;return counter&&t===2&&!o?'스무':N10[t]+(counter?C1:N1)[o]};
const month=m=>m===6?'유월':m===10?'시월':sino(m)+'월'; // 6 and 10 drop their final sound
const COUNTER_EN={'개':['thing','things'],'명':['person','people'],'잔':['cup','cups'],'권':['book','books'],'마리':['animal','animals']};
// ko: the right reading. near: other values (wrong answers). slips: typical mistakes, e.g. the wrong number system.
const NUM_TYPES={
  time:{label:'Time',q:'What time is it?',ko:([h,m])=>`${native(h,1)} 시${m?` ${sino(m)} 분`:''}`,show:([h,m])=>`${h}:${String(m).padStart(2,'0')}`,
    near:([h,m])=>[[h%12+1,m],[(h+6)%12+1,m],[h,(m+30)%60]],slips:([h,m])=>[`${sino(h)} 시${m?` ${sino(m)} 분`:''}`,m>0&&m<100?`${native(h,1)} 시 ${native(m,1)} 분`:null],
    note:'Hours use native numbers (한 시, 두 시); minutes use sino numbers (십오 분).'},
  price:{label:'Prices',q:'How much is it?',ko:n=>`${sino(n)} 원`,show:n=>n.toLocaleString('en-US')+'원',near:n=>[n*10,n%1000===0&&n>=10000?n/10:n+100,n+1000,n+500],slips:()=>[],
    note:'Money uses sino numbers. Korean counts in groups of 10,000 (만): 15,000 = 만 오천.'},
  age:{label:'Age',q:'How old?',ko:n=>`${native(n,1)} 살`,show:n=>`${n}살`,near:n=>[n+1,n+10,n>11?n-10:n+2],slips:n=>[`${sino(n)} 살`,native(n,0)!==native(n,1)?`${native(n,0)} 살`:null],
    note:'Age with 살 uses native numbers, shortened before the counter: 한 살, 스무 살.'},
  date:{label:'Dates',q:'What is the date?',ko:([m,d])=>`${month(m)} ${sino(d)}일`,show:([m,d])=>`${m}월 ${d}일`,near:([m,d])=>[[m%12+1,d],[m,d%28+1],d<=12&&d!==m?[d,m]:[m,(d+9)%28+1]],
    slips:([m,d])=>[m===6||m===10?`${sino(m)}월 ${sino(d)}일`:null],note:'Dates use sino numbers. June is 유월 and October is 시월, not 육월 / 십월.'},
  count:{label:'Counting',q:'How many?',ko:([n,c])=>`${native(n,1)} ${c}`,show:([n,c])=>`${n}${c} · ${n} ${COUNTER_EN[c][n===1?0:1]}`,near:([n,c])=>[[n+1,c],[n>1?n-1:n+2,c]],
    slips:([n,c])=>[`${sino(n)} ${c}`,native(n,0)!==native(n,1)?`${native(n,0)} ${c}`:null],note:'Counting things uses native numbers, shortened before the counter: 하나 → 한 개, 둘 → 두 명.'},
  number:{label:'Numbers',q:'Which number is it?',ko:n=>sino(n),show:n=>String(n),near:n=>[n+1,n+10,+[...String(n)].reverse().join('')===n?n+2:+[...String(n)].reverse().join(''),n*10],slips:()=>[],
    note:'Plain numbers, years and phone numbers use sino numbers.'},
};
const NUM_ITEMS=[
  ...[[1,0],[2,30],[3,15],[4,45],[5,20],[6,10],[7,50],[8,0],[9,30],[10,40],[11,5],[12,25]].map(v=>['time',v]),
  ...[1000,2500,3000,4500,7800,9900,12000,15000,25000,34500,50000,120000].map(v=>['price',v]),
  ...[3,7,10,15,18,20,21,25,30,34,42,58].map(v=>['age',v]),
  ...[[1,1],[3,1],[5,5],[6,6],[8,15],[10,3],[10,9],[12,25],[2,14],[4,20],[7,17],[11,11]].map(v=>['date',v]),
  ...[[1,'개'],[2,'명'],[3,'잔'],[4,'권'],[5,'개'],[8,'명'],[11,'개'],[20,'명'],[2,'잔'],[3,'권'],[1,'마리'],[2,'마리']].map(v=>['count',v]),
  ...[14,27,36,49,58,63,71,85,92,100,365,2026].map(v=>['number',v]),
].map(([type,val])=>({type,val,ko:NUM_TYPES[type].ko(val)}));

// ---------------- Verb endings ----------------
// Hangul syllable = 0xAC00 + (initial*21 + vowel)*28 + final
const SY=ch=>{const c=ch.charCodeAt(0)-0xAC00;return{i:Math.floor(c/588),v:Math.floor(c%588/28),f:c%28}};
const MK=({i,v,f=0})=>String.fromCharCode(0xAC00+(i*21+v)*28+f);
const Vi=k=>PD.VOW.indexOf(k),Fi=k=>PD.FIN.indexOf(k);
const bright=v=>[Vi('ㅏ'),Vi('ㅑ'),Vi('ㅗ')].includes(v); // ㅏ ㅗ take 아, the rest take 어
const addFinal=(s,f)=>s.slice(0,-1)+MK({...SY(s.at(-1)),f:Fi(f)});
// Irregular verbs (dictionary forms). Most ㅂ verbs are irregular; most ㄷ, ㅅ and ㅎ verbs are regular.
const IRREG={
  b:'덥다 춥다 가깝다 무겁다 가볍다 뜨겁다 무덥다 어렵다 쉽다 무섭다 외롭다 부끄럽다 귀엽다 굽다 싱겁다 맵다 돕다 곱다 즐겁다 반갑다 고맙다 아름답다 눕다 줍다 시끄럽다 더럽다 아깝다 차갑다 두껍다 밉다',
  d:'듣다 걷다 묻다 싣다 깨닫다',s:'낫다 짓다 붓다 긋다 잇다',h:'빨갛다 노랗다 파랗다 하얗다 까맣다 그렇다 이렇다 저렇다 어떻다',
};
const IRR_NOTE={
  b:'ㅂ irregular: ㅂ becomes 우 before a vowel (덥다 → 더워요, 돕다 → 도와요).',
  d:'ㄷ irregular: ㄷ becomes ㄹ before a vowel (듣다 → 들어요).',
  s:'ㅅ irregular: ㅅ drops before a vowel (낫다 → 나아요).',
  h:'ㅎ irregular: ㅎ drops and the vowel becomes ㅐ (그렇다 → 그래요).',
  reu:'르 irregular: 르 becomes ㄹ라 or ㄹ러 (모르다 → 몰라요, 부르다 → 불러요).',
};
function irrOf(verb){
  for(const k in IRREG)if(IRREG[k].split(' ').includes(verb))return k;
  const st=verb.slice(0,-1);
  return st.length>1&&st.endsWith('르')&&!['따르','치르','들르'].includes(st)?'reu':'';
}
// the 아/어 form (가, 먹어, 해, 더워, 몰라). irr=false treats every verb as regular (for wrong answers)
function aeo(verb,irr=true){
  const st=verb.slice(0,-1),head=st.slice(0,-1),L=SY(st.at(-1)),k=irr?irrOf(verb):'',vow=PD.VOW[L.v];
  const open=v=>head+MK({i:L.i,v});
  if(st.endsWith('하'))return head+'해';
  if(k==='b')return head+MK({...L,f:0})+(['돕','곱'].includes(st)?'와':'워');
  if(k==='d')return head+MK({...L,f:Fi('ㄹ')})+(bright(L.v)?'아':'어');
  if(k==='s')return head+MK({...L,f:0})+(bright(L.v)?'아':'어');
  if(k==='h')return open(vow==='ㅑ'?Vi('ㅒ'):Vi('ㅐ'));
  if(k==='reu'){const p=SY(head.at(-1));return head.slice(0,-1)+MK({...p,f:Fi('ㄹ')})+(bright(p.v)?'라':'러')}
  if(L.f)return st+(bright(L.v)?'아':'어');
  if('ㅏㅓㅐㅔㅕㅒㅖ'.includes(vow))return st;              // 가, 서, 보내
  if(vow==='ㅗ')return open(Vi('ㅘ'));                     // 보 → 봐
  if(vow==='ㅜ')return open(Vi('ㅝ'));                     // 주 → 줘
  if(vow==='ㅚ')return open(Vi('ㅙ'));                     // 되 → 돼
  if(vow==='ㅣ')return open(Vi('ㅕ'));                     // 마시 → 마셔
  if(vow==='ㅡ')return open(head&&bright(SY(head.at(-1)).v)?Vi('ㅏ'):Vi('ㅓ')); // 바쁘 → 바빠, 쓰 → 써
  return st+'어';                                          // 쉬 → 쉬어
}
const VERB_FORMS={
  present:{label:'Present',ask:'present, polite (-아요/어요)',note:'ㅏ or ㅗ in the last syllable takes 아요, other vowels take 어요, and 하다 becomes 해요. Vowels merge: 가 + 아요 = 가요, 보 + 아요 = 봐요.'},
  past:{label:'Past',ask:'past, polite (-았어요/었어요)',note:'Past = the 아/어 form + ㅆ어요: 가 → 갔어요, 먹어 → 먹었어요, 해 → 했어요.'},
  formal:{label:'Formal',ask:'formal (-습니다/ㅂ니다)',note:'No final consonant: add ㅂ니다. A final consonant: 습니다. A final ㄹ drops: 알다 → 압니다.'},
  future:{label:'Future',ask:'future (-(으)ㄹ 거예요)',note:'No final consonant: ㄹ 거예요. A final consonant: 을 거예요. A final ㄹ just adds 거예요: 살 거예요.'},
  casual:{label:'Casual',ask:'casual present (반말, -아/어)',note:'Casual speech (반말) is the polite form without 요: 가요 → 가, 먹어요 → 먹어, 해요 → 해. Use it with close friends and people younger than you.'},
  honor:{label:'Honorific',ask:'honorific polite (-(으)세요)',note:'-(으)세요 shows respect for the person who does the action, or asks politely. No final consonant: 세요 (가세요). A final consonant: 으세요 (읽으세요). A final ㄹ drops: 알다 → 아세요. 먹다 and 마시다 become 드세요, 자다 becomes 주무세요.'},
};
const HONOR_SPECIAL={'먹다':'드세요','마시다':'드세요','자다':'주무세요','말하다':'말씀하세요'};
const formsFor=verb=>Object.keys(VERB_FORMS).filter(f=>f!=='honor'||!/[있없]다$/.test(verb)); // 있으세요 / 계세요 depends on meaning: left out
function conj(verb,form,irr=true){
  const st=verb.slice(0,-1),head=st.slice(0,-1),L=SY(st.at(-1)),k=irr?irrOf(verb):'';
  if(form==='present')return aeo(verb,irr)+'요';
  if(form==='past')return addFinal(aeo(verb,irr),'ㅆ')+'어요';
  if(form==='formal')return!L.f?addFinal(st,'ㅂ')+'니다':L.f===Fi('ㄹ')?addFinal(st,'ㅂ')+'니다':st+'습니다';
  if(form==='casual')return aeo(verb,irr);
  if(form==='honor'){
    if(irr&&HONOR_SPECIAL[verb])return HONOR_SPECIAL[verb];
    if(k==='b')return head+MK({...L,f:0})+'우세요';
    if(k==='d')return head+MK({...L,f:Fi('ㄹ')})+'으세요';
    if(k==='s'||k==='h')return head+MK({...L,f:0})+(k==='s'?'으세요':'세요');
    return!L.f||L.f===Fi('ㄹ')?head+MK({...L,f:0})+'세요':st+'으세요';
  }
  // future
  if(k==='b')return head+MK({...L,f:0})+'울 거예요';
  if(k==='d')return head+MK({...L,f:Fi('ㄹ')})+'을 거예요';
  if(k==='s')return head+MK({...L,f:0})+'을 거예요';
  if(k==='h')return head+MK({...L,f:Fi('ㄹ')})+' 거예요';
  if(!L.f)return addFinal(st,'ㄹ')+' 거예요';
  return L.f===Fi('ㄹ')?st+' 거예요':st+'을 거예요';
}
// Wrong answers that learners actually make: no irregular change, the other vowel (아/어), no merging, the other ending.
function verbWrongs(verb,form){
  const st=verb.slice(0,-1),right=conj(verb,form),flip=s=>{const L=SY(s.at(-1)),m={ㅏ:'ㅓ',ㅓ:'ㅏ',ㅘ:'ㅝ',ㅝ:'ㅘ',ㅐ:'ㅔ',ㅕ:'ㅑ'}[PD.VOW[L.v]];return m?s.slice(0,-1)+MK({...L,v:Vi(m)}):null};
  const base=aeo(verb),c=[conj(verb,form,false)],L=SY(st.at(-1)),b=bright(L.v);
  // unmerged 보아요 / 주어요 / 되어요 are correct Korean, so only unmerged forms that are never right are used: 가아요, 쓰어요
  const unmerged=!L.f&&'ㅏㅓㅡㅕㅑ'.includes(PD.VOW[L.v])&&st.at(-1)!=='하';
  if(form==='present')c.push(st+(b?'어요':'아요'),flip(base)&&flip(base)+'요',unmerged&&st+(b?'아요':'어요'));
  if(form==='past')c.push(st+(b?'었어요':'았어요'),flip(base)&&addFinal(flip(base),'ㅆ')+'어요',unmerged&&st+(b?'았어요':'었어요'));
  if(form==='formal')c.push(SY(st.at(-1)).f?addFinal(st,'ㅂ')+'니다':st+'습니다',st.at(-1)!=='하'?aeo(verb)+'습니다':'하습니다');
  if(form==='future')c.push(SY(st.at(-1)).f?st+' 거예요':st+'을 거예요',st+'를 거예요',aeo(verb)+'ㄹ 거예요');
  if(form==='casual')c.push(aeo(verb)+'요',flip(base),conj(verb,'present',false).slice(0,-1));
  if(form==='honor')c.push(L.f?st+'세요':st+'으세요',L.f===Fi('ㄹ')?st+'으세요':null,HONOR_SPECIAL[verb]?st+(L.f?'으세요':'세요'):null,aeo(verb)+'요');
  return[...new Set(c.filter(x=>x&&x!==right&&!/[ㄱ-ㅎ]/.test(x)))];
}
// TOPIK 1-3 verbs and adjectives from the word list (not 이다 words or set phrases)
const UNIT_OF=Object.fromEntries(PD.UNITS.filter(u=>u.kind==='word').flatMap(u=>u.items.map(w=>[w.ch,u.id])));
const VERBS=PD.VOCAB.filter(w=>w.section>=1&&w.section<=3&&/[가-힣]다$/.test(w.ch)&&!w.ch.includes(' ')&&!/이다$/.test(w.ch)&&w.ch!=='바다');

// ---------------- Particles (조사): the form depends on whether the noun ends in a consonant ----------------
const PARTICLES={
  topic:{label:'은/는',name:'topic marker',forms:['은','는'],note:'은 after a final consonant (책은), 는 after a vowel (커피는). It marks what you are talking about.'},
  subject:{label:'이/가',name:'subject marker',forms:['이','가'],note:'이 after a final consonant (책이), 가 after a vowel (커피가). It marks who or what does something.'},
  object:{label:'을/를',name:'object marker',forms:['을','를'],note:'을 after a final consonant (책을), 를 after a vowel (커피를). It marks what the action is done to.'},
  and:{label:'과/와',name:'“and” between nouns',forms:['과','와'],note:'과 after a final consonant (책과), 와 after a vowel (커피와). It joins two nouns: A and B.'},
  toward:{label:'(으)로',name:'“to / by means of”',forms:['으로','로'],note:'으로 after a final consonant (집으로), 로 after a vowel or ㄹ (학교로, 지하철로). It shows direction or means.'},
};
const withParticle=(noun,k)=>{const f=SY(noun.at(-1)).f,[c,v]=PARTICLES[k].forms;return noun+(f&&!(k==='toward'&&f===Fi('ㄹ'))?c:v)};
const wrongParticle=(noun,k)=>{const right=withParticle(noun,k),[c,v]=PARTICLES[k].forms;return right===noun+c?noun+v:noun+c};
// everyday nouns from the TOPIK 1-3 noun units; every 3rd one gets recorded clips, so questions use those
const NOUN_UNITS=['words1','words2','words3','words4','t1-0','t1-2','t1-3','t1-6','t2-0','t2-1','t2-2','t2-3','t2-6','t2-7','t3-0','t3-2','t3-6'];
const NOUNS=PD.VOCAB.filter(w=>NOUN_UNITS.includes(UNIT_OF[w.ch])&&/^[가-힣]{1,4}$/.test(w.ch)&&!/다$|요$/.test(w.ch)&&!/^to /.test(w.meaning)&&!['네','아니요','우리','나','너','안녕하세요','감사합니다'].includes(w.ch)).filter((w,i)=>i%3===0);

// ---------------- Sound changes (발음 규칙) ----------------
// [spelling, how it is said, meaning, a common wrong reading]
const SOUNDS=[
  {id:'link',ko:'연음',name:'Linking',rule:'A final consonant moves into the next syllable when that syllable starts with a silent ㅇ.',
    ex:[['음악','으막','music','음막'],['한국어','한구거','Korean (language)','한국거'],['먹어요','머거요','I eat','머꺼요'],['읽어요','일거요','I read','이거요'],['옷이','오시','clothes (subject)','오지']]},
  {id:'nasal',ko:'비음화',name:'Nasal change',rule:'ㄱ, ㄷ and ㅂ sounds become ㅇ, ㄴ and ㅁ before ㄴ or ㅁ.',
    ex:[['합니다','함니다','I do (formal)','한니다'],['감사합니다','감사함니다','thank you','감사한니다'],['작년','장년','last year','잔년'],['국물','궁물','broth','군물'],['거짓말','거진말','lie','거짐말'],['앞니','암니','front tooth','안니']]},
  {id:'tense',ko:'경음화',name:'Tensing',rule:'After a ㄱ, ㄷ or ㅂ sound, the next ㄱ ㄷ ㅂ ㅅ ㅈ becomes tense: ㄲ ㄸ ㅃ ㅆ ㅉ.',
    ex:[['학교','학꾜','school','학쿄'],['식당','식땅','restaurant','신당'],['잡지','잡찌','magazine','잡치'],['학생','학쌩','student','항생'],['책상','책쌍','desk','챙상'],['국밥','국빱','rice soup','국팝']]},
  {id:'aspir',ko:'격음화',name:'Breathy ㅎ',rule:'ㄱ, ㄷ, ㅂ or ㅈ next to ㅎ merge into ㅋ, ㅌ, ㅍ or ㅊ.',
    ex:[['축하해요','추카해요','congratulations','추가해요'],['좋다','조타','good','조다'],['입학','이팍','starting school','이박'],['많다','만타','many','만다'],['백화점','배콰점','department store','배과점'],['놓고','노코','put and…','노고']]},
  {id:'liquid',ko:'유음화',name:'ㄴ next to ㄹ',rule:'ㄴ next to ㄹ, before or after it, is said as ㄹ: ㄴㄹ and ㄹㄴ both become ㄹㄹ.',
    ex:[['설날','설랄','Lunar New Year','선날'],['신라','실라','Silla (old kingdom)','신나'],['연락','열락','contact','연낙'],['편리','펼리','convenience','편니'],['한류','할류','Korean Wave','한뉴'],['일년','일련','one year','인년']]},
  {id:'palatal',ko:'구개음화',name:'ㄷ and ㅌ before 이',rule:'ㄷ or ㅌ before 이 is said as ㅈ or ㅊ.',
    ex:[['같이','가치','together','가티'],['굳이','구지','insistently','구디'],['해돋이','해도지','sunrise','해도디'],['끝이','끄치','the end (subject)','끄티'],['붙이다','부치다','to stick on','부티다']]},
  {id:'silenth',ko:'ㅎ 탈락',name:'Silent ㅎ',rule:'A final ㅎ before a vowel is not said at all.',
    ex:[['좋아요','조아요','it is good','조하요'],['놓아요','노아요','I put it down','노하요'],['많이','마니','a lot','만히'],['싫어요','시러요','I don’t like it','실허요'],['괜찮아요','괜차나요','it’s okay','괜차하요']]},
];

// ---------------- Reading: short graded stories ----------------
// lines: [Korean, English]. gloss: useful words beyond the app's word list. skip: word-list matches with another meaning here.
// qs: [question, options, index of the answer]
const STORIES=[
  {id:'family',level:1,title:'우리 가족',en:'My family',skip:['네'],
    lines:[['저는 민수예요.','I’m Minsu.'],['우리 가족은 네 명이에요.','There are four people in my family.'],['아버지는 회사원이고 어머니는 선생님이에요.','My father is an office worker and my mother is a teacher.'],
      ['누나는 대학생이에요.','My older sister is a university student.'],['우리는 주말에 같이 공원에 가요.','We go to the park together at the weekend.'],['저는 우리 가족을 정말 좋아해요.','I really love my family.']],
    gloss:[['회사원','office worker'],['누나','older sister (said by a man)'],['대학생','university student'],['같이','together'],['정말','really']],
    qs:[['How many people are in Minsu’s family?',['Three','Four','Five','Six'],1],['What does his mother do?',['She is a teacher','She is an office worker','She is a student','She is a doctor'],0]]},
  {id:'cafe',level:1,title:'카페에서',en:'At the café',
    lines:[['오늘은 토요일이에요.','Today is Saturday.'],['저는 친구하고 카페에 갔어요.','I went to a café with a friend.'],['저는 커피를 마시고 친구는 녹차를 마셨어요.','I drank coffee and my friend drank green tea.'],
      ['케이크도 먹었어요.','We ate cake too.'],['정말 맛있었어요.','It was really delicious.'],['커피는 사천오백 원이었어요.','The coffee was 4,500 won.'],['다음 주에 또 갈 거예요.','We’ll go again next week.']],
    gloss:[['녹차','green tea'],['케이크','cake'],['또','again'],['다음 주','next week'],['-하고','with (a person)']],
    qs:[['What did the friend drink?',['Coffee','Green tea','Juice','Milk'],1],['How much was the coffee?',['₩4,000','₩4,500','₩5,400','₩14,500'],1]]},
  {id:'rain',level:2,title:'비 오는 날',en:'A rainy day',
    lines:[['어제는 아침부터 비가 많이 왔어요.','Yesterday it rained a lot from the morning.'],['우산이 없어서 집에 있었어요.','I had no umbrella, so I stayed at home.'],['집에서 한국 드라마를 봤어요.','I watched a Korean drama at home.'],
      ['드라마가 재미있어서 다섯 시간 동안 봤어요.','The drama was fun, so I watched it for five hours.'],['저녁에는 라면을 끓여 먹었어요.','In the evening I cooked ramyeon and ate it.'],['오늘은 날씨가 맑아서 기분이 좋아요.','Today the weather is clear, so I feel good.']],
    gloss:[['우산','umbrella'],['드라마','drama (TV series)'],['동안','for (a length of time)'],['라면','instant noodles'],['기분','mood, feeling'],['-아서/어서','so, because']],
    qs:[['Why did the writer stay at home?',['They had no umbrella','They were sick','They had work','They were tired'],0],['How long did they watch the drama?',['Two hours','Three hours','Five hours','All day'],2]]},
  {id:'busan',level:2,title:'부산 여행',en:'A trip to Busan',
    lines:[['지난여름에 처음으로 부산에 갔어요.','Last summer I went to Busan for the first time.'],['서울에서 기차를 타고 세 시간쯤 걸렸어요.','By train from Seoul it took about three hours.'],['부산은 바다가 아름답고 음식이 맛있어요.','Busan has a beautiful sea and delicious food.'],
      ['해운대에서 수영을 하고 시장에서 생선을 먹었어요.','I swam at Haeundae and ate fish at the market.'],['사람이 많았지만 정말 즐거웠어요.','There were a lot of people, but it was really fun.'],['내년에 가족하고 다시 가고 싶어요.','Next year I want to go again with my family.']],
    gloss:[['지난여름','last summer'],['처음으로','for the first time'],['-쯤','about'],['걸리다','to take (time)'],['아름답다','to be beautiful'],['즐겁다','to be fun'],['다시','again']],
    qs:[['How did the writer travel to Busan?',['By bus','By train','By plane','By car'],1],['Who do they want to go with next year?',['Friends','Coworkers','Their family','Alone'],2]]},
  {id:'study',level:2,title:'한국어 공부',en:'Studying Korean',
    lines:[['저는 일 년 전부터 한국어를 공부하고 있어요.','I’ve been studying Korean since a year ago.'],['처음에는 한글도 몰랐어요.','At first I didn’t even know Hangul.'],['지금은 짧은 글을 읽을 수 있어요.','Now I can read short texts.'],
      ['매일 아침 지하철에서 한국어 팟캐스트를 들어요.','Every morning I listen to a Korean podcast on the subway.'],['듣기는 아직 어렵지만 재미있어요.','Listening is still hard, but it’s fun.'],['내년에 토픽 시험을 볼 거예요.','Next year I’ll take the TOPIK exam.']],
    gloss:[['전','ago, before'],['처음','the beginning'],['글','writing, a text'],['-ㄹ 수 있다','can'],['팟캐스트','podcast'],['아직','still, yet'],['시험을 보다','to take an exam']],
    qs:[['When does the writer listen to podcasts?',['At lunch','On the subway in the morning','Before bed','At the weekend'],1],['What is still hard for the writer?',['Reading','Writing','Listening','Hangul'],2]]},
  {id:'job',level:3,title:'새 직장',en:'A new job',
    lines:[['지난달부터 새 회사에서 일하기 시작했어요.','Last month I started working at a new company.'],['회사가 집에서 멀어서 아침 일찍 일어나야 해요.','The company is far from home, so I have to get up early.'],['처음에는 일이 익숙하지 않아서 힘들었어요.','At first the work was unfamiliar, so it was hard.'],
      ['하지만 동료들이 친절하게 도와줘서 많이 배웠어요.','But my coworkers helped me kindly, so I learned a lot.'],['요즘은 점심시간에 동료들과 같이 산책을 해요.','These days I go for a walk with my coworkers at lunchtime.'],['앞으로 더 열심히 노력할 거예요.','From now on I’ll try even harder.']],
    gloss:[['직장','workplace, job'],['지난달','last month'],['일찍','early'],['-아야/어야 하다','to have to'],['익숙하다','to be used to'],['힘들다','to be hard'],['동료','coworker'],['점심시간','lunchtime'],['앞으로','from now on']],
    qs:[['Why does the writer get up early?',['The company is far away','They like mornings','They exercise first','They start work at 7'],0],['What do they do at lunchtime these days?',['Study Korean','Go for a walk with coworkers','Sleep','Eat alone'],1]]},
];
// ---------------- Dialogues for role-play: [speaker A or B, Korean, English] ----------------
const DIALOGUES=[
  {id:'order',level:1,title:'카페에서 주문하기',en:'Ordering at a café',a:'Barista',b:'Customer',lines:[
    ['A','어서 오세요. 뭐 드릴까요?','Welcome. What can I get you?'],['B','아이스 아메리카노 한 잔 주세요.','One iced americano, please.'],
    ['A','사이즈는 어떻게 해 드릴까요?','What size would you like?'],['B','큰 사이즈로 주세요.','A large one, please.'],
    ['A','여기서 드세요, 가져가세요?','For here or to go?'],['B','가져갈게요. 얼마예요?','To go. How much is it?'],
    ['A','오천 원입니다.','That’s 5,000 won.'],['B','여기 있어요. 감사합니다.','Here you are. Thank you.']]},
  {id:'meet',level:1,title:'처음 만났을 때',en:'Meeting someone new',a:'Jisu',b:'You',lines:[
    ['A','안녕하세요. 저는 지수예요. 이름이 뭐예요?','Hello, I’m Jisu. What’s your name?'],['B','안녕하세요. 저는 마이클이에요.','Hello, I’m Michael.'],
    ['A','어느 나라 사람이에요?','Where are you from?'],['B','미국 사람이에요.','I’m American.'],
    ['A','한국에 언제 왔어요?','When did you come to Korea?'],['B','작년에 왔어요. 지금 한국어를 배우고 있어요.','Last year. I’m learning Korean now.'],
    ['A','한국어를 정말 잘하시네요!','Your Korean is really good!'],['B','아니에요. 아직 많이 부족해요.','Not at all. I still have a lot to learn.']]},
  {id:'way',level:2,title:'길 묻기',en:'Asking the way',a:'Traveller',b:'Local',lines:[
    ['A','실례합니다. 지하철역이 어디에 있어요?','Excuse me. Where is the subway station?'],['B','저기 은행 보이세요?','Do you see the bank over there?'],
    ['A','네, 보여요.','Yes, I see it.'],['B','은행 앞에서 오른쪽으로 가세요.','At the bank, turn right.'],
    ['A','여기서 멀어요?','Is it far from here?'],['B','아니요, 걸어서 오 분쯤 걸려요.','No, it’s about five minutes on foot.'],
    ['A','정말 감사합니다.','Thank you so much.'],['B','천만에요.','You’re welcome.']]},
  {id:'plans',level:2,title:'약속 잡기',en:'Making plans',a:'Friend',b:'You',lines:[
    ['A','이번 주말에 시간 있어요?','Are you free this weekend?'],['B','토요일은 바쁘고 일요일은 괜찮아요.','I’m busy on Saturday, but Sunday is fine.'],
    ['A','그럼 일요일에 같이 영화 볼까요?','Then shall we see a movie together on Sunday?'],['B','좋아요. 몇 시에 만날까요?','Sounds good. What time shall we meet?'],
    ['A','두 시 어때요?','How about two o’clock?'],['B','좋아요. 어디에서 만나요?','Good. Where shall we meet?'],
    ['A','극장 앞에서 만나요.','Let’s meet in front of the cinema.'],['B','네, 그때 봐요!','Okay, see you then!']]},
];

const storyText=s=>s.lines.map(l=>l[0]).join(' ');
// app words in a story (they open the word sheet), and the glossary words that are not app words
const storyWords=s=>PD.findWords(storyText(s)).filter(w=>!(s.skip||[]).includes(w.ch));
const storyGloss=s=>s.gloss.filter(([ko])=>!PD.VOCAB.some(w=>w.ch===ko));

// My words import (Words › My words): CSV / TSV / Anki plain-text export, one "Korean, meaning" per line.
// The file comes from outside the app: only plain text is kept (HTML tags dropped, lengths capped).
function parseWordList(text){
  const out=[],seen=new Set();
  for(let line of String(text).split(/\r?\n/).slice(0,5000)){
    line=line.trim();if(!line||line.startsWith('#'))continue;
    let cols=line.includes('\t')?line.split('\t'):line.split(/[,;](.*)/s);
    cols=cols.map(c=>c.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/^"|"$/g,'').replace(/""/g,'"').replace(/\s+/g,' ').trim()).filter(Boolean);
    if(cols.length<2)continue;
    const k=cols.findIndex(c=>/[가-힣]/.test(c));if(k<0)continue;
    const ko=cols[k].slice(0,40),en=(cols.find((c,i)=>i!==k&&!/[가-힣]/.test(c))||cols[k?0:1]).slice(0,80);
    if(!en||seen.has(ko))continue;seen.add(ko);out.push([ko,en]);
  }
  return out;
}

// Every answer and example gets a recorded clip.
for(const t of[...NUM_ITEMS.map(n=>n.ko),...VERBS.flatMap(v=>formsFor(v.ch).map(f=>conj(v.ch,f))),...NOUNS.flatMap(n=>Object.keys(PARTICLES).map(k=>withParticle(n.ch,k))),...DIALOGUES.flatMap(d=>d.lines.map(l=>l[1])),...SOUNDS.flatMap(s=>s.ex.map(e=>e[0])),...STORIES.flatMap(s=>s.lines.map(l=>l[0]))])
  if(!PD.RECORDED.includes(t))PD.RECORDED.push(t);

if(typeof module!=='undefined')module.exports={parseWordList,sino,native,month,NUM_TYPES,NUM_ITEMS,irrOf,aeo,conj,verbWrongs,VERB_FORMS,formsFor,VERBS,PARTICLES,withParticle,wrongParticle,NOUNS,DIALOGUES,IRR_NOTE,SOUNDS,STORIES,storyText,storyWords,storyGloss};
