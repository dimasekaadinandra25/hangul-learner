// Shared by the app (index.html), lesson.js and tools/*.js
// Unicode Hangul syllable math: 0xAC00 + (initial*21 + vowel)*28 + final
const INIT=[...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const VOW=[...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'];
const FIN=['',...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];
const compose=(i,v,f=0)=>String.fromCharCode(0xAC00+(i*21+v)*28+f);
const decompose=ch=>{const c=ch.charCodeAt(0)-0xAC00;if(c<0||c>11171)return[ch];return[INIT[Math.floor(c/588)],VOW[Math.floor(c%588/28)],FIN[c%28]].filter(Boolean)};
console.assert(compose(18,0,4)==='한'&&decompose('글').join('')==='ㄱㅡㄹ','hangul math broken');

// Consonants are spoken with ㅏ (가), vowels with silent ㅇ (아)
const sample=ch=>INIT.includes(ch)?compose(INIT.indexOf(ch),0):compose(11,VOW.indexOf(ch));
const GROUPS=[
  ['Basic consonants','ㄱ g/k|ㄴ n|ㄷ d/t|ㄹ r/l|ㅁ m|ㅂ b/p|ㅅ s|ㅇ silent / ng|ㅈ j|ㅊ ch|ㅋ k|ㅌ t|ㅍ p|ㅎ h'],
  ['Basic vowels','ㅏ a|ㅑ ya|ㅓ eo|ㅕ yeo|ㅗ o|ㅛ yo|ㅜ u|ㅠ yu|ㅡ eu|ㅣ i'],
  ['Double consonants','ㄲ kk|ㄸ tt|ㅃ pp|ㅆ ss|ㅉ jj'],
  ['Compound vowels','ㅐ ae|ㅒ yae|ㅔ e|ㅖ ye|ㅘ wa|ㅙ wae|ㅚ oe|ㅝ wo|ㅞ we|ㅟ wi|ㅢ ui'],
].map(([title,s])=>[title,s.split('|').map(x=>{const[ch,...r]=x.split(' ');return{ch,rom:r.join(' '),say:sample(ch)}})]);
const ALL=GROUPS.flatMap(g=>g[1]);
const LETTER=Object.fromEntries(ALL.map(l=>[l.ch,l]));

const WORDS=[['안녕하세요','hello'],['감사합니다','thank you'],['한글','Hangul'],['한국','Korea'],['사랑','love'],['친구','friend'],['학교','school'],['엄마','mom'],['물','water'],['밥','rice / meal'],
  ['네','yes'],['아니요','no'],['커피','coffee'],['우유','milk'],['사과','apple'],['바나나','banana'],['고양이','cat'],['개','dog'],['집','house'],['책','book'],
  ['나무','tree'],['꽃','flower'],['해','sun'],['바다','sea'],['산','mountain'],['달','moon'],['별','star'],['돌','stone'],['풀','grass'],['강','river'],
  ['아빠','dad'],['토끼','rabbit'],['오리','duck'],['곰','bear'],['공','ball'],['우리','we / our'],['나','I / me'],['너','you (casual)'],['여기','here'],['저기','over there']];

// Practice syllables: 14 basic consonants x 5 simple vowels (가 거 고 구 기 ...)
const SYL_C=[...'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ'],SYL_V=[...'ㅏㅓㅗㅜㅣ'];
const SYLL=SYL_C.flatMap(c=>SYL_V.map(v=>{const ch=compose(INIT.indexOf(c),VOW.indexOf(v));return{ch,parts:[c,v],say:ch}}));

// Lesson path: sections of units. Unit ids are saved in progress files: never change or reuse one.
const TOPIK_DATA=typeof TOPIK!=='undefined'?TOPIK:require('./vocab.js').TOPIK; // vocab.js: global in the app, require() in node tools
const GRAMMAR_DATA=typeof GRAMMAR!=='undefined'?GRAMMAR:require('./grammar.js').GRAMMAR;
// A grammar item: ch = the pattern (its id), ex = [[Korean, English] x2], q = fill-in question; say = first example
const grammarItems=list=>list.map(([ch,meaning,note,ex,q])=>({ch,meaning,note,ex,q,say:ex[0][0]}));
const fillQ=q=>q[0].replace('___',q[2]); // the question sentence with the right answer filled in
const wordItems=pairs=>pairs.map(([w,m])=>({ch:w,meaning:m,say:w}));
const SECTIONS=[
  {id:'hangul',title:'Hangul basics',tag:'Start here',desc:'Letters, syllables and your first 40 words.',units:[
    ['vowels','Basic vowels','letter','ㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ'],
    ['cons1','Consonants 1','letter','ㄱㄴㄷㄹㅁㅂㅅ'],
    ['cons2','Consonants 2','letter','ㅇㅈㅊㅋㅌㅍㅎ'],
    ['double','Double consonants','letter','ㄲㄸㅃㅆㅉ'],
    ['compound','Compound vowels','letter','ㅐㅒㅔㅖㅘㅙㅚㅝㅞㅟㅢ'],
    ['syllables','Syllables','syllable',SYLL],
    ['words1','First words 1','word',WORDS.slice(0,10)],
    ['words2','First words 2','word',WORDS.slice(10,20)],
    ['words3','Nature','word',WORDS.slice(20,30)],
    ['words4','Animals & people','word',WORDS.slice(30)],
  ].map(([id,title,kind,items])=>({id,title,kind,items:kind==='letter'?[...items].map(c=>LETTER[c]):kind==='word'?wordItems(items):items}))},
  ...TOPIK_DATA.map(t=>({id:'topik'+t.level,title:'TOPIK '+t.level,tag:`${t.exam} · ${t.name}`,desc:t.desc,
    units:[...t.units.map(([title,list],i)=>({id:`t${t.level}-${i}`,title,kind:'word',items:wordItems(list.split('|').map(x=>x.split('=')))})),
      ...(GRAMMAR_DATA.find(g=>g.level===t.level)?.units||[]).map(([title,list],i)=>({id:`g${t.level}-${i}`,title,kind:'grammar',items:grammarItems(list)}))]})),
];
const UNITS=SECTIONS.flatMap((s,si)=>s.units.map(u=>({...u,section:si})));
const GRAMMAR_ITEMS=UNITS.filter(u=>u.kind==='grammar').flatMap(u=>u.items.map(g=>({...g,section:u.section,unit:u.title})));
const VOCAB=UNITS.filter(u=>u.kind==='word').flatMap(u=>u.items.map(w=>({...w,section:u.section,unit:u.title})));

// App words that appear in a Korean text (podcast / video titles and descriptions), in order of appearance.
// Korean attaches endings to words, so this is approximate: a word must start where a Korean word starts;
// one-syllable nouns also need a particle, space or punctuation after them (산 in 산에, not in 생산);
// verbs and adjectives match by their stem when it has 2+ syllables (공부하다: 공부하고, 공부해요).
const PARTICLE=/^(?:은|는|이|가|을|를|에|의|도|와|과|로|으로|에서|하고|만|까지|부터|보다|처럼|[\s.,!?·:;)\]"'”’…-]|$)/;
const isHangul=c=>!!c&&c>='가'&&c<='힣';
function findWords(text){
  if(!text||!/[가-힣]/.test(text))return[];
  const hits=[];
  for(const w of VOCAB){
    const verb=/[가-힣]다$/.test(w.ch)&&!w.ch.includes(' '),stem=verb?w.ch.slice(0,-1):w.ch,n=[...stem].length;
    if(verb&&n<2)continue;
    const keys=verb&&stem.endsWith('하')?[stem,stem.slice(0,-1)+'해',stem.slice(0,-1)+'했']:[stem];
    let best=-1;
    for(const key of keys)for(let at=text.indexOf(key);at>=0;at=text.indexOf(key,at+1)){
      if(isHangul(text[at-1]))continue;                                   // must start a word
      if(!verb&&n<2&&!PARTICLE.test(text.slice(at+key.length)))continue;  // short nouns need an ending
      if(best<0||at<best)best=at;break;
    }
    if(best>=0)hits.push([best,w]);
  }
  return hits.sort((a,b)=>a[0]-b[0]).map(h=>h[1]);
}

// Everything with a pre-recorded clip; file name = hex code points, e.g. 가 -> ac00.ogg (Opus)
const RECORDED=[...new Set([...ALL.map(l=>l.say),...SYLL.map(s=>s.say),...VOCAB.map(w=>w.say),...GRAMMAR_ITEMS.flatMap(g=>[...g.ex.map(e=>e[0]),fillQ(g.q)])])];
// Revised Romanization, enough for search: 학교 -> hakgyo, 한국어 -> hangugeo, 감사합니다 -> gamsahamnida.
// ponytail: links a final into a following ㅇ and nasalizes before ㄴ/ㅁ; other sound changes (ㄹ+ㄴ, ㅎ, tensing) are skipped.
const RR_I=['g','kk','n','d','tt','r','m','b','pp','s','ss','','j','jj','ch','k','t','p','h'];
const RR_V=['a','ae','ya','yae','eo','e','yeo','ye','o','wa','wae','oe','yo','u','wo','we','wi','yu','eu','ui','i'];
const RR_F=['','k','k','k','n','n','n','t','l','k','m','l','l','l','p','l','m','p','p','t','t','ng','t','t','k','t','p','t'];
const RR_LINK={1:'g',2:'kk',4:'n',7:'d',8:'r',16:'m',17:'b',19:'s',20:'ss',22:'j',23:'ch',24:'k',25:'t',26:'p',27:''}; // single finals that move into a following ㅇ
const RR_NASAL={k:'ng',t:'n',p:'m'};
function romanize(s){
  const code=ch=>{const c=ch?ch.charCodeAt(0)-0xAC00:-1;return c>=0&&c<=11171?c:-1};
  const a=[...s];let out='';
  a.forEach((ch,i)=>{
    const c=code(ch);if(c<0){out+=ch;return}
    const f=c%28,n=code(a[i+1]),ni=n<0?-1:Math.floor(n/588);
    out+=RR_I[Math.floor(c/588)]+RR_V[Math.floor(c%588/28)];
    if(!f)return;
    if(ni===11&&RR_LINK[f]!=null){out+=RR_LINK[f];return}
    out+=(ni===2||ni===6)&&RR_NASAL[RR_F[f]]||RR_F[f];
  });
  return out;
}
// Clip file name from its text; long sentences get a short hash instead (Windows file names stop at 255 characters).
const audioName=t=>{const n=[...t].map(c=>c.codePointAt(0).toString(16)).join('-');if(n.length<=200)return n+'.ogg';let h=0x811c9dc5;for(const c of t){h^=c.codePointAt(0);h=Math.imul(h,0x01000193)>>>0}return 'h-'+h.toString(16)+'-'+[...t].length+'.ogg'};

if(typeof module!=='undefined')module.exports={INIT,VOW,FIN,compose,decompose,ALL,LETTER,GROUPS,WORDS,SYL_C,SYL_V,SYLL,SECTIONS,UNITS,VOCAB,GRAMMAR_ITEMS,fillQ,RECORDED,audioName,findWords,romanize};
