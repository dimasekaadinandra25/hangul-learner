// Learning data built from the content files: Hangul letters, practice syllables, final consonants, the lesson path
// (SECTIONS / UNITS), the word and grammar lists, and the names of the pre-recorded audio clips.
// Shared by the app (index.html), lesson.js and the node tools (tools/*.js require() this file).
// Needs: TOPIK (content/vocab.js) and GRAMMAR (content/grammar.js), as globals in the app or via require() in node.
// Provides: INIT, VOW, FIN, compose, decompose, GROUPS, ALL, LETTER, WORDS, SYLL, FINALS, SECTIONS, UNITS, keyOf,
// VOCAB, GRAMMAR_ITEMS, fillQ, findWords, RECORDED, SLOW_CLIPS, MALE_CLIPS, romanize, audioName.

// Unicode Hangul syllable math: 0xAC00 + (initial*21 + vowel)*28 + final.
// So one initial consonant spans 21*28 = 588 code points, and there are 19*588 = 11172 syllables (가 to 힣).
const INIT = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const VOW = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'];
const FIN = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];

// Builds a syllable from the indexes of its initial, vowel and (optional) final.
const compose = (initial, vowel, final = 0) => String.fromCharCode(0xAC00 + (initial * 21 + vowel) * 28 + final);

// Splits a syllable into its letters (한 -> ㅎ ㅏ ㄴ); anything that is not a syllable comes back as [ch].
const decompose = ch => {
  const index = ch.charCodeAt(0) - 0xAC00;
  if (index < 0 || index > 11171) return [ch];
  const initial = INIT[Math.floor(index / 588)];
  const vowel = VOW[Math.floor(index % 588 / 28)];
  const final = FIN[index % 28];
  return [initial, vowel, final].filter(Boolean);
};
console.assert(compose(18, 0, 4) === '한' && decompose('글').join('') === 'ㄱㅡㄹ', 'hangul math broken');

// The syllable a letter is said with: consonants with ㅏ (가), vowels after a silent ㅇ (아).
const sample = ch => {
  if (INIT.includes(ch)) return compose(INIT.indexOf(ch), 0);
  return compose(11, VOW.indexOf(ch));
};

// Letter groups: [title, letters]. Each letter is written "letter romanization", separated by |.
const GROUPS = [
  ['Basic consonants', 'ㄱ g/k|ㄴ n|ㄷ d/t|ㄹ r/l|ㅁ m|ㅂ b/p|ㅅ s|ㅇ silent / ng|ㅈ j|ㅊ ch|ㅋ k|ㅌ t|ㅍ p|ㅎ h'],
  ['Basic vowels', 'ㅏ a|ㅑ ya|ㅓ eo|ㅕ yeo|ㅗ o|ㅛ yo|ㅜ u|ㅠ yu|ㅡ eu|ㅣ i'],
  ['Double consonants', 'ㄲ kk|ㄸ tt|ㅃ pp|ㅆ ss|ㅉ jj'],
  ['Compound vowels', 'ㅐ ae|ㅒ yae|ㅔ e|ㅖ ye|ㅘ wa|ㅙ wae|ㅚ oe|ㅝ wo|ㅞ we|ㅟ wi|ㅢ ui'],
].map(([title, letterList]) => {
  const letters = letterList.split('|').map(entry => {
    const [ch, ...romanParts] = entry.split(' ');
    return {ch, rom: romanParts.join(' '), say: sample(ch)};
  });
  return [title, letters];
});
const ALL = GROUPS.flatMap(group => group[1]);
const LETTER = Object.fromEntries(ALL.map(letter => [letter.ch, letter]));

// The first 40 words: [Korean, English]
const WORDS = [
  ['안녕하세요', 'hello'], ['감사합니다', 'thank you'], ['한글', 'Hangul'], ['한국', 'Korea'], ['사랑', 'love'],
  ['친구', 'friend'], ['학교', 'school'], ['엄마', 'mom'], ['물', 'water'], ['밥', 'rice / meal'],
  ['네', 'yes'], ['아니요', 'no'], ['커피', 'coffee'], ['우유', 'milk'], ['사과', 'apple'],
  ['바나나', 'banana'], ['고양이', 'cat'], ['개', 'dog'], ['집', 'house'], ['책', 'book'],
  ['나무', 'tree'], ['꽃', 'flower'], ['해', 'sun'], ['바다', 'sea'], ['산', 'mountain'],
  ['달', 'moon'], ['별', 'star'], ['돌', 'stone'], ['풀', 'grass'], ['강', 'river'],
  ['아빠', 'dad'], ['토끼', 'rabbit'], ['오리', 'duck'], ['곰', 'bear'], ['공', 'ball'],
  ['우리', 'we / our'], ['나', 'I / me'], ['너', 'you (casual)'], ['여기', 'here'], ['저기', 'over there'],
];

