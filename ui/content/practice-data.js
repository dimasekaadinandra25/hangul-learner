// Practice page content and the Korean grammar helpers that go with it: number readings, verb endings,
// particles, sound-change rules, casual speech, graded stories, role-play dialogues and hanja word families.
// Shared by the app (ui/js/drills.js, ui/js/practice.js) and by the tools (tools/check.js, tools/gen-audio.js, e2e).
//
// Needs from data.js (loaded earlier): VOCAB, UNITS, VOW, FIN, RECORDED, findWords. In node, require()s data.js.
// Provides: sino, native, month, NUM_TYPES, NUM_ITEMS; irrOf, aeo, conj, verbWrongs, VERB_FORMS, formsFor, VERBS,
// IRR_NOTE; PARTICLES, withParticle, wrongParticle, NOUNS; SOUNDS; CASUAL; STORIES, storyText, storyWords, storyGloss;
// DIALOGUES; parseWordList; HANJA, familiesOf.
// On load, every Korean answer and example here is added to RECORDED, so `npm run audio` records it.

// What this file uses from data.js: the globals in the browser, the module in node
const PD = typeof VOCAB !== 'undefined' ? {VOCAB, UNITS, VOW, FIN, RECORDED, findWords} : require('../js/data.js');

// ---------------- Numbers ----------------
// Sino-Korean (일 이 삼): money, minutes, dates, phone numbers. Native (하나 둘 셋): hours, age, counting things.
const SINO = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];

// Reads a number in sino-Korean. Korean groups digits by 10,000 (만), with a space after the 만 group:
// 15,000 = 만 오천. A digit 1 is not said before a place: 십 (not 일십), 백, 천, 만.
function sino(n) {
  if (n === 0) return '영';
  const readBelowTenThousand = value => {
    let reading = '';
    for (const [place, placeName] of [[1000, '천'], [100, '백'], [10, '십']]) {
      const digit = Math.floor(value / place) % 10;
      if (!digit) continue;
      reading += (digit > 1 ? SINO[digit] : '') + placeName;
    }
    return reading + SINO[value % 10];
  };
  const tenThousands = Math.floor(n / 10000);
  const rest = n % 10000;
  const groups = [];
  if (tenThousands) groups.push((tenThousands > 1 ? readBelowTenThousand(tenThousands) : '') + '만');
  if (rest) groups.push(readBelowTenThousand(rest));
  return groups.join(' ');
}