// Practice syllables: 14 basic consonants x 5 simple vowels (가 거 고 구 기 ...)
const SYL_C = [...'ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ'];
const SYL_V = [...'ㅏㅓㅗㅜㅣ'];

// Final consonants (받침): only 7 sounds are said at the end of a syllable (k n t l m p ng), so many spellings
// sound alike: 낮, 옷, 꽃 and 밭 all end in a "t" sound. [syllable, its parts, how it is said, note]
const FINALS = [
  ['각', 'ㄱㅏㄱ', '각', 'ㄱ at the end: a short k, the mouth stays closed'],
  ['밖', 'ㅂㅏㄲ', '박', 'ㄲ at the end sounds like ㄱ (k)'],
  ['간', 'ㄱㅏㄴ', '간', 'ㄴ at the end: n'],
  ['닫', 'ㄷㅏㄷ', '닫', 'ㄷ at the end: a short t'],
  ['옷', 'ㅇㅗㅅ', '옫', 'ㅅ at the end sounds like ㄷ (t)'],
  ['낮', 'ㄴㅏㅈ', '낟', 'ㅈ at the end sounds like ㄷ (t)'],
  ['꽃', 'ㄲㅗㅊ', '꼳', 'ㅊ at the end sounds like ㄷ (t)'],
  ['밭', 'ㅂㅏㅌ', '받', 'ㅌ at the end sounds like ㄷ (t)'],
  ['갈', 'ㄱㅏㄹ', '갈', 'ㄹ at the end: l'],
  ['감', 'ㄱㅏㅁ', '감', 'ㅁ at the end: m'],
  ['갑', 'ㄱㅏㅂ', '갑', 'ㅂ at the end: a short p'],
  ['앞', 'ㅇㅏㅍ', '압', 'ㅍ at the end sounds like ㅂ (p)'],
  ['강', 'ㄱㅏㅇ', '강', 'ㅇ at the end: ng (at the start it is silent)'],
].map(([ch, parts, sound, note]) => ({ch, parts: [...parts], sound, note, say: ch}));

const SYLL = SYL_C.flatMap(consonant => SYL_V.map(vowel => {
  const ch = compose(INIT.indexOf(consonant), VOW.indexOf(vowel));
  return {ch, parts: [consonant, vowel], say: ch};
}));

// Lesson path: sections of units. Unit ids are saved in progress files: never change or reuse one.
// vocab.js and grammar.js are globals in the app and are require()d in the node tools.
const TOPIK_DATA = typeof TOPIK !== 'undefined' ? TOPIK : require('../content/vocab.js').TOPIK;
const GRAMMAR_DATA = typeof GRAMMAR !== 'undefined' ? GRAMMAR : require('../content/grammar.js').GRAMMAR;

// A grammar item: ch = the pattern (its id), ex = [[Korean, English] x2], q = fill-in question; say = first example
const grammarItems = list => list.map(([ch, meaning, note, ex, q]) => ({ch, meaning, note, ex, q, say: ex[0][0]}));

// The question sentence with the right answer filled in
const fillQ = q => q[0].replace('___', q[2]);

const wordItems = pairs => pairs.map(([word, meaning]) => ({ch: word, meaning, say: word}));

// Items of a Hangul basics unit: letter units list their letters as one string, word units list [Korean, English]
// pairs, syllable and final units already hold their items.
const hangulUnitItems = (kind, items) => {
  if (kind === 'letter') return [...items].map(letter => LETTER[letter]);
  if (kind === 'word') return wordItems(items);
  return items;
};

// One TOPIK level: its word units (ids t<level>-<n>), then its grammar units (ids g<level>-<n>).
// Words in vocab.js are written "Korean=English|Korean=English|...".
const topikSection = topik => {
  const wordUnits = topik.units.map(([title, list], unitIndex) => ({
    id: `t${topik.level}-${unitIndex}`,
    title,
    kind: 'word',
    items: wordItems(list.split('|').map(entry => entry.split('='))),
  }));
  const grammarLevel = GRAMMAR_DATA.find(level => level.level === topik.level);
  const grammarUnits = (grammarLevel?.units || []).map(([title, list], unitIndex) => ({
    id: `g${topik.level}-${unitIndex}`,
    title,
    kind: 'grammar',
    items: grammarItems(list),
  }));
  return {
    id: 'topik' + topik.level,
    title: 'TOPIK ' + topik.level,
    tag: `${topik.exam} · ${topik.name}`,
    desc: topik.desc,
    units: [...wordUnits, ...grammarUnits],
  };
};

const SECTIONS = [
  {
    id: 'hangul',
    title: 'Hangul basics',
    tag: 'Start here',
    desc: 'Letters, syllables and your first 40 words.',
    units: [
      ['vowels', 'Basic vowels', 'letter', 'ㅏㅑㅓㅕㅗㅛㅜㅠㅡㅣ'],
      ['cons1', 'Consonants 1', 'letter', 'ㄱㄴㄷㄹㅁㅂㅅ'],
      ['cons2', 'Consonants 2', 'letter', 'ㅇㅈㅊㅋㅌㅍㅎ'],
      ['double', 'Double consonants', 'letter', 'ㄲㄸㅃㅆㅉ'],
      ['compound', 'Compound vowels', 'letter', 'ㅐㅒㅔㅖㅘㅙㅚㅝㅞㅟㅢ'],
      ['syllables', 'Syllables', 'syllable', SYLL],
      ['words1', 'First words 1', 'word', WORDS.slice(0, 10)],
      ['words2', 'First words 2', 'word', WORDS.slice(10, 20)],
      ['words3', 'Nature', 'word', WORDS.slice(20, 30)],
      ['words4', 'Animals & people', 'word', WORDS.slice(30)],
      ['finals', 'Final consonants (받침)', 'final', FINALS],
    ].map(([id, title, kind, items]) => ({id, title, kind, items: hangulUnitItems(kind, items)})),
  },
  ...TOPIK_DATA.map(topikSection),
];
const UNITS = SECTIONS.flatMap((section, sectionIndex) => section.units.map(unit => ({...unit, section: sectionIndex})));

// Item key (stats, Smart review, mistakes) = its text. A grammar pattern spelled like a word or syllable (보다 "than" vs
// 보다 "to see", 도 vs the syllable 도) gets "g:" in front, so the two don't share one schedule.
{
  const plainUnits = UNITS.filter(unit => unit.kind !== 'grammar');
  const plainKeys = new Set(plainUnits.flatMap(unit => unit.items.map(item => item.ch)));
  for (const unit of UNITS) {
    if (unit.kind !== 'grammar') continue;
    for (const pattern of unit.items) {
      if (plainKeys.has(pattern.ch)) pattern.key = 'g:' + pattern.ch;
    }
  }
}
const keyOf = item => item.key || item.ch;

const GRAMMAR_ITEMS = UNITS
  .filter(unit => unit.kind === 'grammar')
  .flatMap(unit => unit.items.map(pattern => ({...pattern, section: unit.section, unit: unit.title})));
const VOCAB = UNITS
  .filter(unit => unit.kind === 'word')
  .flatMap(unit => unit.items.map(word => ({...word, section: unit.section, unit: unit.title})));

// App words that appear in a Korean text (podcast / video titles and descriptions), in order of appearance.
// Korean attaches endings to words, so this is approximate: a word must start where a Korean word starts;
// one-syllable nouns also need a particle, space or punctuation after them (산 in 산에, not in 생산);
// verbs and adjectives match by their stem when it has 2+ syllables (공부하다: 공부하고, 공부해요).
const PARTICLE = /^(?:은|는|이|가|을|를|에|의|도|와|과|로|으로|에서|하고|만|까지|부터|보다|처럼|[\s.,!?·:;)\]"'”’…-]|$)/;
const isHangul = ch => !!ch && ch >= '가' && ch <= '힣';
function findWords(text) {
  if (!text || !/[가-힣]/.test(text)) return [];
  const hits = [];
  for (const word of VOCAB) {
    const isVerb = /[가-힣]다$/.test(word.ch) && !word.ch.includes(' ');
    const stem = isVerb ? word.ch.slice(0, -1) : word.ch;
    const stemLength = [...stem].length;
    if (isVerb && stemLength < 2) continue;
    // A 하다 verb also shows up as 해 / 했 (공부해요, 공부했어요)
    let searchKeys = [stem];
    if (isVerb && stem.endsWith('하')) {
      const root = stem.slice(0, -1);
      searchKeys = [stem, root + '해', root + '했'];
    }
    let firstAt = -1;
    for (const key of searchKeys) {
      for (let at = text.indexOf(key); at >= 0; at = text.indexOf(key, at + 1)) {
        if (isHangul(text[at - 1])) continue; // must start a word
        // short nouns need an ending
        if (!isVerb && stemLength < 2 && !PARTICLE.test(text.slice(at + key.length))) continue;
        if (firstAt < 0 || at < firstAt) firstAt = at;
        break;
      }
    }
    if (firstAt >= 0) hits.push([firstAt, word]);
  }
  return hits.sort((a, b) => a[0] - b[0]).map(hit => hit[1]);
}