const NATIVE_ONES = ['', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉'];
const NATIVE_TENS = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔'];
// before a counter, 1 to 4 are shortened: 한 개, 두 명, 세 잔, 네 권
const NATIVE_COUNTER_ONES = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉'];

// Reads 1 to 99 in native Korean. With a counter (counter = 1) the short forms are used: 한 살, 스무 살, 스물한 살.
const native = (n, counter) => {
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  if (counter && tens === 2 && !ones) return '스무';
  const onesWords = counter ? NATIVE_COUNTER_ONES : NATIVE_ONES;
  return NATIVE_TENS[tens] + onesWords[ones];
};

// Months are sino numbers + 월, but 6 and 10 drop their final sound: 유월 (not 육월), 시월 (not 십월)
const month = m => {
  if (m === 6) return '유월';
  if (m === 10) return '시월';
  return sino(m) + '월';
};

const COUNTER_EN = {'개': ['thing', 'things'], '명': ['person', 'people'], '잔': ['cup', 'cups'], '권': ['book', 'books'],
  '마리': ['animal', 'animals']};

// " 십오 분" after the hour, or nothing on the hour (세 시)
const numMinutesReading = minutes => (minutes ? ` ${sino(minutes)} 분` : '');

// Without a counter, numbers ending in 1 to 4 (and 20) have a longer native form that learners wrongly use before
// a counter (하나 개 for 한 개, 스물 살 for 스무 살): that wrong answer, or null when both forms are the same (다섯)
const numLongNativeSlip = (n, counterWord) => (native(n, 0) !== native(n, 1) ? `${native(n, 0)} ${counterWord}` : null);

// 2026 → 6202: a wrong answer for "which number is it?"
const numReversedDigits = n => +[...String(n)].reverse().join('');

// One entry per kind of number question.
// ko: the right reading. show: how the value is written. near: other values (their readings are wrong answers).
// slips: typical mistakes, e.g. the wrong number system. note: the rule, shown after an answer.
const NUM_TYPES = {
  time: {
    label: 'Time',
    q: 'What time is it?',
    ko: ([h, m]) => `${native(h, 1)} 시${numMinutesReading(m)}`,
    show: ([h, m]) => `${h}:${String(m).padStart(2, '0')}`,
    near: ([h, m]) => [[h % 12 + 1, m], [(h + 6) % 12 + 1, m], [h, (m + 30) % 60]],
    slips: ([h, m]) => [
      `${sino(h)} 시${numMinutesReading(m)}`,
      m > 0 && m < 100 ? `${native(h, 1)} 시 ${native(m, 1)} 분` : null,
    ],
    note: 'Hours use native numbers (한 시, 두 시); minutes use sino numbers (십오 분).',
  },
  price: {
    label: 'Prices',
    q: 'How much is it?',
    ko: n => `${sino(n)} 원`,
    show: n => n.toLocaleString('en-US') + '원',
    near: n => [n * 10, n % 1000 === 0 && n >= 10000 ? n / 10 : n + 100, n + 1000, n + 500],
    slips: () => [],
    note: 'Money uses sino numbers. Korean counts in groups of 10,000 (만): 15,000 = 만 오천.',
  },
  age: {
    label: 'Age',
    q: 'How old?',
    ko: n => `${native(n, 1)} 살`,
    show: n => `${n}살`,
    near: n => [n + 1, n + 10, n > 11 ? n - 10 : n + 2],
    slips: n => [`${sino(n)} 살`, numLongNativeSlip(n, '살')],
    note: 'Age with 살 uses native numbers, shortened before the counter: 한 살, 스무 살.',
  },
  date: {
    label: 'Dates',
    q: 'What is the date?',
    ko: ([m, d]) => `${month(m)} ${sino(d)}일`,
    show: ([m, d]) => `${m}월 ${d}일`,
    // the third one swaps day and month when that is still a valid, different date
    near: ([m, d]) => [[m % 12 + 1, d], [m, d % 28 + 1], d <= 12 && d !== m ? [d, m] : [m, (d + 9) % 28 + 1]],
    slips: ([m, d]) => [m === 6 || m === 10 ? `${sino(m)}월 ${sino(d)}일` : null],
    note: 'Dates use sino numbers. June is 유월 and October is 시월, not 육월 / 십월.',
  },
  count: {
    label: 'Counting',
    q: 'How many?',
    ko: ([n, c]) => `${native(n, 1)} ${c}`,
    show: ([n, c]) => `${n}${c} · ${n} ${COUNTER_EN[c][n === 1 ? 0 : 1]}`,
    near: ([n, c]) => [[n + 1, c], [n > 1 ? n - 1 : n + 2, c]],
    slips: ([n, c]) => [`${sino(n)} ${c}`, numLongNativeSlip(n, c)],
    note: 'Counting things uses native numbers, shortened before the counter: 하나 → 한 개, 둘 → 두 명.',
  },
  number: {
    label: 'Numbers',
    q: 'Which number is it?',
    ko: n => sino(n),
    show: n => String(n),
    // a palindrome (e.g. 44) reversed is itself, so it gets n + 2 instead
    near: n => [n + 1, n + 10, numReversedDigits(n) === n ? n + 2 : numReversedDigits(n), n * 10],
    slips: () => [],
    note: 'Plain numbers, years and phone numbers use sino numbers.',
  },
};

// The number questions: [type, value], with the right reading added as ko
const NUM_ITEMS = [
  ...[[1, 0], [2, 30], [3, 15], [4, 45], [5, 20], [6, 10], [7, 50], [8, 0], [9, 30], [10, 40], [11, 5], [12, 25]]
    .map(v => ['time', v]),
  ...[1000, 2500, 3000, 4500, 7800, 9900, 12000, 15000, 25000, 34500, 50000, 120000].map(v => ['price', v]),
  ...[3, 7, 10, 15, 18, 20, 21, 25, 30, 34, 42, 58].map(v => ['age', v]),
  ...[[1, 1], [3, 1], [5, 5], [6, 6], [8, 15], [10, 3], [10, 9], [12, 25], [2, 14], [4, 20], [7, 17], [11, 11]]
    .map(v => ['date', v]),
  ...[[1, '개'], [2, '명'], [3, '잔'], [4, '권'], [5, '개'], [8, '명'], [11, '개'], [20, '명'], [2, '잔'], [3, '권'],
    [1, '마리'], [2, '마리']].map(v => ['count', v]),
  ...[14, 27, 36, 49, 58, 63, 71, 85, 92, 100, 365, 2026].map(v => ['number', v]),
].map(([type, val]) => ({type, val, ko: NUM_TYPES[type].ko(val)}));

// ---------------- Verb endings ----------------
// A Hangul syllable's code is 0xAC00 + (initial * 21 + vowel) * 28 + final, where each part is an index into the
// jamo lists of data.js (VOW for vowels, FIN for finals, 0 = no final). These convert between a syllable and its parts.
const syllableJamo = syllable => {
  const offset = syllable.charCodeAt(0) - 0xAC00;
  return {initial: Math.floor(offset / 588), vowel: Math.floor(offset % 588 / 28), final: offset % 28};
};
const syllableFromJamo = ({initial, vowel, final = 0}) =>
  String.fromCharCode(0xAC00 + (initial * 21 + vowel) * 28 + final);
const vowelJamoIndex = jamo => PD.VOW.indexOf(jamo);
const finalJamoIndex = jamo => PD.FIN.indexOf(jamo);

// "Bright" vowels ㅏ ㅑ ㅗ take 아 (가 → 가요, 좋 → 좋아요); every other vowel takes 어 (먹 → 먹어요)
const isBrightVowel = vowel => [vowelJamoIndex('ㅏ'), vowelJamoIndex('ㅑ'), vowelJamoIndex('ㅗ')].includes(vowel);

// Puts a final consonant under the last syllable of a word, replacing any final it had: 가 + ㅆ = 갔, 알 + ㅂ = 압
const addFinal = (word, finalJamo) => {
  const last = syllableJamo(word.at(-1));
  return word.slice(0, -1) + syllableFromJamo({...last, final: finalJamoIndex(finalJamo)});
};

// The word with the final consonant of its last syllable removed: 덥 → 더, 낫 → 나
const stemWithoutFinal = word => word.slice(0, -1) + syllableFromJamo({...syllableJamo(word.at(-1)), final: 0});

// The word with the vowel of its last syllable replaced (and no final): 보 + ㅘ = 봐, 그렇 + ㅐ = 그래
const stemWithLastVowel = (word, vowelJamo) => {
  const last = syllableJamo(word.at(-1));
  return word.slice(0, -1) + syllableFromJamo({initial: last.initial, vowel: vowelJamoIndex(vowelJamo)});
};

// Irregular verbs (dictionary forms). Most ㅂ verbs are irregular; most ㄷ, ㅅ and ㅎ verbs are regular.
const IRREG = {
  b: '덥다 춥다 가깝다 무겁다 가볍다 뜨겁다 무덥다 어렵다 쉽다 무섭다 외롭다 부끄럽다 귀엽다 굽다 싱겁다 맵다 돕다 곱다 즐겁다 반갑다 고맙다 아름답다 눕다 줍다 시끄럽다 더럽다 아깝다 차갑다 두껍다 밉다',
  d: '듣다 걷다 묻다 싣다 깨닫다',
  s: '낫다 짓다 붓다 긋다 잇다',
  h: '빨갛다 노랗다 파랗다 하얗다 까맣다 그렇다 이렇다 저렇다 어떻다',
};
// the ㅂ verbs that keep their ㅂ (입어요, also 갈아입어요)
const REGULAR_B = '입다 좁다 뽑다 잡다 씹다 업다 접다 집다 꼽다 수줍다';
const IRR_NOTE = {
  b: 'ㅂ irregular: ㅂ becomes 우 before a vowel (덥다 → 더워요, 돕다 → 도와요).',
  d: 'ㄷ irregular: ㄷ becomes ㄹ before a vowel (듣다 → 들어요).',
  s: 'ㅅ irregular: ㅅ drops before a vowel (낫다 → 나아요).',
  h: 'ㅎ irregular: ㅎ drops and the vowel becomes ㅐ (그렇다 → 그래요).',
  reu: '르 irregular: 르 becomes ㄹ라 or ㄹ러 (모르다 → 몰라요, 부르다 → 불러요).',
};

// Which irregular group a verb belongs to: 'b', 'd', 's', 'h', 'reu', or '' for a regular verb
function irrOf(verb) {
  for (const group in IRREG) {
    if (IRREG[group].split(' ').includes(verb)) return group;
  }
  const stem = verb.slice(0, -1);
  // 새롭다, 어둡다, -스럽다: ㅂ verbs that are not listed are irregular too, unless they end in a regular one (갈아입다)
  const endsInB = syllableJamo(stem.at(-1)).final === finalJamoIndex('ㅂ');
  if (endsInB && !REGULAR_B.split(' ').some(regular => verb.endsWith(regular))) return 'b';
  // 따르다, 치르다 and 들르다 only drop their ㅡ (따라요): they are not 르 irregular
  const regularReuStems = ['따르', '치르', '들르'];
  if (stem.length > 1 && stem.endsWith('르') && !regularReuStems.includes(stem)) return 'reu';
  return '';
}

// The 아/어 form of a verb (가, 먹어, 해, 더워, 몰라), the base of the present, past and casual forms.
// irr = false treats every verb as regular (for wrong answers).
function aeo(verb, irr = true) {
  const stem = verb.slice(0, -1);
  if (stem.endsWith('하')) return stem.slice(0, -1) + '해';
  const group = irr ? irrOf(verb) : '';
  if (group) return aeoIrregularStem(stem, group);
  return aeoRegularStem(stem);
}

// The 아/어 form of an irregular stem (see IRR_NOTE)
function aeoIrregularStem(stem, group) {
  const lastVowel = syllableJamo(stem.at(-1)).vowel;
  const aOrEo = isBrightVowel(lastVowel) ? '아' : '어';
  if (group === 'b') return stemWithoutFinal(stem) + (['돕', '곱'].includes(stem) ? '와' : '워'); // 더워, but 도와
  if (group === 'd') return addFinal(stem, 'ㄹ') + aOrEo;                                      // 듣 → 들어
  if (group === 's') return stemWithoutFinal(stem) + aOrEo;                                    // 낫 → 나아
  if (group === 'h') return stemWithLastVowel(stem, PD.VOW[lastVowel] === 'ㅑ' ? 'ㅒ' : 'ㅐ');   // 그래, 하얘
  // 르: the syllable before 르 takes a ㄹ, and 르 becomes 라 or 러 (모르 → 몰라, 부르 → 불러)
  const head = stem.slice(0, -1);
  const beforeReu = syllableJamo(head.at(-1));
  return addFinal(head, 'ㄹ') + (isBrightVowel(beforeReu.vowel) ? '라' : '러');
}

// Vowels that merge with 아/어 when the stem has no final consonant
const AEO_VOWEL_MERGES = {'ㅗ': 'ㅘ', 'ㅜ': 'ㅝ', 'ㅚ': 'ㅙ', 'ㅣ': 'ㅕ'}; // 보 → 봐, 주 → 줘, 되 → 돼, 마시 → 마셔

// The 아/어 form of a regular stem
function aeoRegularStem(stem) {
  const last = syllableJamo(stem.at(-1));
  const vowel = PD.VOW[last.vowel];
  if (last.final) return stem + (isBrightVowel(last.vowel) ? '아' : '어');  // 먹어, 좋아
  if ('ㅏㅓㅐㅔㅕㅒㅖ'.includes(vowel)) return stem;                       // 가, 서, 보내: 아/어 is absorbed
  if (AEO_VOWEL_MERGES[vowel]) return stemWithLastVowel(stem, AEO_VOWEL_MERGES[vowel]);
  if (vowel === 'ㅡ') {
    // ㅡ drops and the syllable before decides 아 or 어: 바쁘 → 바빠, 쓰 → 써
    const head = stem.slice(0, -1);
    const afterBright = head && isBrightVowel(syllableJamo(head.at(-1)).vowel);
    return stemWithLastVowel(stem, afterBright ? 'ㅏ' : 'ㅓ');
  }
  return stem + '어';                                                       // 쉬 → 쉬어
}

const VERB_FORMS = {
  present: {
    label: 'Present', ask: 'present, polite (-아요/어요)',
    note: 'ㅏ or ㅗ in the last syllable takes 아요, other vowels take 어요, and 하다 becomes 해요. Vowels merge: 가 + 아요 = 가요, 보 + 아요 = 봐요.',
  },
  past: {
    label: 'Past', ask: 'past, polite (-았어요/었어요)', note: 'Past = the 아/어 form + ㅆ어요: 가 → 갔어요, 먹어 → 먹었어요, 해 → 했어요.',
  },
  formal: {
    label: 'Formal', ask: 'formal (-습니다/ㅂ니다)',
    note: 'No final consonant: add ㅂ니다. A final consonant: 습니다. A final ㄹ drops: 알다 → 압니다.',
  },
  future: {
    label: 'Future', ask: 'future (-(으)ㄹ 거예요)',
    note: 'No final consonant: ㄹ 거예요. A final consonant: 을 거예요. A final ㄹ just adds 거예요: 살 거예요.',
  },
  casual: {
    label: 'Casual', ask: 'casual present (반말, -아/어)',
    note: 'Casual speech (반말) is the polite form without 요: 가요 → 가, 먹어요 → 먹어, 해요 → 해. Use it with close friends and people younger than you.',
  },
  honor: {
    label: 'Honorific', ask: 'honorific polite (-(으)세요)',
    note: '-(으)세요 shows respect for the person who does the action, or asks politely. No final consonant: 세요 (가세요). A final consonant: 으세요 (읽으세요). A final ㄹ drops: 알다 → 아세요. 먹다 and 마시다 become 드세요, 자다 becomes 주무세요.',
  },
};
const HONOR_SPECIAL = {
  '먹다': '드세요',
  '마시다': '드세요',
  '자다': '주무세요',
  '말하다': '말씀하세요',
};
// 있으세요 / 계세요 depends on meaning: left out
const formsFor = verb => Object.keys(VERB_FORMS).filter(form => form !== 'honor' || !/[있없]다$/.test(verb));

// Conjugates a verb into one of VERB_FORMS (any other form gives the future).
// irr = false treats every verb as regular (for wrong answers).
function conj(verb, form, irr = true) {
  if (form === 'present') return aeo(verb, irr) + '요';
  if (form === 'past') return addFinal(aeo(verb, irr), 'ㅆ') + '어요';
  if (form === 'formal') return conjFormal(verb);
  if (form === 'casual') return aeo(verb, irr);
  if (form === 'honor') return conjHonorific(verb, irr);
  return conjFuture(verb, irr);
}

// -습니다 after a final consonant; ㅂ니다 after a vowel or a final ㄹ, which drops (알다 → 압니다)
function conjFormal(verb) {
  const stem = verb.slice(0, -1);
  const lastFinal = syllableJamo(stem.at(-1)).final;
  if (!lastFinal || lastFinal === finalJamoIndex('ㄹ')) return addFinal(stem, 'ㅂ') + '니다';
  return stem + '습니다';
}

// -(으)세요, with the special honorific verbs (드세요, 주무세요) and the irregular stems
function conjHonorific(verb, irr) {
  if (irr && HONOR_SPECIAL[verb]) return HONOR_SPECIAL[verb];
  const stem = verb.slice(0, -1);
  const group = irr ? irrOf(verb) : '';
  if (group === 'b') return stemWithoutFinal(stem) + '우세요';  // 더우세요
  if (group === 'd') return addFinal(stem, 'ㄹ') + '으세요';    // 들으세요
  if (group === 's') return stemWithoutFinal(stem) + '으세요';  // 나으세요
  if (group === 'h') return stemWithoutFinal(stem) + '세요';    // 그러세요
  const lastFinal = syllableJamo(stem.at(-1)).final;
  // no final: 가세요; a final ㄹ drops: 알다 → 아세요
  if (!lastFinal || lastFinal === finalJamoIndex('ㄹ')) return stemWithoutFinal(stem) + '세요';
  return stem + '으세요';
}

// -(으)ㄹ 거예요, with the irregular stems
function conjFuture(verb, irr) {
  const stem = verb.slice(0, -1);
  const group = irr ? irrOf(verb) : '';
  if (group === 'b') return stemWithoutFinal(stem) + '울 거예요';  // 더울 거예요
  if (group === 'd') return addFinal(stem, 'ㄹ') + '을 거예요';    // 들을 거예요
  if (group === 's') return stemWithoutFinal(stem) + '을 거예요';  // 나을 거예요
  if (group === 'h') return addFinal(stem, 'ㄹ') + ' 거예요';      // 그럴 거예요
  const lastFinal = syllableJamo(stem.at(-1)).final;
  if (!lastFinal) return addFinal(stem, 'ㄹ') + ' 거예요';         // 갈 거예요
  if (lastFinal === finalJamoIndex('ㄹ')) return stem + ' 거예요'; // 살 거예요
  return stem + '을 거예요';                                       // 먹을 거예요
}

// The 아/어 partner of a vowel, for the "other vowel" wrong answer
const VERB_WRONG_VOWEL_SWAP = {'ㅏ': 'ㅓ', 'ㅓ': 'ㅏ', 'ㅘ': 'ㅝ', 'ㅝ': 'ㅘ', 'ㅐ': 'ㅔ', 'ㅕ': 'ㅑ'};

// The word with the vowel of its last syllable swapped for its partner (가 → 거, 먹어 → 먹아), or null if it has none
function swapLastVowel(word) {
  const last = syllableJamo(word.at(-1));
  const swapped = VERB_WRONG_VOWEL_SWAP[PD.VOW[last.vowel]];
  if (!swapped) return null;
  return word.slice(0, -1) + syllableFromJamo({...last, vowel: vowelJamoIndex(swapped)});
}

// Wrong answers that learners actually make: no irregular change, the other vowel (아/어), no merging, the other ending.
function verbWrongs(verb, form) {
  const right = conj(verb, form);
  const candidates = [conj(verb, form, false), ...verbSlips(verb, form)];
  // a leftover jamo (ㄹ) means the candidate is not a real word
  return [...new Set(candidates.filter(x => x && x !== right && !/[ㄱ-ㅎ]/.test(x)))];
}

// The typical mistakes for one form (null or false entries are skipped by verbWrongs)
function verbSlips(verb, form) {
  const stem = verb.slice(0, -1);
  const last = syllableJamo(stem.at(-1));
  const bright = isBrightVowel(last.vowel);
  const swapped = swapLastVowel(aeo(verb));
  // unmerged 보아요 / 주어요 / 되어요 are correct Korean, so only unmerged forms that are never right are used: 가아요, 쓰어요
  const unmerged = !last.final && 'ㅏㅓㅡㅕㅑ'.includes(PD.VOW[last.vowel]) && stem.at(-1) !== '하';
  if (form === 'present') {
    return [
      stem + (bright ? '어요' : '아요'),
      swapped && swapped + '요',
      unmerged && stem + (bright ? '아요' : '어요'),
    ];
  }
  if (form === 'past') {
    return [
      stem + (bright ? '었어요' : '았어요'),
      swapped && addFinal(swapped, 'ㅆ') + '어요',
      unmerged && stem + (bright ? '았어요' : '었어요'),
    ];
  }
  if (form === 'formal') {
    return [
      last.final ? addFinal(stem, 'ㅂ') + '니다' : stem + '습니다',
      stem.at(-1) !== '하' ? aeo(verb) + '습니다' : '하습니다',
    ];
  }
  if (form === 'future') {
    // the last one: ㄹ added to the 아/어 form (먹어 → 먹얼 거예요), a common slip
    return [last.final ? stem + ' 거예요' : stem + '을 거예요', stem + '를 거예요', addFinal(aeo(verb), 'ㄹ') + ' 거예요'];
  }
  if (form === 'casual') return [aeo(verb) + '요', swapped, conj(verb, 'present', false).slice(0, -1)];
  if (form === 'honor') {
    return [
      last.final ? stem + '세요' : stem + '으세요',
      last.final === finalJamoIndex('ㄹ') ? stem + '으세요' : null,
      HONOR_SPECIAL[verb] ? stem + (last.final ? '으세요' : '세요') : null,
      aeo(verb) + '요',
    ];
  }
  return [];
}

// The word-list unit each word belongs to
const UNIT_OF = Object.fromEntries(
  PD.UNITS.filter(u => u.kind === 'word').flatMap(u => u.items.map(w => [w.ch, u.id])));
// TOPIK 1-3 verbs and adjectives from the word list (not 이다 words or set phrases).
// 바다 (sea) only looks like a verb; 뵙다 never takes 아요 (뵈어요 comes from 뵈다).
const VERBS = PD.VOCAB.filter(w =>
  w.section >= 1 && w.section <= 3 &&
  /[가-힣]다$/.test(w.ch) &&
  !w.ch.includes(' ') &&
  !/이다$/.test(w.ch) &&
  !['바다', '뵙다'].includes(w.ch));

// ---------------- Particles (조사): the form depends on whether the noun ends in a consonant ----------------
const PARTICLES = {
  topic: {
    label: '은/는', name: 'topic marker', forms: ['은', '는'],
    note: '은 after a final consonant (책은), 는 after a vowel (커피는). It marks what you are talking about.',
  },
  subject: {
    label: '이/가', name: 'subject marker', forms: ['이', '가'],
    note: '이 after a final consonant (책이), 가 after a vowel (커피가). It marks who or what does something.',
  },
  object: {
    label: '을/를', name: 'object marker', forms: ['을', '를'],
    note: '을 after a final consonant (책을), 를 after a vowel (커피를). It marks what the action is done to.',
  },
  and: {
    label: '과/와', name: '“and” between nouns', forms: ['과', '와'],
    note: '과 after a final consonant (책과), 와 after a vowel (커피와). It joins two nouns: A and B.',
  },
  toward: {
    label: '(으)로', name: '“to / by means of”', forms: ['으로', '로'],
    note: '으로 after a final consonant (집으로), 로 after a vowel or ㄹ (학교로, 지하철로). It shows direction or means.',
  },
};

// The noun with the right form of a particle: 은 after a final consonant (책은), 는 after a vowel (커피는).
// (으)로 treats a final ㄹ like a vowel: 지하철로.
const withParticle = (noun, kind) => {
  const final = syllableJamo(noun.at(-1)).final;
  const [afterConsonant, afterVowel] = PARTICLES[kind].forms;
  const usesConsonantForm = final && !(kind === 'toward' && final === finalJamoIndex('ㄹ'));
  return noun + (usesConsonantForm ? afterConsonant : afterVowel);
};
// The noun with the other form of the particle (책를)
const wrongParticle = (noun, kind) => {
  const [afterConsonant, afterVowel] = PARTICLES[kind].forms;
  return withParticle(noun, kind) === noun + afterConsonant ? noun + afterVowel : noun + afterConsonant;
};

// everyday nouns from the TOPIK 1-3 noun units; every 3rd one gets recorded clips, so questions use those
const NOUN_UNITS = [
  'words1', 'words2', 'words3', 'words4', 't1-0', 't1-2', 't1-3', 't1-6', 't2-0', 't2-1', 't2-2', 't2-3', 't2-6',
  't2-7', 't3-0', 't3-2', 't3-6',
];
const NOUNS = PD.VOCAB
  .filter(w =>
    NOUN_UNITS.includes(UNIT_OF[w.ch]) &&
    /^[가-힣]{1,4}$/.test(w.ch) &&
    !/다$|요$/.test(w.ch) &&
    !/^to /.test(w.meaning) &&
    !['네', '아니요', '우리', '나', '너', '안녕하세요', '감사합니다'].includes(w.ch))
  .filter((w, i) => i % 3 === 0);

// ---------------- Sound changes (발음 규칙) ----------------
// ex: [spelling, how it is said, meaning, a common wrong reading]
const SOUNDS = [
  {
    id: 'link', ko: '연음', name: 'Linking',
    rule: 'A final consonant moves into the next syllable when that syllable starts with a silent ㅇ.',
    ex: [
      ['음악', '으막', 'music', '음막'], ['한국어', '한구거', 'Korean (language)', '한국거'], ['먹어요', '머거요', 'I eat', '머꺼요'],
      ['읽어요', '일거요', 'I read', '이거요'], ['옷이', '오시', 'clothes (subject)', '오지'],
    ],
  },
  {
    id: 'nasal', ko: '비음화', name: 'Nasal change', rule: 'ㄱ, ㄷ and ㅂ sounds become ㅇ, ㄴ and ㅁ before ㄴ or ㅁ.',
    ex: [
      ['합니다', '함니다', 'I do (formal)', '한니다'], ['감사합니다', '감사함니다', 'thank you', '감사한니다'], ['작년', '장년', 'last year', '잔년'],
      ['국물', '궁물', 'broth', '군물'], ['거짓말', '거진말', 'lie', '거짐말'], ['앞니', '암니', 'front tooth', '안니'],
    ],
  },
  {
    id: 'tense', ko: '경음화', name: 'Tensing',
    rule: 'After a ㄱ, ㄷ or ㅂ sound, the next ㄱ ㄷ ㅂ ㅅ ㅈ becomes tense: ㄲ ㄸ ㅃ ㅆ ㅉ.',
    ex: [
      ['학교', '학꾜', 'school', '학쿄'], ['식당', '식땅', 'restaurant', '신당'], ['잡지', '잡찌', 'magazine', '잡치'],
      ['학생', '학쌩', 'student', '항생'], ['책상', '책쌍', 'desk', '챙상'], ['국밥', '국빱', 'rice soup', '국팝'],
    ],
  },
  {
    id: 'aspir', ko: '격음화', name: 'Breathy ㅎ', rule: 'ㄱ, ㄷ, ㅂ or ㅈ next to ㅎ merge into ㅋ, ㅌ, ㅍ or ㅊ.',
    ex: [
      ['축하해요', '추카해요', 'congratulations', '추가해요'], ['좋다', '조타', 'good', '조다'], ['입학', '이팍', 'starting school', '이박'],
      ['많다', '만타', 'many', '만다'], ['백화점', '배콰점', 'department store', '배과점'], ['놓고', '노코', 'put and…', '노고'],
    ],
  },
  {
    id: 'liquid', ko: '유음화', name: 'ㄴ next to ㄹ',
    rule: 'ㄴ next to ㄹ, before or after it, is said as ㄹ: ㄴㄹ and ㄹㄴ both become ㄹㄹ.',
    ex: [
      ['설날', '설랄', 'Lunar New Year', '선날'], ['신라', '실라', 'Silla (old kingdom)', '신나'], ['연락', '열락', 'contact', '연낙'],
      ['편리', '펼리', 'convenience', '편니'], ['한류', '할류', 'Korean Wave', '한뉴'], ['일년', '일련', 'one year', '인년'],
    ],
  },
  {
    id: 'palatal', ko: '구개음화', name: 'ㄷ and ㅌ before 이', rule: 'ㄷ or ㅌ before 이 is said as ㅈ or ㅊ.',
    ex: [
      ['같이', '가치', 'together', '가티'], ['굳이', '구지', 'insistently', '구디'], ['해돋이', '해도지', 'sunrise', '해도디'],
      ['끝이', '끄치', 'the end (subject)', '끄티'], ['붙이다', '부치다', 'to stick on', '부티다'],
    ],
  },
  {
    id: 'silenth', ko: 'ㅎ 탈락', name: 'Silent ㅎ', rule: 'A final ㅎ before a vowel is not said at all.',
    ex: [
      ['좋아요', '조아요', 'it is good', '조하요'], ['놓아요', '노아요', 'I put it down', '노하요'], ['많이', '마니', 'a lot', '만히'],
      ['싫어요', '시러요', 'I don’t like it', '실허요'], ['괜찮아요', '괜차나요', 'it’s okay', '괜차하요'],
    ],
  },
];

// ---------------- Casual vs textbook: how people really talk ----------------
// [textbook form, casual form, English, note, group]
const CASUAL = [
  ['무엇', '뭐', 'what', '무엇 is for writing; in speech everyone says 뭐.', 'short'],
  ['무엇을', '뭘', 'what (object)', '무엇을 shrinks to 뭘; 뭐를 is also heard.', 'short'],
  ['무엇이', '뭐가', 'what (subject)', 'In speech 무엇이 becomes 뭐 + 가: 뭐가 좋아요?', 'short'],
  ['이것', '이거', 'this (thing)', '것 is said 거 in everyday speech: 이거, 그거, 저거.', 'short'],
  ['이것을', '이걸', 'this (object)', '이거 + 를 merges into 이걸: 이걸 주세요.', 'short'],
  ['그것은', '그건', 'that (topic)', '그거 + 는 merges into 그건: 그건 몰라요.', 'short'],
  ['저것이', '저게', 'that over there (subject)', '저거 + 이 merges into 저게: 저게 뭐예요?', 'short'],
  ['저는', '전', 'I (topic, polite)', '저 + 는 shrinks to 전; common in polite speech too.', 'short'],
  ['저를', '절', 'me (object, polite)', '저 + 를 shrinks to 절: 절 기억해요?', 'short'],
  ['나는', '난', 'I (topic, casual)', '나 + 는 shrinks to 난, with friends.', 'short'],
  ['나를', '날', 'me (object, casual)', '나 + 를 shrinks to 날, common in songs and chats.', 'short'],
  ['너는', '넌', 'you (topic, casual)', '너 + 는 shrinks to 넌; only with close friends or younger people.', 'short'],
  ['우리는', '우린', 'we (topic)', '우리 + 는 shrinks to 우린 in quick speech.', 'short'],
  ['여기에서', '여기서', 'here (at)', '에서 often loses 에 after 여기, 거기, 저기.', 'short'],
  ['그런데', '근데', 'but, by the way', 'The everyday form of 그런데, in speech and texts.', 'short'],
  ['그러면', '그럼', 'then, in that case', '그러면 shrinks to 그럼: 그럼 내일 봐요.', 'short'],
  ['그러니까', '그니까', 'so, I mean', 'A fast spoken 그러니까, often to agree: 그니까!', 'short'],
  ['조금', '좀', 'a little; please', '좀 also softens a request: 좀 도와주세요.', 'short'],
  ['이야기', '얘기', 'talk, story', '이야기 is said and often written 얘기.', 'short'],
  ['어떻게 해요', '어떡해요', 'what do I do?', '어떻게 해 merges into 어떡해 when you’re worried or surprised.', 'short'],
  ['할 것이에요', '할 거예요', 'I’m going to do it', '것이에요 becomes 거예요 in speech: 갈 거예요, 먹을 거예요.', 'short'],
  ['마음에 들어요', '맘에 들어요', 'I like it', '마음 is often said 맘, especially in 맘에 들어요.', 'short'],
  ['안녕하세요', '안녕', 'hi; bye', 'With friends 안녕 means both hello and goodbye.', 'banmal'],
  ['고마워요', '고마워', 'thanks', 'Drop 요 for friends and younger people (반말).', 'banmal'],
  ['미안해요', '미안해', 'sorry', 'The 반말 apology between friends.', 'banmal'],
  ['네', '응', 'yes', '응 is the casual yes; never to elders or strangers.', 'banmal'],
  ['아니요', '아니', 'no', '아니 is the casual no; also “what?!” when surprised.', 'banmal'],
  ['뭐 해요?', '뭐 해?', 'what are you doing?', 'A typical first text to a friend.', 'banmal'],
  ['어디 가요?', '어디 가?', 'where are you going?', 'Friends ask this as a greeting, not to pry.', 'banmal'],
  ['밥 먹었어요?', '밥 먹었어?', 'have you eaten?', 'A friendly “how are you” more than a real question.', 'banmal'],
  ['같이 가요', '같이 가자', 'let’s go together', 'In 반말, “let’s” is -자: 먹자, 하자, 놀자.', 'banmal'],
  ['잘 자요', '잘 자', 'good night', 'Said to friends, family or a partner at bedtime.', 'banmal'],
  [
    '잘 가요', '잘 가', 'bye (to someone leaving)', 'Say it to the friend who is leaving; they may answer 응, 내일 봐.',
    'banmal',
  ],
  ['괜찮아요?', '괜찮아?', 'are you okay?', 'Drop 요 with friends; the answer is 괜찮아.', 'banmal'],
  ['진짜요?', '진짜?', 'really?', 'The everyday reaction among friends; 정말? is a bit softer.', 'banmal'],
  ['맞아요', '맞아', 'that’s right', 'A common way to agree with a friend: 맞아 맞아!', 'banmal'],
  ['알았어요', '알았어', 'got it, okay', 'The usual casual “okay” when a friend asks something.', 'banmal'],
  ['아니에요', '아니야', 'no, it’s not; no problem', '아니에요 becomes 아니야 in 반말.', 'banmal'],
  ['보고 싶어요', '보고 싶어', 'I miss you', 'To a close friend, family member or partner.', 'banmal'],
  ['배고파요', '배고파', 'I’m hungry', 'Plain 반말: just drop 요.', 'banmal'],
  ['몰라요', '몰라', 'I don’t know', 'Casual; with a flat tone it can sound like “whatever”.', 'banmal'],
  ['왜요?', '왜?', 'why?', 'Drop 요 with friends; to elders keep 왜요?', 'banmal'],
  ['이게 뭐예요?', '이게 뭐야?', 'what is this?', '-예요 / -이에요 become -야 / -이야 in 반말.', 'banmal'],
  ['나중에 봐요', '나중에 봐', 'see you later', 'A casual goodbye; also 이따 봐 for later today.', 'banmal'],
  ['저', '나', 'I, me', '저 is the humble I; 나 is used with friends and younger people.', 'banmal'],
  ['제', '내', 'my', '제 is humble, 내 is casual: 내 친구, 내 거.', 'banmal'],
  ['아르바이트', '알바', 'part-time job', 'Everyone says 알바; a part-timer is 알바생.', 'slang'],
  ['휴대 전화', '핸드폰', 'mobile phone', '휴대 전화 is the official word; people say 핸드폰 or just 폰.', 'slang'],
  ['셀프 카메라', '셀카', 'selfie', 'Cut from 셀프 카메라: 셀카 찍자!', 'slang'],
  ['생일 파티', '생파', 'birthday party', 'First syllables of 생일 and 파티.', 'slang'],
  ['맛있는 집', '맛집', 'great place to eat', 'Now used everywhere, from TV to maps: 맛집 추천해 줘.', 'slang'],
  ['정말 재미있다', '꿀잼', 'super fun', '꿀 (honey) + 재미; the opposite is 노잼.', 'slang'],
  ['재미없다', '노잼', 'boring, not funny', 'English “no” + 재미: 그 영화 노잼이야.', 'slang'],
  ['남자 친구', '남친', 'boyfriend', 'First syllables of 남자 and 친구.', 'slang'],
  ['여자 친구', '여친', 'girlfriend', 'First syllables of 여자 and 친구.', 'slang'],
  ['대단하다', '대박', 'awesome; wow', 'Said for anything amazing: 대박!', 'slang'],
  [
    '갑자기 분위기 싸해짐', '갑분싸', 'sudden awkward silence', 'First syllables of a whole phrase, typical of internet slang.',
    'slang',
  ],
  ['아이스 아메리카노', '아아', 'iced Americano', 'Café talk: 아아 한 잔 주세요. Hot is 뜨아.', 'slang'],
  ['치킨과 맥주', '치맥', 'chicken and beer', 'A favourite night-out combo: 치맥 할래?', 'slang'],
  ['혼자 먹는 밥', '혼밥', 'eating alone', '혼자 + 밥; also 혼술 (drinking alone).', 'slang'],
  ['강력 추천', '강추', 'highly recommend', 'The opposite is 비추 (not recommended).', 'slang'],
  ['불타는 금요일', '불금', 'Friday night out', 'Literally “burning Friday”: 불금이다!', 'slang'],
  ['합니다', '해요', 'I do', '-ㅂ니다 is for news, speeches and formal work; -아요/어요 for daily talk.', 'written'],
  ['그렇습니까?', '그래요?', 'is that so?', '-습니까 sounds stiff in conversation; 그래요? is the everyday form.', 'written'],
  ['하십시오', '하세요', 'please do', '-십시오 is for signs and announcements; say -세요 to people.', 'written'],
  ['및', '하고', 'and', '및 appears only in writing; in speech use 하고 or (이)랑.', 'written'],
  ['하였다', '했다', 'did', '하였다 is old-style writing; 했다 is used in speech and most modern text.', 'written'],
  ['무엇입니까?', '뭐예요?', 'what is it?', 'The formal question is for exams and ceremonies; ask 뭐예요?', 'written'],
  ['있습니까?', '있어요?', 'is there? do you have?', 'In shops and daily life, 있어요? is normal.', 'written'],
  ['학생입니다', '학생이에요', 'I’m a student', '-입니다 for formal self-introductions; -이에요 in conversation.', 'written'],
  ['그러나', '하지만', 'but', '그러나 is written; in speech say 하지만 or 근데.', 'written'],
  ['또한', '그리고', 'also, and', '또한 is bookish; 그리고 or 또 in conversation.', 'written'],
  ['매우', '정말', 'very', '매우 is mostly written; in speech 정말, 진짜 or 너무.', 'written'],
  ['그러므로', '그래서', 'therefore', '그러므로 is for essays; 그래서 in everyday talk.', 'written'],
  ['하지 않습니다', '안 해요', 'I don’t do it', 'Long negation -지 않다 is common in writing; speech prefers 안.', 'written'],
  ['드십시오', '드세요', 'please eat', 'Polite to elders but not stiff: 맛있게 드세요.', 'written'],
  ['보았다', '봤다', 'saw', '보았다 is written style; 봤다 is the spoken and modern form.', 'written'],
  ['반갑습니다', '반가워요', 'nice to meet you', '-습니다 at a first formal meeting; 반가워요 is warmer.', 'written'],
  ['안녕히 가십시오', '안녕히 가세요', 'goodbye (to someone leaving)', '-십시오 for announcements; people say 안녕히 가세요.', 'written'],
];

// ---------------- Reading: short graded stories ----------------
// lines: [Korean, English]. gloss: useful words beyond the app's word list.
// skip: word-list matches that have another meaning in this story.
// qs: [question, options, index of the answer]
const STORIES = [
  {
    id: 'family', level: 1, title: '우리 가족', en: 'My family', skip: ['네'],
    lines: [
      ['저는 민수예요.', 'I’m Minsu.'],
      ['우리 가족은 네 명이에요.', 'There are four people in my family.'],
      ['아버지는 회사원이고 어머니는 선생님이에요.', 'My father is an office worker and my mother is a teacher.'],
      ['누나는 대학생이에요.', 'My older sister is a university student.'],
      ['우리는 주말에 같이 공원에 가요.', 'We go to the park together at the weekend.'],
      ['저는 우리 가족을 정말 좋아해요.', 'I really love my family.'],
    ],
    gloss: [
      ['회사원', 'office worker'], ['누나', 'older sister (said by a man)'], ['대학생', 'university student'],
      ['같이', 'together'], ['정말', 'really'],
    ],
    qs: [
      ['How many people are in Minsu’s family?', ['Three', 'Four', 'Five', 'Six'], 1],
      [
        'What does his mother do?',
        ['She is a teacher', 'She is an office worker', 'She is a student', 'She is a doctor'], 0,
      ],
    ],
  },
  {
    id: 'cafe', level: 1, title: '카페에서', en: 'At the café',
    lines: [
      ['오늘은 토요일이에요.', 'Today is Saturday.'],
      ['저는 친구하고 카페에 갔어요.', 'I went to a café with a friend.'],
      ['저는 커피를 마시고 친구는 녹차를 마셨어요.', 'I drank coffee and my friend drank green tea.'],
      ['케이크도 먹었어요.', 'We ate cake too.'],
      ['정말 맛있었어요.', 'It was really delicious.'],
      ['커피는 사천오백 원이었어요.', 'The coffee was 4,500 won.'],
      ['다음 주에 또 갈 거예요.', 'We’ll go again next week.'],
    ],
    gloss: [['녹차', 'green tea'], ['케이크', 'cake'], ['또', 'again'], ['다음 주', 'next week'], ['-하고', 'with (a person)']],
    qs: [
      ['What did the friend drink?', ['Coffee', 'Green tea', 'Juice', 'Milk'], 1],
      ['How much was the coffee?', ['₩4,000', '₩4,500', '₩5,400', '₩14,500'], 1],
    ],
  },
  {
    id: 'rain', level: 2, title: '비 오는 날', en: 'A rainy day',
    lines: [
      ['어제는 아침부터 비가 많이 왔어요.', 'Yesterday it rained a lot from the morning.'],
      ['우산이 없어서 집에 있었어요.', 'I had no umbrella, so I stayed at home.'],
      ['집에서 한국 드라마를 봤어요.', 'I watched a Korean drama at home.'],
      ['드라마가 재미있어서 다섯 시간 동안 봤어요.', 'The drama was fun, so I watched it for five hours.'],
      ['저녁에는 라면을 끓여 먹었어요.', 'In the evening I cooked ramyeon and ate it.'],
      ['오늘은 날씨가 맑아서 기분이 좋아요.', 'Today the weather is clear, so I feel good.'],
    ],
    gloss: [
      ['우산', 'umbrella'], ['드라마', 'drama (TV series)'], ['동안', 'for (a length of time)'], ['라면', 'instant noodles'],
      ['기분', 'mood, feeling'], ['-아서/어서', 'so, because'],
    ],
    qs: [
      [
        'Why did the writer stay at home?',
        ['They had no umbrella', 'They were sick', 'They had work', 'They were tired'], 0,
      ],
      ['How long did they watch the drama?', ['Two hours', 'Three hours', 'Five hours', 'All day'], 2],
    ],
  },
  {
    id: 'busan', level: 2, title: '부산 여행', en: 'A trip to Busan',
    lines: [
      ['지난여름에 처음으로 부산에 갔어요.', 'Last summer I went to Busan for the first time.'],
      ['서울에서 기차를 타고 세 시간쯤 걸렸어요.', 'By train from Seoul it took about three hours.'],
      ['부산은 바다가 아름답고 음식이 맛있어요.', 'Busan has a beautiful sea and delicious food.'],
      ['해운대에서 수영을 하고 시장에서 생선을 먹었어요.', 'I swam at Haeundae and ate fish at the market.'],
      ['사람이 많았지만 정말 즐거웠어요.', 'There were a lot of people, but it was really fun.'],
      ['내년에 가족하고 다시 가고 싶어요.', 'Next year I want to go again with my family.'],
    ],
    gloss: [
      ['지난여름', 'last summer'], ['처음으로', 'for the first time'], ['-쯤', 'about'], ['걸리다', 'to take (time)'],
      ['아름답다', 'to be beautiful'], ['즐겁다', 'to be fun'], ['다시', 'again'],
    ],
    qs: [
      ['How did the writer travel to Busan?', ['By bus', 'By train', 'By plane', 'By car'], 1],
      ['Who do they want to go with next year?', ['Friends', 'Coworkers', 'Their family', 'Alone'], 2],
    ],
  },
  {
    id: 'study', level: 2, title: '한국어 공부', en: 'Studying Korean',
    lines: [
      ['저는 일 년 전부터 한국어를 공부하고 있어요.', 'I’ve been studying Korean since a year ago.'],
      ['처음에는 한글도 몰랐어요.', 'At first I didn’t even know Hangul.'],
      ['지금은 짧은 글을 읽을 수 있어요.', 'Now I can read short texts.'],
      ['매일 아침 지하철에서 한국어 팟캐스트를 들어요.', 'Every morning I listen to a Korean podcast on the subway.'],
      ['듣기는 아직 어렵지만 재미있어요.', 'Listening is still hard, but it’s fun.'],
      ['내년에 토픽 시험을 볼 거예요.', 'Next year I’ll take the TOPIK exam.'],
    ],
    gloss: [
      ['전', 'ago, before'], ['처음', 'the beginning'], ['글', 'writing, a text'], ['-ㄹ 수 있다', 'can'], ['팟캐스트', 'podcast'],
      ['아직', 'still, yet'], ['시험을 보다', 'to take an exam'],
    ],
    qs: [
      [
        'When does the writer listen to podcasts?',
        ['At lunch', 'On the subway in the morning', 'Before bed', 'At the weekend'], 1,
      ],
      ['What is still hard for the writer?', ['Reading', 'Writing', 'Listening', 'Hangul'], 2],
    ],
  },
  {
    id: 'job', level: 3, title: '새 직장', en: 'A new job',
    lines: [
      ['지난달부터 새 회사에서 일하기 시작했어요.', 'Last month I started working at a new company.'],
      ['회사가 집에서 멀어서 아침 일찍 일어나야 해요.', 'The company is far from home, so I have to get up early.'],
      ['처음에는 일이 익숙하지 않아서 힘들었어요.', 'At first the work was unfamiliar, so it was hard.'],
      ['하지만 동료들이 친절하게 도와줘서 많이 배웠어요.', 'But my coworkers helped me kindly, so I learned a lot.'],
      ['요즘은 점심시간에 동료들과 같이 산책을 해요.', 'These days I go for a walk with my coworkers at lunchtime.'],
      ['앞으로 더 열심히 노력할 거예요.', 'From now on I’ll try even harder.'],
    ],
    gloss: [
      ['직장', 'workplace, job'], ['지난달', 'last month'], ['일찍', 'early'], ['-아야/어야 하다', 'to have to'],
      ['익숙하다', 'to be used to'], ['힘들다', 'to be hard'], ['동료', 'coworker'], ['점심시간', 'lunchtime'],
      ['앞으로', 'from now on'],
    ],
    qs: [
      [
        'Why does the writer get up early?',
        ['The company is far away', 'They like mornings', 'They exercise first', 'They start work at 7'], 0,
      ],
      [
        'What do they do at lunchtime these days?',
        ['Study Korean', 'Go for a walk with coworkers', 'Sleep', 'Eat alone'], 1,
      ],
    ],
  },
  {
    id: 'move', level: 3, title: '이사', en: 'Moving house',
    lines: [
      ['지난주에 회사 근처로 이사했어요.', 'Last week I moved near my company.'],
      ['전에는 출근하는 데 한 시간이 넘게 걸렸어요.', 'Before, it took over an hour to get to work.'],
      ['이제는 걸어서 십 분이면 회사에 도착해요.', 'Now I get to the office in ten minutes on foot.'],
      ['새 집은 좁지만 창문이 커서 햇빛이 잘 들어와요.', 'The new place is small, but the windows are big, so lots of sunlight comes in.'],
      ['이웃들도 친절해서 벌써 이 동네가 마음에 들어요.', 'The neighbours are kind too, so I already like this neighbourhood.'],
      ['주말에는 친구들을 초대해서 집들이를 할 거예요.', 'At the weekend I’m going to invite friends for a housewarming.'],
    ],
    gloss: [
      ['이사하다', 'to move house'], ['근처', 'nearby'], ['출근하다', 'to go to work'], ['걸리다', 'to take (time)'],
      ['좁다', 'to be small, narrow'], ['햇빛', 'sunlight'], ['이웃', 'neighbour'], ['마음에 들다', 'to like'],
      ['집들이', 'housewarming party'],
    ],
    qs: [
      [
        'How long does the trip to work take now?',
        ['About an hour', 'Ten minutes on foot', 'Thirty minutes by bus', 'Five minutes by car'], 1,
      ],
      [
        'What does the writer like about the new home?',
        ['It is big', 'The big windows let in sunlight', 'It is cheap', 'It has a garden'], 1,
      ],
    ],
  },
  {
    id: 'cold', level: 3, title: '감기', en: 'A bad cold',
    lines: [
      ['어제부터 머리가 아프고 열이 났어요.', 'Since yesterday I’ve had a headache and a fever.'],
      ['그래서 오늘 아침에 회사에 가지 않고 병원에 갔어요.', 'So this morning I didn’t go to work; I went to the hospital.'],
      ['의사 선생님이 감기니까 푹 쉬라고 하셨어요.', 'The doctor said it’s a cold, so I should rest well.'],
      ['약국에서 약을 사고 집에 와서 하루 종일 잤어요.', 'I bought medicine at the pharmacy, came home and slept all day.'],
      ['저녁에는 어머니가 끓여 주신 죽을 먹었어요.', 'In the evening I ate the rice porridge my mother made for me.'],
      ['내일은 몸이 좀 나았으면 좋겠어요.', 'I hope I feel a bit better tomorrow.'],
    ],
    gloss: [
      ['열이 나다', 'to have a fever'], ['-지 않고', 'without ...ing'], ['푹 쉬다', 'to rest well'],
      ['-라고 하다', 'to say (that one should)'], ['약국', 'pharmacy'], ['하루 종일', 'all day'], ['끓이다', 'to boil, cook'],
      ['죽', 'rice porridge'], ['낫다', 'to get better'],
    ],
    qs: [
      [
        'Why didn’t the writer go to work?',
        ['They had a cold', 'It was a holiday', 'They overslept', 'They moved house'], 0,
      ],
      ['Who made the porridge?', ['The doctor', 'A friend', 'Their mother', 'The writer'], 2],
    ],
  },
  {
    id: 'online', level: 4, title: '온라인 수업', en: 'Studying online',
    lines: [
      ['코로나 이후 온라인 수업이 크게 늘어났다.', 'After COVID, online classes increased greatly.'],
      [
        '온라인 수업은 시간과 장소에 상관없이 들을 수 있다는 장점이 있다.',
        'Online classes have the advantage that you can take them anytime, anywhere.',
      ],
      [
        '또한 이해하지 못한 부분은 다시 볼 수 있어서 복습하기에도 좋다.',
        'Also, you can watch the parts you didn’t understand again, so they are good for review.',
      ],
      ['하지만 혼자 공부하다 보면 집중력이 떨어지기 쉽다.', 'But when you study alone, your concentration easily drops.'],
      [
        '선생님이나 친구들과 직접 대화할 기회가 적다는 것도 단점이다.',
        'Having few chances to talk directly with teachers or friends is also a drawback.',
      ],
      ['따라서 자신에게 맞는 공부 방법을 찾는 것이 중요하다.', 'So it is important to find the way of studying that suits you.'],
    ],
    gloss: [
      ['이후', 'after'], ['늘어나다', 'to increase'], ['상관없이', 'regardless of'], ['장점', 'advantage'], ['복습', 'review'],
      ['-다 보면', 'if you keep ...ing'], ['집중력', 'concentration'], ['떨어지다', 'to drop'], ['단점', 'drawback'],
      ['따라서', 'therefore'],
    ],
    qs: [
      [
        'What is one advantage of online classes?',
        [
          'You can rewatch parts you missed', 'You meet friends often', 'They are always free',
          'Teachers visit your home',
        ],
        0,
      ],
      [
        'What drawback is mentioned?',
        [
          'They are expensive', 'It is easy to lose concentration', 'The internet is slow',
          'There is too much homework',
        ],
        1,
      ],
    ],
  },
  {
    id: 'green', level: 4, title: '환경을 지키는 작은 습관', en: 'Small habits for the environment',
    lines: [
      ['최근 환경 문제에 관심을 가지는 사람들이 많아졌다.', 'Recently more people have become interested in environmental problems.'],
      ['일회용 컵 대신 텀블러를 사용하는 사람도 쉽게 볼 수 있다.', 'You can easily see people using a tumbler instead of a disposable cup.'],
      ['장을 볼 때 장바구니를 가지고 가는 것도 좋은 습관이다.', 'Taking your own bag when you go grocery shopping is also a good habit.'],
      ['분리수거를 제대로 하면 쓰레기의 양을 줄일 수 있다.', 'Sorting recycling properly reduces the amount of rubbish.'],
      [
        '이런 작은 실천이 모이면 지구를 지키는 데 큰 도움이 된다.',
        'When small actions like these add up, they help a lot in protecting the earth.',
      ],
      [
        '환경 보호는 먼 곳이 아니라 우리 생활에서 시작된다.',
        'Protecting the environment starts not somewhere far away but in our daily lives.',
      ],
    ],
    gloss: [
      ['관심을 가지다', 'to be interested'], ['일회용', 'disposable'], ['대신', 'instead of'], ['장을 보다', 'to go grocery shopping'],
      ['장바구니', 'shopping bag'], ['분리수거', 'sorting recycling'], ['줄이다', 'to reduce'], ['실천', 'putting into practice'],
      ['지구', 'the earth'], ['보호', 'protection'],
    ],
    qs: [
      ['What do people use instead of disposable cups?', ['Glass bottles', 'Tumblers', 'Paper cups', 'Nothing'], 1],
      [
        'Where does protecting the environment start, according to the text?',
        ['In government', 'In faraway places', 'In our daily lives', 'Only in schools'], 2,
      ],
    ],
  },
  {
    id: 'remote', level: 5, title: '재택근무', en: 'Working from home',
    lines: [
      ['재택근무가 보편화되면서 일하는 방식에도 큰 변화가 생겼다.', 'As working from home became common, the way we work changed a great deal.'],
      ['출퇴근 시간이 사라져 개인 시간이 늘었다는 점은 분명한 장점이다.', 'Losing the commute and gaining personal time is a clear advantage.'],
      [
        '반면 일과 생활의 경계가 모호해져 오히려 더 오래 일하게 되었다는 사람도 적지 않다.',
        'On the other hand, quite a few people say the line between work and life has blurred, so they end up working even longer.',
      ],
      [
        '또한 동료와의 소통이 줄어 소속감을 느끼기 어렵다는 지적도 있다.',
        'Some also point out that with less contact with coworkers, it is hard to feel you belong.',
      ],
      [
        '이에 따라 일주일에 며칠만 출근하는 혼합 근무를 도입하는 기업이 늘고 있다.',
        'So more companies are introducing hybrid work, with only a few office days a week.',
      ],
      [
        '결국 중요한 것은 장소가 아니라 효율적으로 일할 수 있는 환경을 만드는 것이다.',
        'In the end, what matters is not the place but creating conditions for working efficiently.',
      ],
    ],
    gloss: [
      ['재택근무', 'working from home'], ['보편화되다', 'to become common'], ['방식', 'way, method'], ['출퇴근', 'commuting'],
      ['경계', 'boundary'], ['모호하다', 'to be vague, blurred'], ['오히려', 'rather, on the contrary'], ['소통', 'communication'],
      ['소속감', 'sense of belonging'], ['지적', 'criticism, pointing out'], ['도입하다', 'to introduce'], ['효율적', 'efficient'],
    ],
    qs: [
      [
        'What problem does the text mention?',
        [
          'Commuting takes longer', 'Work and life are harder to separate', 'Salaries went down',
          'Offices are too crowded',
        ],
        1,
      ],
      [
        'What are more companies introducing?',
        ['Longer hours', 'Hybrid work with some office days', 'Four-day weeks', 'Bigger offices'], 1,
      ],
    ],
  },
  {
    id: 'aging', level: 5, title: '고령화 사회', en: 'An ageing society',
    lines: [
      ['한국은 세계에서 가장 빠르게 고령화가 진행되고 있는 나라 중 하나이다.', 'Korea is one of the fastest-ageing countries in the world.'],
      [
        '출산율은 낮아지고 평균 수명은 길어지면서 노인 인구의 비율이 계속 높아지고 있다.',
        'As the birth rate falls and life expectancy rises, the share of older people keeps growing.',
      ],
      [
        '이로 인해 일할 수 있는 인구가 줄어 경제 성장이 둔화될 수 있다는 우려가 크다.',
        'Because of this, there is great concern that the working population will shrink and economic growth may slow.',
      ],
      [
        '또한 노인을 부양하기 위한 사회적 비용도 점점 늘어날 것으로 예상된다.',
        'The cost to society of supporting older people is also expected to keep rising.',
      ],
      [
        '정부는 출산을 장려하는 정책과 함께 노인 일자리를 늘리는 방안을 마련하고 있다.',
        'The government is preparing policies to encourage births, along with ways to create more jobs for older people.',
      ],
      [
        '고령화는 피할 수 없는 흐름인 만큼 사회 전체가 함께 대비해야 한다.',
        'Since ageing cannot be avoided, the whole of society must prepare for it together.',
      ],
    ],
    gloss: [
      ['고령화', 'population ageing'], ['진행되다', 'to progress'], ['출산율', 'birth rate'], ['평균 수명', 'life expectancy'],
      ['비율', 'proportion'], ['둔화되다', 'to slow down'], ['우려', 'concern'], ['부양하다', 'to support (family)'],
      ['예상되다', 'to be expected'], ['장려하다', 'to encourage'], ['방안', 'plan, measure'], ['대비하다', 'to prepare for'],
    ],
    qs: [
      [
        'What concern is mentioned?',
        ['Too many young workers', 'Economic growth may slow', 'Houses are too cheap', 'Schools are too big'], 1,
      ],
      [
        'What is the government doing?',
        ['Only raising taxes', 'Encouraging births and creating jobs for older people', 'Closing hospitals', 'Nothing'],
        1,
      ],
    ],
  },
  {
    id: 'ai', level: 6, title: '인공지능과 일', en: 'AI and work',
    lines: [
      [
        '인공지능 기술의 발전은 노동 시장의 구조를 근본적으로 바꾸어 놓고 있다.',
        'Advances in artificial intelligence are fundamentally reshaping the labour market.',
      ],
      [
        '단순하고 반복적인 업무는 이미 상당 부분 자동화되었으며, 그 범위는 점차 전문 영역으로까지 확대되고 있다.',
        'Simple, repetitive tasks have already been largely automated, and this is gradually spreading even into specialist fields.',
      ],
      [
        '이에 대해 일자리 감소를 우려하는 목소리가 있는 반면, 새로운 직업이 창출될 것이라는 낙관적인 전망도 존재한다.',
        'Some voices worry about job losses, while others optimistically expect new kinds of work to be created.',
      ],
      [
        '역사적으로 보면 기술 혁신은 일부 직업을 소멸시키는 동시에 예상치 못한 분야에서 새로운 기회를 만들어 왔다.',
        'Historically, technological innovation has wiped out some jobs while creating new opportunities in unexpected fields.',
      ],
      [
        '관건은 개인과 사회가 변화의 속도에 맞추어 얼마나 유연하게 적응하느냐에 달려 있다.',
        'The key is how flexibly individuals and society adapt to the speed of change.',
      ],
      [
        '따라서 평생 교육 체계를 강화하여 누구나 새로운 기술을 익힐 수 있도록 하는 것이 시급하다.',
        'So it is urgent to strengthen lifelong education, so that anyone can learn new skills.',
      ],
    ],
    gloss: [
      ['인공지능', 'artificial intelligence'], ['노동 시장', 'labour market'], ['근본적으로', 'fundamentally'],
      ['반복적', 'repetitive'], ['자동화되다', 'to be automated'], ['확대되다', 'to expand'], ['창출되다', 'to be created'],
      ['낙관적', 'optimistic'], ['전망', 'outlook, forecast'], ['소멸', 'disappearance'], ['관건', 'the key point'],
      ['유연하다', 'to be flexible'], ['평생 교육', 'lifelong education'], ['시급하다', 'to be urgent'],
    ],
    qs: [
      [
        'What has technological innovation done, historically?',
        [
          'Only destroyed jobs', 'Removed some jobs and created new opportunities', 'Had no effect on work',
          'Made education unnecessary',
        ],
        1,
      ],
      [
        'What does the writer say is urgent?',
        ['Banning AI', 'Strengthening lifelong education', 'Reducing working hours', 'Building more factories'], 1,
      ],
    ],
  },
  {
    id: 'jeong', level: 6, title: '정', en: 'Jeong, a Korean feeling',
    lines: [
      [
        '한국 사람들의 정서를 이해하는 데 빼놓을 수 없는 개념이 바로 정이다.',
        'A concept you cannot leave out when trying to understand how Koreans feel is jeong.',
      ],
      [
        '정은 오랜 시간 함께 지내며 자연스럽게 쌓이는 따뜻한 유대감을 가리킨다.',
        'Jeong is the warm bond that builds up naturally when people spend a long time together.',
      ],
      [
        '이웃과 음식을 나누거나 단골 가게에서 덤을 얹어 주는 모습에서도 정을 엿볼 수 있다.',
        'You can glimpse it when neighbours share food, or when your regular shop adds a little extra for free.',
      ],
      [
        '흥미로운 것은 정이 좋아하는 감정뿐만 아니라 미운 정까지 포함한다는 점이다.',
        'Interestingly, jeong covers not only fondness but also “hateful jeong”, the attachment that stays even through conflict.',
      ],
      [
        '이처럼 정은 개인보다 관계를 중시해 온 한국 문화의 특징을 잘 보여 준다.',
        'In this way jeong shows a feature of Korean culture, which has valued relationships over the individual.',
      ],
      [
        '다만 급격한 도시화와 개인주의의 확산으로 정의 의미도 조금씩 달라지고 있다.',
        'However, with rapid urbanisation and the spread of individualism, what jeong means is slowly changing.',
      ],
    ],
    gloss: [
      ['정서', 'feelings, sentiment'], ['빼놓다', 'to leave out'], ['개념', 'concept'], ['쌓이다', 'to build up'],
      ['유대감', 'bond'], ['가리키다', 'to refer to'], ['단골', 'regular (customer, shop)'], ['덤', 'a little extra for free'],
      ['엿보다', 'to catch a glimpse of'], ['미운 정', 'attachment despite dislike'], ['중시하다', 'to value highly'],
      ['급격하다', 'to be rapid'], ['확산', 'spread'],
    ],
    qs: [
      [
        'How does jeong form, according to the text?',
        ['Through money', 'Naturally over a long time together', 'At the first meeting', 'Only within families'], 1,
      ],
      [
        'What is changing the meaning of jeong?',
        ['Television', 'Urbanisation and individualism', 'The weather', 'Foreign food'], 1,
      ],
    ],
  },
  {
    id: 'library', level: 1, title: '도서관 이용 안내', en: 'Library notice', skip: ['시'],
    lines: [
      ['도서관 이용 안내', 'Library information'],
      ['도서관은 월요일부터 금요일까지 문을 열어요.', 'The library is open from Monday to Friday.'],
      ['오전 아홉 시부터 오후 여섯 시까지예요.', 'It is open from 9 a.m. to 6 p.m.'],
      ['토요일과 일요일에는 문을 닫아요.', 'It is closed on Saturdays and Sundays.'],
      ['도서관에서 음식을 먹으면 안 돼요.', 'You must not eat food in the library.'],
      ['책은 일주일 동안 빌릴 수 있어요.', 'You can borrow books for one week.'],
    ],
    gloss: [
      ['이용', 'use'], ['안내', 'information, guide'], ['문을 열다', 'to open (a shop, building)'], ['닫다', 'to close'],
      ['-면 안 되다', 'must not'], ['동안', 'for (a length of time)'], ['아홉 시', 'nine o’clock'], ['-ㄹ 수 있다', 'can'],
    ],
    qs: [
      ['When is the library closed?', ['On Mondays', 'On Fridays', 'On Saturdays and Sundays', 'Every evening'], 2],
      ['What time does the library open?', ['8 a.m.', '9 a.m.', '10 a.m.', '6 p.m.'], 1],
      ['How long can you borrow a book?', ['One day', 'Three days', 'One week', 'One month'], 2],
    ],
  },
  {
    id: 'message', level: 1, title: '친구의 문자', en: 'A text from a friend', skip: ['시'],
    lines: [
      ['민지 씨, 저 수진이에요.', 'Minji, it’s Sujin.'],
      ['내일 같이 점심 먹어요.', 'Let’s have lunch together tomorrow.'],
      ['학교 앞 식당에서 열두 시에 만나요.', 'Let’s meet at the restaurant in front of the school at twelve.'],
      ['그 식당은 비빔밥이 아주 맛있어요.', 'The bibimbap at that restaurant is very good.'],
      ['점심은 제가 살게요.', 'Lunch is on me.'],
      ['시간이 있으면 전화해 주세요.', 'If you have time, please call me.'],
    ],
    gloss: [
      ['문자', 'text message'], ['씨', '(polite title after a name)'], ['앞', 'in front of'], ['열두 시', 'twelve o’clock'],
      ['살게요', 'I’ll pay (my treat)'], ['-ㄹ게요', 'I will (promise)'], ['-아/어 주세요', 'please (do for me)'],
    ],
    qs: [
      [
        'Where will they meet?',
        ['At a café', 'At a restaurant in front of the school', 'At Sujin’s home', 'At the station'], 1,
      ],
      ['What time will they meet?', ['Eleven', 'Twelve', 'One', 'Two'], 1],
      ['Who will pay for lunch?', ['Minji', 'Sujin', 'They will split it', 'It doesn’t say'], 1],
    ],
  },
  {
    id: 'bakery', level: 2, title: '빵집 광고', en: 'A bakery ad', skip: ['시', '개'],
    lines: [
      ['행복 빵집이 새로 문을 열었습니다!', 'Happy Bakery has just opened!'],
      ['이번 주 금요일까지 모든 빵을 삼십 퍼센트 할인해 드립니다.', 'Until this Friday, all bread is thirty percent off.'],
      ['빵을 다섯 개 이상 사시면 우유 한 병을 드립니다.', 'If you buy five or more pieces of bread, we’ll give you a bottle of milk.'],
      ['아침 일곱 시부터 밤 열 시까지 영업합니다.', 'We are open from 7 a.m. to 10 p.m.'],
      ['매주 화요일은 쉽니다.', 'We are closed every Tuesday.'],
      ['지하철역 이 번 출구 바로 앞에 있습니다.', 'We are right in front of Exit 2 of the subway station.'],
    ],
    gloss: [
      ['빵집', 'bakery'], ['새로', 'newly'], ['모든', 'all, every'], ['퍼센트', 'percent'], ['할인하다', 'to give a discount'],
      ['-아/어 드리다', 'to do for you (humble)'], ['다섯 개', 'five (items)'], ['이상', 'or more'], ['병', 'bottle'],
      ['일곱 시', 'seven o’clock'], ['영업하다', 'to be open for business'], ['바로', 'right, directly'],
    ],
    qs: [
      [
        'What do you get if you buy five pieces of bread?',
        ['A free coffee', 'A bottle of milk', 'A cake', 'Half price'], 1,
      ],
      ['When is the bakery closed?', ['On Mondays', 'On Tuesdays', 'At the weekend', 'On Fridays'], 1],
      ['Until when is the discount?', ['Today only', 'This Friday', 'The end of the month', 'Next Tuesday'], 1],
    ],
  },
  {
    id: 'email', level: 2, title: '선생님께 보내는 이메일', en: 'An email to the teacher',
    lines: [
      ['김 선생님, 안녕하세요.', 'Hello, Ms Kim.'],
      ['저는 한국어 초급반 학생 마이클입니다.', 'I’m Michael, a student in the beginner Korean class.'],
      ['감기에 걸려서 내일 수업에 못 갈 것 같습니다.', 'I’ve caught a cold, so I don’t think I can come to class tomorrow.'],
      ['죄송하지만 숙제는 이메일로 보내도 될까요?', 'I’m sorry, but may I send my homework by email?'],
      ['다음 주 월요일에는 꼭 가겠습니다.', 'I will definitely come next Monday.'],
      ['마이클 올림', 'From Michael'],
    ],
    gloss: [
      ['이메일', 'email'], ['초급반', 'beginner class'], ['감기에 걸리다', 'to catch a cold'], ['-아서/어서', 'so, because'],
      ['못', 'cannot'], ['-ㄹ 것 같다', 'I think (it will)'], ['죄송하다', 'to be sorry'],
      ['-아도/어도 되다', 'may, to be allowed to'], ['올림', '(sign-off) respectfully yours'],
    ],
    qs: [
      ['Why can’t Michael go to class?', ['He has a cold', 'He is travelling', 'He has to work', 'He overslept'], 0],
      [
        'What does he ask the teacher?',
        ['To change his class', 'If he can send his homework by email', 'For a new textbook', 'To meet after class'], 1,
      ],
      ['When will he come back to class?', ['Tomorrow', 'This Friday', 'Next Monday', 'Next month'], 2],
    ],
  },
  {
    id: 'elevator', level: 3, title: '엘리베이터 점검 안내', en: 'Lift inspection notice', skip: ['시'],
    lines: [
      ['엘리베이터 점검 안내', 'Notice: lift inspection'],
      ['주민 여러분께 알려 드립니다.', 'We would like to inform all residents.'],
      [
        '다음 주 수요일 오전 열 시부터 오후 두 시까지 엘리베이터 점검이 있을 예정입니다.',
        'The lift will be inspected next Wednesday from 10 a.m. to 2 p.m.',
      ],
      [
        '점검 시간 동안에는 엘리베이터를 이용하실 수 없으니 계단을 이용해 주시기 바랍니다.',
        'You cannot use the lift during the inspection, so please use the stairs.',
      ],
      [
        '무거운 짐을 옮기실 분은 점검 전날까지 관리 사무소에 연락해 주십시오.',
        'If you need to move anything heavy, please contact the management office by the day before.',
      ],
      ['불편을 드려서 죄송합니다.', 'We apologise for the inconvenience.'],
    ],
    gloss: [
      ['점검', 'inspection'], ['안내', 'notice, information'], ['주민', 'resident'], ['여러분', 'everyone'],
      ['알리다', 'to inform'], ['열 시', 'ten o’clock'], ['예정', 'plan, schedule'], ['이용하다', 'to use'],
      ['-(으)니', 'so, since'], ['계단', 'stairs'], ['-기 바라다', 'to hope (polite request)'], ['전날', 'the day before'],
      ['관리 사무소', 'management office'], ['연락하다', 'to contact'], ['불편', 'inconvenience'],
    ],
    qs: [
      ['How long will the inspection last?', ['Two hours', 'Four hours', 'All day', 'Two days'], 1],
      [
        'What should residents use during the inspection?',
        ['The stairs', 'The other lift', 'The lift in the next building', 'Nothing, they should stay home'], 0,
      ],
      [
        'Who should contact the management office?',
        ['Every resident', 'People who need to move heavy things', 'Older residents', 'New residents'], 1,
      ],
    ],
  },
  {
    id: 'festival', level: 3, title: '세계 음식 축제', en: 'World food festival', skip: ['시', '개'],
    lines: [
      ['이번 주말 한강 공원에서 세계 음식 축제가 열린다.', 'This weekend a world food festival will be held at Hangang Park.'],
      ['축제에서는 스무 개 나라의 전통 음식을 맛볼 수 있다.', 'At the festival you can taste traditional food from twenty countries.'],
      ['입장료는 없지만 음식값은 따로 내야 한다.', 'There is no entry fee, but you have to pay for the food separately.'],
      ['행사는 토요일과 일요일 오전 열한 시부터 저녁 여덟 시까지 진행된다.', 'The event runs on Saturday and Sunday from 11 a.m. to 8 p.m.'],
      [
        '주최 측은 주차 공간이 부족하니 대중교통을 이용해 달라고 부탁했다.',
        'The organisers asked visitors to use public transport, as parking is limited.',
      ],
      ['비가 오면 축제는 다음 주로 연기된다.', 'If it rains, the festival will be put off until next week.'],
    ],
    gloss: [
      ['열리다', 'to be held'], ['스무 개', 'twenty (of them)'], ['나라', 'country'], ['입장료', 'entry fee'],
      ['음식값', 'the price of food'], ['따로', 'separately'], ['행사', 'event'], ['열한 시', 'eleven o’clock'],
      ['진행되다', 'to be held, to go on'], ['주최 측', 'the organisers'], ['주차', 'parking'], ['공간', 'space'],
      ['대중교통', 'public transport'], ['-아/어 달라고 하다', 'to ask (someone) to do'], ['연기되다', 'to be postponed'],
    ],
    qs: [
      ['What do visitors have to pay for?', ['Entry', 'The food', 'Parking', 'Nothing'], 1],
      [
        'Why are visitors asked to use public transport?',
        ['Parking is limited', 'Buses are free that day', 'The roads are closed', 'It is cheaper'], 0,
      ],
      [
        'What happens if it rains?',
        ['It moves indoors', 'It is put off until next week', 'It is cancelled', 'It ends early'], 1,
      ],
    ],
  },
  {
    id: 'courses', level: 4, title: '문화 센터 겨울 강좌', en: 'Winter classes at the culture centre', skip: ['시', '달', '별'],
    lines: [
      ['시민 문화 센터 겨울 강좌 안내', 'City Culture Centre: winter classes'],
      [
        '시민 문화 센터에서는 겨울 방학을 맞아 다양한 강좌를 개설합니다.',
        'For the winter holidays, the City Culture Centre is opening a range of classes.',
      ],
      [
        '요리 교실은 매주 화요일과 목요일 저녁 일곱 시에, 사진 교실은 토요일 오전 열 시에 진행됩니다.',
        'The cooking class runs every Tuesday and Thursday at 7 p.m., and the photography class on Saturdays at 10 a.m.',
      ],
      [
        '수강료는 강좌마다 한 달에 오만 원이며, 요리 교실은 재료비를 별도로 받습니다.',
        'Each class costs 50,000 won a month, and the cooking class charges separately for ingredients.',
      ],
      ['각 강좌는 열다섯 명까지 선착순으로 모집합니다.', 'Each class takes up to fifteen people, first come, first served.'],
      ['신청은 이번 달 말까지 홈페이지나 전화로 하실 수 있습니다.', 'You can sign up on the website or by phone until the end of this month.'],
    ],
    gloss: [
      ['문화 센터', 'culture centre'], ['강좌', 'course, class'], ['맞다', 'to welcome, to mark (an occasion)'],
      ['개설하다', 'to open (a course)'], ['일곱 시', 'seven o’clock'], ['진행되다', 'to be held'], ['수강료', 'course fee'],
      ['-마다', 'each, every'], ['한 달', 'a month'], ['재료비', 'cost of ingredients'], ['별도로', 'separately'], ['각', 'each'],
      ['선착순', 'first come, first served'], ['모집하다', 'to recruit'], ['신청', 'application'],
      ['말', 'the end (of a period)'], ['홈페이지', 'website'],
    ],
    qs: [
      [
        'When is the photography class?',
        ['Tuesday evening', 'Thursday evening', 'Saturday morning', 'Sunday afternoon'], 2,
      ],
      ['What costs extra?', ['Ingredients for the cooking class', 'Renting a camera', 'Signing up', 'Parking'], 0],
      ['How are places in a class given out?', ['By lottery', 'First come, first served', 'By interview', 'By age'], 1],
    ],
  },
  {
    id: 'phones', level: 5, title: '어린이와 스마트폰', en: 'Children and smartphones', skip: ['바람'],
    lines: [
      [
        '요즘은 초등학생은 물론이고 유치원생까지 스마트폰을 사용하는 경우가 흔하다.',
        'These days it is common for not only primary school children but even kindergartners to use smartphones.',
      ],
      [
        '부모들은 아이의 안전을 확인하기 위해서라도 스마트폰이 필요하다고 주장한다.',
        'Parents argue that a smartphone is needed, if only to check that their child is safe.',
      ],
      [
        '그러나 나는 어린 나이에 스마트폰을 지나치게 사용하는 것은 바람직하지 않다고 생각한다.',
        'However, I think using a smartphone too much at a young age is not desirable.',
      ],
      [
        '화면을 오래 보면 시력이 나빠질 뿐만 아니라 친구들과 직접 어울리는 시간도 줄어들기 때문이다.',
        'Looking at a screen for a long time not only harms your eyesight but also cuts the time spent with friends in person.',
      ],
      [
        '물론 무조건 금지하기보다는 사용 시간과 규칙을 아이와 함께 정하는 것이 현실적이다.',
        'Of course, rather than banning it outright, it is more realistic to set the hours and rules together with the child.',
      ],
      [
        '결국 부모가 먼저 모범을 보이는 것이 가장 효과적인 교육일 것이다.',
        'In the end, parents setting an example first is probably the most effective education.',
      ],
    ],
    gloss: [
      ['초등학생', 'primary school pupil'], ['-은/는 물론이고', 'not to mention'], ['유치원생', 'kindergartner'], ['경우', 'case'],
      ['흔하다', 'to be common'], ['-기 위해서라도', 'if only in order to'], ['지나치게', 'too much, excessively'], ['화면', 'screen'],
      ['시력', 'eyesight'], ['-ㄹ 뿐만 아니라', 'not only ... but also'], ['어울리다', 'to spend time with, mix'],
      ['줄어들다', 'to decrease'], ['무조건', 'unconditionally'], ['금지하다', 'to ban'], ['정하다', 'to decide, set'],
      ['현실적', 'realistic'], ['모범을 보이다', 'to set an example'], ['효과적', 'effective'],
    ],
    qs: [
      [
        'Why do parents say children need smartphones?',
        ['To check that they are safe', 'To study', 'To play games', 'To save money'], 0,
      ],
      [
        'What is the writer’s opinion?',
        [
          'Smartphones should be banned completely', 'Too much use at a young age is not desirable',
          'Smartphones are always good for children', 'Schools should decide',
        ],
        1,
      ],
      [
        'What does the writer suggest instead of a ban?',
        [
          'Setting hours and rules together with the child', 'Buying cheaper phones', 'Collecting phones at school',
          'Using phones only at the weekend',
        ],
        0,
      ],
    ],
  },
];

// ---------------- Dialogues for role-play: [speaker A or B, Korean, English] ----------------
const DIALOGUES = [
  {
    id: 'order', level: 1, title: '카페에서 주문하기', en: 'Ordering at a café', a: 'Barista', b: 'Customer',
    lines: [
      ['A', '어서 오세요. 뭐 드릴까요?', 'Welcome. What can I get you?'],
      ['B', '아이스 아메리카노 한 잔 주세요.', 'One iced americano, please.'],
      ['A', '사이즈는 어떻게 해 드릴까요?', 'What size would you like?'],
      ['B', '큰 사이즈로 주세요.', 'A large one, please.'],
      ['A', '여기서 드세요, 가져가세요?', 'For here or to go?'],
      ['B', '가져갈게요. 얼마예요?', 'To go. How much is it?'],
      ['A', '오천 원입니다.', 'That’s 5,000 won.'],
      ['B', '여기 있어요. 감사합니다.', 'Here you are. Thank you.'],
    ],
  },
  {
    id: 'meet', level: 1, title: '처음 만났을 때', en: 'Meeting someone new', a: 'Jisu', b: 'You',
    lines: [
      ['A', '안녕하세요. 저는 지수예요. 이름이 뭐예요?', 'Hello, I’m Jisu. What’s your name?'],
      ['B', '안녕하세요. 저는 마이클이에요.', 'Hello, I’m Michael.'],
      ['A', '어느 나라 사람이에요?', 'Where are you from?'],
      ['B', '미국 사람이에요.', 'I’m American.'],
      ['A', '한국에 언제 왔어요?', 'When did you come to Korea?'],
      ['B', '작년에 왔어요. 지금 한국어를 배우고 있어요.', 'Last year. I’m learning Korean now.'],
      ['A', '한국어를 정말 잘하시네요!', 'Your Korean is really good!'],
      ['B', '아니에요. 아직 많이 부족해요.', 'Not at all. I still have a lot to learn.'],
    ],
  },
  {
    id: 'way', level: 2, title: '길 묻기', en: 'Asking the way', a: 'Traveller', b: 'Local',
    lines: [
      ['A', '실례합니다. 지하철역이 어디에 있어요?', 'Excuse me. Where is the subway station?'],
      ['B', '저기 은행 보이세요?', 'Do you see the bank over there?'],
      ['A', '네, 보여요.', 'Yes, I see it.'],
      ['B', '은행 앞에서 오른쪽으로 가세요.', 'At the bank, turn right.'],
      ['A', '여기서 멀어요?', 'Is it far from here?'],
      ['B', '아니요, 걸어서 오 분쯤 걸려요.', 'No, it’s about five minutes on foot.'],
      ['A', '정말 감사합니다.', 'Thank you so much.'],
      ['B', '천만에요.', 'You’re welcome.'],
    ],
  },
  {
    id: 'plans', level: 2, title: '약속 잡기', en: 'Making plans', a: 'Friend', b: 'You',
    lines: [
      ['A', '이번 주말에 시간 있어요?', 'Are you free this weekend?'],
      ['B', '토요일은 바쁘고 일요일은 괜찮아요.', 'I’m busy on Saturday, but Sunday is fine.'],
      ['A', '그럼 일요일에 같이 영화 볼까요?', 'Then shall we see a movie together on Sunday?'],
      ['B', '좋아요. 몇 시에 만날까요?', 'Sounds good. What time shall we meet?'],
      ['A', '두 시 어때요?', 'How about two o’clock?'],
      ['B', '좋아요. 어디에서 만나요?', 'Good. Where shall we meet?'],
      ['A', '극장 앞에서 만나요.', 'Let’s meet in front of the cinema.'],
      ['B', '네, 그때 봐요!', 'Okay, see you then!'],
    ],
  },
  {
    id: 'interview', level: 3, title: '면접', en: 'A job interview', a: 'Interviewer', b: 'You',
    lines: [
      ['A', '안녕하세요. 자기소개를 해 주세요.', 'Hello. Please introduce yourself.'],
      ['B', '안녕하세요. 저는 대학교에서 경영학을 전공한 김민수입니다.', 'Hello. I’m Kim Minsu, and I majored in business at university.'],
      ['A', '우리 회사에 지원한 이유가 뭐예요?', 'Why did you apply to our company?'],
      [
        'B', '이 회사의 제품을 오래 사용해 왔고, 마케팅 일을 꼭 해 보고 싶었습니다.',
        'I’ve used your products for a long time, and I really wanted to work in marketing.',
      ],
      ['A', '본인의 장점은 무엇이라고 생각해요?', 'What do you think your strengths are?'],
      ['B', '책임감이 강하고 다른 사람들과 잘 협력하는 편입니다.', 'I’m very responsible, and I tend to work well with others.'],
      ['A', '마지막으로 하고 싶은 말이 있어요?', 'Finally, is there anything you’d like to say?'],
      ['B', '기회를 주신다면 열심히 배우면서 최선을 다하겠습니다.', 'If you give me the chance, I’ll learn as much as I can and do my best.'],
    ],
  },
  {
    id: 'doctor', level: 4, title: '병원에서', en: 'At the doctor’s', a: 'Doctor', b: 'Patient',
    lines: [
      ['A', '어디가 불편해서 오셨어요?', 'What brings you in today?'],
      ['B', '사흘 전부터 기침이 나고 목이 많이 아파요.', 'I’ve had a cough and a very sore throat for three days.'],
      ['A', '열은 없으세요?', 'Do you have a fever?'],
      ['B', '어젯밤에 열이 좀 났는데 지금은 괜찮아요.', 'I had a slight fever last night, but I’m fine now.'],
      ['A', '목이 많이 부었네요. 목감기인 것 같습니다.', 'Your throat is quite swollen. It looks like a throat infection.'],
      ['B', '약을 먹으면 금방 나을까요?', 'Will I get better quickly if I take medicine?'],
      [
        'A', '네, 약을 드시고 물을 자주 마시면 일주일 안에 좋아질 거예요.',
        'Yes. Take the medicine and drink water often, and you’ll be better within a week.',
      ],
      ['B', '알겠습니다. 감사합니다, 선생님.', 'I see. Thank you, doctor.'],
    ],
  },
  {
    id: 'landlord', level: 5, title: '집주인과의 통화', en: 'Calling the landlord', a: 'Landlord', b: 'Tenant',
    lines: [
      ['A', '여보세요, 302호 맞으시죠? 무슨 일로 전화하셨어요?', 'Hello, this is flat 302, right? What can I do for you?'],
      [
        'B', '네, 다름이 아니라 욕실 천장에서 물이 새서 연락드렸습니다.',
        'Yes. I’m calling because water is leaking from the bathroom ceiling.',
      ],
      ['A', '아, 그래요? 언제부터 그랬어요?', 'Oh, really? Since when?'],
      ['B', '그저께 비가 많이 온 뒤부터 계속 새고 있어요.', 'It has been leaking ever since the heavy rain the day before yesterday.'],
      [
        'A', '위층에 문제가 생긴 것 같네요. 내일 오전에 수리 기사를 보내 드릴게요.',
        'It sounds like a problem upstairs. I’ll send a repair person tomorrow morning.',
      ],
      ['B', '제가 출근해야 해서 오후에 와 주시면 안 될까요?', 'I have to go to work. Could they come in the afternoon instead?'],
      ['A', '그럼 오후 여섯 시 이후로 시간을 맞춰 볼게요.', 'Then I’ll try to arrange it for after six in the evening.'],
      ['B', '신경 써 주셔서 감사합니다.', 'Thank you for taking care of it.'],
    ],
  },
  {
    id: 'debate', level: 6, title: '토론: 대학 등록금', en: 'Debate: university fees', a: 'Speaker 1', b: 'Speaker 2',
    lines: [
      ['A', '저는 대학 등록금을 국가가 전액 지원해야 한다고 생각합니다.', 'I believe the state should pay university fees in full.'],
      [
        'B', '취지는 이해하지만, 재정 부담을 고려하면 현실적이지 않다고 봅니다.',
        'I understand the idea, but given the cost to the state, I don’t think it’s realistic.',
      ],
      [
        'A', '교육은 개인의 문제가 아니라 사회 전체의 미래에 대한 투자입니다.',
        'Education isn’t a private matter; it’s an investment in the future of the whole society.',
      ],
      [
        'B', '그렇다면 모든 학생에게 똑같이 지원하기보다 형편이 어려운 학생에게 집중하는 것이 더 효율적이지 않을까요?',
        'Then wouldn’t it be more efficient to focus on students who struggle financially, rather than funding everyone equally?',
      ],
      [
        'A', '선별적으로 지원하면 오히려 낙인 효과가 생길 수 있다는 우려도 있습니다.',
        'Some worry that selective support could actually stigmatise those students.',
      ],
      ['B', '그 점은 제도를 세밀하게 설계해서 충분히 보완할 수 있다고 생각합니다.', 'I think careful design of the system can deal with that.'],
      [
        'A', '결국 핵심은 누구도 경제적인 이유로 배움을 포기하지 않는 사회를 만드는 것이겠네요.',
        'In the end, the key is a society where nobody gives up on learning for financial reasons.',
      ],
      ['B', '네, 그 목표에는 저도 전적으로 동의합니다.', 'Yes, I fully agree with that goal.'],
    ],
  },
];

// The whole Korean text of a story
const storyText = story => story.lines.map(line => line[0]).join(' ');
// app words in a story (they open the word sheet), and the glossary words that are not app words
const storyWords = story => PD.findWords(storyText(story)).filter(w => !(story.skip || []).includes(w.ch));
const storyGloss = story => story.gloss.filter(([ko]) => !PD.VOCAB.some(w => w.ch === ko));

// Splits a CSV line at its first , or ; outside quotes, so a quoted cell may contain commas:
// "책, 공책","book, notebook" gives ['"책, 공책"', '"book, notebook"']. The rest stays whole (meanings may have commas).
function splitFirstCsvCell(line) {
  let insideQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') insideQuotes = !insideQuotes; // "" inside a quoted cell toggles twice
    else if (!insideQuotes && (char === ',' || char === ';')) return [line.slice(0, i), line.slice(i + 1)];
  }
  return [line];
}