// Everything with a pre-recorded clip; file name = hex code points, e.g. 가 -> ac00.ogg (Opus).
// Every possible Hangul syllable is recorded, including the 2350 everyday ones (KS X 1001, the set Korean keyboards
// and fonts always cover), so the syllable builder never falls back to a computer voice.
const ALL_SYLL = Array.from({length: 11172}, (_, index) => String.fromCharCode(0xAC00 + index)); // 가 to 힣
const RECORDED = [...new Set([
  ...ALL_SYLL,
  ...ALL.map(letter => letter.say),
  ...FINALS.map(final => final.say),
  ...SYLL.map(syllable => syllable.say),
  ...VOCAB.map(word => word.say),
  ...GRAMMAR_ITEMS.flatMap(pattern => [...pattern.ex.map(example => example[0]), fillQ(pattern.q)]),
])];
// Short items also have a slow recording (s-<file>), said slowly by the voice itself:
// clearer than stretching the normal clip
const SLOW_CLIPS = new Set([
  ...ALL.map(letter => letter.say),
  ...SYLL.map(syllable => syllable.say),
  ...FINALS.map(final => final.say),
  ...VOCAB.map(word => word.say),
]);
const MALE_CLIPS = SLOW_CLIPS; // the male voice (Settings › Sound) covers the same short items

// Revised Romanization, enough for search: 학교 -> hakgyo, 한국어 -> hangugeo, 감사합니다 -> gamsahamnida.
// ponytail: links a final into a following ㅇ and nasalizes before ㄴ/ㅁ; other sound changes (ㄹ+ㄴ, ㅎ, tensing) are skipped.
// RR_I / RR_V / RR_F: romanization of each initial, vowel and final, in the same order as INIT, VOW and FIN.
const RR_I = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const RR_V = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae',
  'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i',
];
const RR_F = [
  '', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l',
  'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't',
];
// Single finals that move into a following ㅇ, by final index (한국어: the ㄱ of 국 is said with 어 -> hangugeo)
const RR_LINK = {
  1: 'g', 2: 'kk', 4: 'n', 7: 'd', 8: 'r', 16: 'm', 17: 'b', 19: 's', 20: 'ss', 22: 'j', 23: 'ch', 24: 'k', 25: 't',
  26: 'p', 27: '',
};
const RR_NASAL = {k: 'ng', t: 'n', p: 'm'};
function romanize(text) {
  // Index 0..11171 of a Hangul syllable, -1 for anything else (or no character)
  const syllableIndex = ch => {
    const index = ch ? ch.charCodeAt(0) - 0xAC00 : -1;
    return index >= 0 && index <= 11171 ? index : -1;
  };
  const chars = [...text];
  let out = '';
  chars.forEach((ch, position) => {
    const index = syllableIndex(ch);
    if (index < 0) {
      out += ch;
      return;
    }
    const finalIndex = index % 28;
    const nextIndex = syllableIndex(chars[position + 1]);
    const nextInitial = nextIndex < 0 ? -1 : Math.floor(nextIndex / 588);
    out += RR_I[Math.floor(index / 588)] + RR_V[Math.floor(index % 588 / 28)];
    if (!finalIndex) return;
    // Initial 11 is a silent ㅇ: the final is said at the start of the next syllable
    if (nextInitial === 11 && RR_LINK[finalIndex] != null) {
      out += RR_LINK[finalIndex];
      return;
    }
    // Before ㄴ (2) or ㅁ (6), k / t / p turn into ng / n / m (감사합니다 -> gamsahamnida)
    const finalSound = RR_F[finalIndex];
    const beforeNasal = nextInitial === 2 || nextInitial === 6;
    if (beforeNasal && RR_NASAL[finalSound]) out += RR_NASAL[finalSound];
    else out += finalSound;
  });
  return out;
}

// Clip file name from its text: hex code points joined by "-" (학교 -> d559-ad50.ogg).
// Long sentences get a short hash instead (Windows file names stop at 255 characters): h-<FNV-1a hash>-<length>.ogg.
// Thousands of recorded clips are named by this: its output must never change.
const audioName = text => {
  const hexName = [...text].map(ch => ch.codePointAt(0).toString(16)).join('-');
  if (hexName.length <= 200) return hexName + '.ogg';
  let hash = 0x811c9dc5;
  for (const ch of text) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return 'h-' + hash.toString(16) + '-' + [...text].length + '.ogg';
};

if (typeof module !== 'undefined') {
  module.exports = {
    ALL_SYLL, MALE_CLIPS, SLOW_CLIPS, FINALS, keyOf, INIT, VOW, FIN, compose, decompose, ALL, LETTER, GROUPS, WORDS,
    SYL_C, SYL_V, SYLL, SECTIONS, UNITS, VOCAB, GRAMMAR_ITEMS, fillQ, RECORDED, audioName, findWords, romanize,
  };
}