// One cell of an imported word list as plain text: HTML tags and &nbsp; become spaces, CSV quotes are undone
function cleanWordListCell(cell) {
  return cell
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/^"|"$/g, '')
    .replace(/""/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// My words import (Words › My words): CSV / TSV / Anki plain-text export, one "Korean, meaning" per line.
// The file comes from outside the app: only plain text is kept (HTML tags dropped, lengths capped).
// Returns [[korean, meaning], ...], each Korean word once.
function parseWordList(text) {
  const words = [];
  const seen = new Set();
  for (const rawLine of String(text).split(/\r?\n/).slice(0, 5000)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue; // blank, or an Anki header such as #separator:tab
    // a tab-separated line, or a split at the first , or ; outside quotes (the meaning may contain more commas)
    const rawCells = line.includes('\t') ? line.split('\t') : splitFirstCsvCell(line);
    const cells = rawCells.map(cleanWordListCell).filter(Boolean);
    if (cells.length < 2) continue;
    const koreanIndex = cells.findIndex(cell => /[가-힣]/.test(cell));
    if (koreanIndex < 0) continue;
    const korean = cells[koreanIndex].slice(0, 40);
    // the meaning: the first other cell without Hangul, else just the first other cell
    const meaningCell = cells.find((cell, i) => i !== koreanIndex && !/[가-힣]/.test(cell))
      || cells[koreanIndex ? 0 : 1];
    const meaning = meaningCell.slice(0, 80);
    if (!meaning || seen.has(korean)) continue;
    seen.add(korean);
    words.push([korean, meaning]);
  }
  return words;
}

// Hanja (Chinese-character) roots: words that share a root share part of their meaning.
// Only same-character words are listed (학교 and 교회 both have 교, but different characters: 校 school, 敎 teach).
// Every word here is in the vocabulary (tools/check.js).
// [character, Korean reading, meaning, the words that use it]
const HANJA = [
  ['學', '학', 'study', '학교 대학교 학생 방학 입학 장학금 학기 학원 문학 과학 철학'],
  ['生', '생', 'life, birth', '학생 선생님 생일 생선 동생 생산 생물 사생활 생태계'],
  ['國', '국', 'country', '한국 외국 국회'],
  ['局', '국', 'office', '우체국 약국'],
  ['校', '교', 'school', '학교 대학교'],
  ['敎', '교', 'teach, religion', '교회 교실 교과서 교육 교수 사교육 유교 불교'],
  ['交', '교', 'exchange, cross', '교환 교통 외교'],
  ['會', '회', 'meet, gathering', '회사 교회 회의 회의실 사회 전시회 국회'],
  ['社', '사', 'company, society', '회사 사회 사장'],
  ['院', '원', 'institution', '병원 학원'],
  ['室', '실', 'room', '화장실 교실 회의실'],
  ['文', '문', 'writing, culture', '문법 문화 문학 논문 문화재 다문화'],
  ['問', '문', 'ask', '질문 문제'],
  ['化', '화', 'change, -ization', '문화 문화재 온난화 고령화 세계화 민주화 양극화 다문화'],
  ['話', '화', 'speak', '전화 대화'],
  ['畫', '화', 'picture', '영화 화가'],
  ['火', '화', 'fire', '화요일 화산'],
  ['水', '수', 'water', '수요일 수영 홍수'],
  ['金', '금', 'gold, money', '금요일 현금 보증금 세금 장학금 등록금 금리'],
  ['日', '일', 'day, sun', '일요일 생일 매일 내일'],
  ['子', '자', 'person, thing', '남자 여자 의자 모자'],
  ['者', '자', 'someone who', '환자 피해자 소비자'],
  ['自', '자', 'self', '자전거 자연 자존감'],
  ['動', '동', 'move', '운동 동물 동기'],
  ['同', '동', 'same, together', '동생 동료 공동체'],
  ['氣', '기', 'air, energy', '감기 기온 기후'],
  ['機', '기', 'machine', '비행기 청소기 세탁기'],
  ['政', '정', 'govern', '정부 정책 정치 정당'],
  ['空', '공', 'empty, air', '공항 공책'],
  ['公', '공', 'public', '공원 공공 공연'],
  ['場', '장', 'place', '시장 극장 정류장 주차장 직장'],
  ['醬', '장', 'sauce', '간장 고추장 된장'],
  ['物', '물', 'thing', '선물 박물관 물가 동물 생물'],
  ['行', '행', 'go, travel', '은행 비행기 여행'],
  ['旅', '여', 'travel', '여행 여권'],
  ['館', '관', 'hall, building', '도서관 박물관'],
  ['觀', '관', 'view, outlook', '관광 관객 관점 고정관념 객관성 역사관'],
  ['書', '서', 'book, document', '도서관 교과서 계약서'],
  ['外', '외', 'outside', '외국 외교 소외감'],
  ['出', '출', 'go out', '출구 출근 수출 지출 출석 매출 저출산 대출'],
  ['入', '입', 'enter', '입구 수입 입학'],
  ['家', '가', 'house, expert', '가족 가구 가계 작가 화가'],
  ['發', '발', 'start, send out', '발음 발전 발표 발견 발명'],
  ['經', '경', 'manage, pass through', '경제 경험 경영'],
  ['約', '약', 'promise, agreement', '약속 예약 계약 계약서 조약'],
  ['市', '시', 'city, market', '시장 시민 도시'],
  ['時', '시', 'time', '시간 시계'],
  ['山', '산', 'mountain', '산 등산 화산'],
  ['車', '차', 'vehicle', '기차 주차장'],
  ['男', '남', 'man', '남자 남편'],
  ['大', '대', 'big', '대학교 대통령 대체로'],
].map(([han, ko, en, words]) => ({han, ko, en, words: words.split(' ')}));
// The hanja roots a word belongs to, leaving out roots that have no other word
const familiesOf = ch => HANJA.filter(h => h.words.includes(ch) && h.words.length > 1);

// Every answer and example gets a recorded clip: add them to RECORDED (in this order) unless already there.
const RECORDED_SET = new Set(PD.RECORDED);
const PRACTICE_CLIP_TEXTS = [
  ...NUM_ITEMS.map(item => item.ko),
  ...VERBS.flatMap(v => formsFor(v.ch).map(form => conj(v.ch, form))),
  ...NOUNS.flatMap(n => Object.keys(PARTICLES).map(kind => withParticle(n.ch, kind))),
  ...DIALOGUES.flatMap(dialogue => dialogue.lines.map(line => line[1])),
  ...SOUNDS.flatMap(sound => sound.ex.map(example => example[0])),
  ...CASUAL.flatMap(pair => [pair[0], pair[1]]),
  ...STORIES.flatMap(story => story.lines.map(line => line[0])),
];
for (const text of PRACTICE_CLIP_TEXTS) {
  if (RECORDED_SET.has(text)) continue;
  RECORDED_SET.add(text);
  PD.RECORDED.push(text);
}

if (typeof module !== 'undefined') {
  module.exports = {
    HANJA, familiesOf, parseWordList, sino, native, month, NUM_TYPES, NUM_ITEMS, irrOf, aeo, conj, verbWrongs,
    VERB_FORMS, formsFor, VERBS, PARTICLES, withParticle, wrongParticle, NOUNS, DIALOGUES, IRR_NOTE, SOUNDS, CASUAL,
    STORIES, storyText, storyWords, storyGloss,
  };
}
