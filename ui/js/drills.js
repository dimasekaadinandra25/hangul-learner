// Practice page: quick drills (numbers, verb endings, particles, sound changes, tricky words, replies, sound pairs,
// casual Korean), graded reading (stories) and role-play conversations. The content lives in practice-data.js.
//
// Needs from earlier scripts: shuffle and pickOne (lesson.js); esc, lsGet, lsSet, openWord, addToNotebook,
// removeFromNotebook, inNotebook, recordClip, playUrl, speak, sfx, save, toast, icon, seal and the rest of the main
// script's helpers; the practice data (NUM_ITEMS, VERBS, PARTICLES, SOUNDS, CASUAL, STORIES, DIALOGUES, ...).
//
// Provides: renderPractice (draws the page), the running question DQ and the page settings PX, drillStats,
// missList, the question builders (numQ, verbQ, ... in BUILD), the story/conversation audio (sAudio, sQueue,
// playLine, sayLine, stopHearAll, WORD_TIMES) and the conversation state TK.

let PT = lsGet('ptab', 'num'); // open tab
let DQ = null; // current drill question
// Page settings: the filter chips of each drill, Mistakes mode, Slow audio, the open story and its answers
const PX = {
  casGroup: 'all',
  casMode: 'casual',
  numType: 'all',
  numMode: 'read',
  verbLevel: '1',
  verbForm: 'all',
  partType: 'all',
  miss: false,
  slow: false,
  sound: null,
  story: null,
  en: false,
  shown: new Set(),
  pick: {},
  checked: false,
};
// Right answers and tries of one drill kind, saved in the progress
const drillStats = kind => {
  P.drills ??= {};
  return P.drills[kind] ??= {right: 0, tries: 0};
};
const SLOW = 0.7; // "Slow" playback speed

// ---- Mistakes: a wrong answer keeps its question (ref) until you get it right in "Mistakes" mode ----
const missList = kind => {
  P.drillMiss ??= {};
  return P.drillMiss[kind] ??= [];
};
// Remembers a missed question; only the last 60 are kept
const addMiss = (kind, ref) => {
  const missed = missList(kind);
  if (!missed.includes(ref)) {
    missed.push(ref);
    if (missed.length > 60) missed.shift();
  }
};
// Forgets a question answered right; emptying the list in Mistakes mode counts as one "mistakes cleared"
const dropMiss = (kind, ref) => {
  const missed = missList(kind);
  if (!missed.includes(ref)) return;
  P.drillMiss[kind] = missed.filter(r => r !== ref);
  if (PX.miss && !P.drillMiss[kind].length) P.totals.missCleared = (P.totals.missCleared || 0) + 1;
};

// ---- Questions ----
// A builder returns {kind, ref, kicker, big, sub, say, listen, right, wrong (best first), note};
// makeQ turns it into up to 4 shuffled options.
const makeQ = question => {
  const wrongOptions = [...new Set(question.wrong)].filter(x => x && x !== question.right).slice(0, 3);
  const opts = shuffle([question.right, ...wrongOptions]);
  return {...question, opts, answer: opts.indexOf(question.right), picked: null};
};

// Each builder takes a ref (to repeat a missed question) or picks a new one from the current filters.

// Numbers: read a number, time, date or price aloud, or hear it and pick what was said
function numQ(ref) {
  let itemIndex;
  if (NUM_ITEMS[+ref]) {
    itemIndex = +ref;
  } else {
    const pool = NUM_ITEMS.filter(n => PX.numType === 'all' || n.type === PX.numType);
    itemIndex = NUM_ITEMS.indexOf(pickOne(pool));
  }
  const item = NUM_ITEMS[itemIndex];
  const numType = NUM_TYPES[item.type];
  const nearValues = shuffle(numType.near(item.val));
  if (PX.numMode === 'listen') {
    return makeQ({
      kind: 'num',
      ref: String(itemIndex),
      kicker: `${numType.label} · listening`,
      sub: 'Listen, then choose what you heard.',
      say: item.ko,
      listen: true,
      right: numType.show(item.val),
      wrong: nearValues.map(numType.show),
      note: `${numType.show(item.val)} = ${item.ko}. ${numType.note}`,
    });
  }
  const wrong = [...shuffle(numType.slips(item.val).filter(Boolean)), ...nearValues.map(numType.ko)];
  return makeQ({
    kind: 'num',
    ref: String(itemIndex),
    kicker: numType.label,
    big: numType.show(item.val),
    sub: `${numType.q} Choose how to say it.`,
    say: item.ko,
    ko: true,
    right: item.ko,
    wrong,
    note: numType.note,
  });
}

// Verb endings: conjugate a verb into the chosen ending (ref is "verb|form")
function verbQ(ref) {
  let verb;
  let form;
  if (ref) {
    const [stem, refForm] = ref.split('|');
    verb = VERBS.find(w => w.ch === stem);
    form = refForm;
  }
  if (!verb) {
    // With an ending chosen, only verbs that have it (있다/없다 words have no honorific)
    const pool = VERBS.filter(w => PX.verbLevel === 'all' || w.section === +PX.verbLevel);
    const fitting = PX.verbForm === 'all' ? pool : pool.filter(w => formsFor(w.ch).includes(PX.verbForm));
    verb = pickOne(fitting.length ? fitting : pool);
    const verbForms = formsFor(verb.ch);
    form = verbForms.includes(PX.verbForm) ? PX.verbForm : pickOne(verbForms);
  }
  const formInfo = VERB_FORMS[form];
  const irregular = irrOf(verb.ch);
  const right = conj(verb.ch, form);
  const otherForms = formsFor(verb.ch).filter(f => f !== form).map(f => conj(verb.ch, f));
  const wrong = [...shuffle(verbWrongs(verb.ch, form)), ...shuffle(otherForms)];
  return makeQ({
    kind: 'verb',
    ref: `${verb.ch}|${form}`,
    kicker: `${formInfo.label} · ${SECTIONS[verb.section].title}`,
    big: verb.ch,
    bigKo: true,
    sub: `${verb.meaning} → ${formInfo.ask}`,
    say: right,
    ko: true,
    right,
    wrong,
    note: (irregular ? IRR_NOTE[irregular] + ' ' : '') + formInfo.note,
  });
}

// Particles: pick the right form of a particle after a noun (ref is "noun|particle key")
function partQ(ref) {
  let noun;
  let particleKey;
  if (ref) [noun, particleKey] = ref.split('|');
  if (!NOUNS.some(n => n.ch === noun) || !PARTICLES[particleKey]) {
    noun = pickOne(NOUNS).ch;
    particleKey = PX.partType === 'all' ? pickOne(Object.keys(PARTICLES)) : PX.partType;
  }
  const particle = PARTICLES[particleKey];
  const nounWord = NOUNS.find(n => n.ch === noun);
  const otherParticles = shuffle(Object.keys(PARTICLES).filter(x => x !== particleKey))
    .slice(0, 2)
    .map(x => withParticle(noun, x));
  return makeQ({
    kind: 'part',
    ref: `${noun}|${particleKey}`,
    kicker: `${particle.label} · ${particle.name}`,
    big: noun,
    bigKo: true,
    sub: `“${nounWord.meaning}” + ${particle.name} (${particle.label}). Which is right?`,
    say: withParticle(noun, particleKey),
    ko: true,
    right: withParticle(noun, particleKey),
    wrong: [wrongParticle(noun, particleKey), ...otherParticles],
    note: particle.note,
  });
}

// Sound changes: how a written word is really said (ref is "rule id|example index")
function soundQ(ref) {
  let rule;
  let exampleIndex;
  if (ref) {
    const [ruleId, refIndex] = ref.split('|');
    rule = SOUNDS.find(s => s.id === ruleId);
    exampleIndex = +refIndex;
  }
  if (!rule?.ex[exampleIndex]) {
    const pool = PX.sound === 'all' || !PX.sound ? SOUNDS : SOUNDS.filter(x => x.id === PX.sound);
    rule = pickOne(pool);
    exampleIndex = Math.floor(Math.random() * rule.ex.length);
  }
  const [word, pronunciation, meaning, badPronunciation] = rule.ex[exampleIndex];
  return makeQ({
    kind: 'sound',
    ref: `${rule.id}|${exampleIndex}`,
    kicker: `${rule.ko} · ${rule.name}`,
    big: word,
    bigKo: true,
    sub: `“${meaning}”. How is it said?`,
    say: word,
    ko: true,
    right: `[${pronunciation}]`,
    wrong: [`[${word}]`, `[${badPronunciation}]`],
    note: rule.rule,
  });
}

// Tricky words: words you have missed 3+ times (and not mastered yet), with a hint to make them stick:
// their Hanja family, how they sound in romanization, and a look-alike word not to confuse them with.
const trickyWords = () => VOCAB.filter(word => {
  const stats = P.stats[word.ch];
  return stats && stats.tries - stats.right >= 3 && !isMastered(P, word.ch);
});
function trickyHint(word) {
  const family = familiesOf(word.ch)[0];
  const firstSyllable = [...word.ch][0];
  const lookAlike = VOCAB.find(v => v.ch !== word.ch && v.ch.startsWith(firstSyllable) && v.meaning !== word.meaning);
  const familyWords = family && family.words.filter(x => x !== word.ch).slice(0, 2).join(', ');
  const hints = [
    family && `${family.han} ${family.ko} = ${family.en}, as in ${familyWords}`,
    `sounds like “${romanize(word.ch)}”`,
    lookAlike && `not ${lookAlike.ch} (${lookAlike.meaning})`,
  ];
  return hints.filter(Boolean).join(' · ');
}
// The ref is the word itself; with no tricky words there is no question (null)
function trickyQ(ref) {
  const list = trickyWords();
  if (!list.length) return null;
  const avoidCurrent = list.length > 1 && DQ?.kind === 'tricky';
  const word = list.find(x => x.ch === ref) || pickOne(avoidCurrent ? list.filter(x => x.ch !== DQ.ref) : list);
  const stats = P.stats[word.ch];
  const otherMeanings = shuffle(VOCAB.filter(v => v.section === word.section && v.meaning !== word.meaning))
    .map(v => v.meaning);
  return makeQ({
    kind: 'tricky',
    ref: word.ch,
    kicker: `Tricky word · missed ${stats.tries - stats.right} times`,
    big: word.ch,
    bigKo: true,
    sub: 'Hint: ' + trickyHint(word),
    say: word.say,
    right: word.meaning,
    wrong: otherMeanings,
    note: `${word.ch} = ${word.meaning}. Get it right a few times and it leaves this list.`,
  });
}

// Reply (TOPIK listening): hear one line of a conversation, choose what the other person says next.
// Wrong options are replies from other conversations, the same level first.
// REPLIES holds every [dialogue, line index] whose next line is said by the other person.
const REPLIES = DIALOGUES.flatMap(dialogue => dialogue.lines
  .slice(0, -1)
  .map((line, i) => [dialogue, i])
  .filter(([, i]) => dialogue.lines[i][0] !== dialogue.lines[i + 1][0]));
function replyQ(ref) {
  const replyRef = ([dialogue, lineIndex]) => `${dialogue.id}|${lineIndex}`;
  const avoidCurrent = REPLIES.length > 1 && DQ?.kind === 'reply';
  const [dialogue, lineIndex] = REPLIES.find(entry => replyRef(entry) === ref)
    || pickOne(avoidCurrent ? REPLIES.filter(entry => replyRef(entry) !== DQ.ref) : REPLIES);
  const [, line, lineEnglish] = dialogue.lines[lineIndex];
  const [, reply, replyEnglish] = dialogue.lines[lineIndex + 1];
  const levelGap = entry => Math.abs(entry[0].level - dialogue.level);
  const otherReplies = REPLIES
    .filter(([other]) => other !== dialogue)
    .sort((a, b) => levelGap(a) - levelGap(b) || Math.random() - .5)
    .map(([other, k]) => other.lines[k + 1][1]);
  return makeQ({
    kind: 'reply',
    ref: `${dialogue.id}|${lineIndex}`,
    kicker: `${dialogue.en} · TOPIK ${dialogue.level} · listening`,
    sub: 'Listen, then choose the best reply.',
    say: line,
    listen: true,
    ko: true,
    right: reply,
    wrong: shuffle(otherReplies.slice(0, 8)),
    note: `“${line}” = ${lineEnglish} → “${reply}” = ${replyEnglish}`,
  });
}

// Sound pairs: syllables learners mix up, all recorded. Hear one, pick it from its set.
const PAIRS = [
  ...[['가', '카', '까'], ['다', '타', '따'], ['바', '파', '빠'], ['자', '차', '짜'], ['사', '싸']].map(s => ({
    s,
    label: 'Plain · aspirated · tense',
    note: 'Plain (가) is soft, aspirated (카) comes with a puff of air, tense (까) is tight with no air at all.',
  })),
  ...[['어', '오', '우'], ['거', '고', '구'], ['버', '보', '부'], ['더', '도', '두']].map(s => ({
    s,
    label: 'ㅓ · ㅗ · ㅜ',
    note: 'ㅓ: mouth open, lips relaxed. ㅗ: lips rounded. ㅜ: lips rounded and pushed forward, mouth almost closed.',
  })),
  {s: ['우', '으'], label: 'ㅜ · ㅡ', note: 'ㅜ has rounded lips; ㅡ keeps the lips flat, as in a small smile.'},
  {s: ['이', '에'], label: 'ㅣ · ㅔ', note: 'ㅣ is like “ee”; ㅔ is like the “e” in “bed”, the mouth a little more open.'},
];

// Casual vs textbook: how people really talk. Both ways: say a textbook form the casual way, or read a casual form.
const CAS_GROUPS = {short: 'Short forms', banmal: 'With friends', slang: 'Slang', written: 'Written vs spoken'};
// The ref is "CASUAL index|direction": c = textbook to casual, t = casual to textbook.
// A CASUAL entry is [textbook, casual, English, note, group].
function casualQ(ref) {
  let [index, direction] = (ref || '').split('|');
  index = +index;
  if (!CASUAL[index] || !'ct'.includes(direction || 'x')) {
    const pool = CASUAL.map((c, k) => k).filter(k => PX.casGroup === 'all' || CASUAL[k][4] === PX.casGroup);
    const avoidCurrent = pool.length > 1 && DQ?.kind === 'casual';
    index = pickOne(avoidCurrent ? pool.filter(k => k !== +DQ.ref.split('|')[0]) : pool);
    if (PX.casMode === 'mixed') direction = pickOne(['c', 't']);
    else if (PX.casMode === 'casual') direction = 'c';
    else direction = 't';
  }
  const [book, casual, english, note, group] = CASUAL[index];
  const toCasual = direction === 'c';
  const optionColumn = toCasual ? 1 : 0;
  // Other entries of the same group come first
  const others = shuffle(CASUAL.filter((c, k) => k !== index))
    .sort((a, b) => (b[4] === group) - (a[4] === group))
    .map(c => c[optionColumn]);
  const sub = toCasual
    ? `“${english}”. How do people say this casually?`
    : `“${english}”. What is this in textbook Korean?`;
  return makeQ({
    kind: 'casual',
    ref: `${index}|${direction}`,
    kicker: `${CAS_GROUPS[group]} · ${toCasual ? 'textbook → casual' : 'casual → textbook'}`,
    big: toCasual ? book : casual,
    bigKo: true,
    sub,
    say: toCasual ? casual : book,
    ko: true,
    right: toCasual ? casual : book,
    wrong: others,
    note: `${book} → ${casual}. ${note}`,
  });
}

// Sound pairs question; the ref is "PAIRS index|syllable index"
function pairQ(ref) {
  let [setIndex, syllableIndex] = (ref || '').split('|').map(Number);
  if (!PAIRS[setIndex]?.s[syllableIndex]) {
    setIndex = Math.floor(Math.random() * PAIRS.length);
    syllableIndex = Math.floor(Math.random() * PAIRS[setIndex].s.length);
  }
  const pair = PAIRS[setIndex];
  const syllable = pair.s[syllableIndex];
  return makeQ({
    kind: 'pair',
    ref: `${setIndex}|${syllableIndex}`,
    kicker: `${pair.label} · listening`,
    sub: 'Listen: which one do you hear?',
    say: syllable,
    listen: true,
    ko: true,
    right: syllable,
    wrong: pair.s.filter(x => x !== syllable),
    note: pair.note,
  });
}

// Question builder of each drill tab
const BUILD = {
  num: numQ,
  verb: verbQ,
  part: partQ,
  sound: soundQ,
  tricky: trickyQ,
  reply: replyQ,
  pair: pairQ,
  casual: casualQ,
};
// A new question of this kind; in Mistakes mode one of the missed ones (until none are left)
function newQ(kind) {
  if (PX.miss) {
    const missed = missList(kind);
    if (missed.length) {
      const avoidCurrent = missed.length > 1 && DQ?.kind === kind;
      return BUILD[kind](pickOne(avoidCurrent ? missed.filter(r => r !== DQ.ref) : missed));
    }
    PX.miss = false;
  }
  return BUILD[kind]();
}

// "Mistakes · n" chip, shown once there are mistakes (or while in Mistakes mode)
const missChip = kind => {
  const missCount = missList(kind).length;
  if (!missCount && !PX.miss) return '';
  const title = 'Practise the questions you got wrong until you get them right';
  return '<div class="chips" role="group" aria-label="Mistakes">'
    + `<button data-miss aria-pressed="${PX.miss}" title="${title}">${icon('rotate')}Mistakes · ${missCount}</button>`
    + '</div>';
};
const slowChip = () => `<button class="chip-slow" data-slow aria-pressed="${PX.slow}" `
  + `title="Play recordings at ${SLOW}× speed">${icon('clock')}Slow</button>`;

// The question card: prompt, options and, once answered, the feedback
function quizHtml(q) {
  const stats = drillStats(q.kind);
  const done = q.picked != null;
  const good = q.picked === q.answer;

  const percent = stats.tries ? ` · ${Math.round(stats.right / stats.tries * 100)}%` : '';
  const topRow = `<div class="drill-top"><span class="kicker">${esc(q.kicker)}${PX.miss ? ' · mistakes' : ''}</span>`
    + `<span class="muted">${stats.right} right${percent}</span></div>`;

  let bigText = '';
  if (q.big) {
    bigText = `<div class="drill-big${q.bigKo ? ' ko' : ''}" lang="${q.bigKo ? 'ko' : 'en'}">${esc(q.big)}</div>`;
  }

  let hearRow = '';
  if (q.listen || done) {
    const hearLabel = q.listen && !done ? 'Hear again' : 'Hear it';
    hearRow = `<div class="btn-row"><button class="btn" data-dsay>${icon('volume')}${hearLabel}</button>`
      + `<button class="btn" data-dslow title="Play at ${SLOW}× speed">${icon('clock')}Slowly</button></div>`;
  }

  const optionButton = (option, i) => {
    let stateClass = '';
    if (done && i === q.answer) stateClass = ' ok';
    else if (done && i === q.picked) stateClass = ' bad';
    const sizeClass = [...option].length > 8 ? 'sm' : 'md';
    return `<button class="opt${stateClass}" data-dopt="${i}"${done ? ' disabled' : ''}>`
      + `<span class="k">${i + 1}</span><b class="${q.ko ? 'ko ' : ''}${sizeClass}">${esc(option)}</b></button>`;
  };
  const options = `<div class="opts drill-opts">${q.opts.map(optionButton).join('')}</div>`;

  let feedback = '';
  if (done) {
    const verdict = good ? 'Right! +1 XP' : 'Not quite. Answer: ' + esc(q.opts[q.answer]);
    const savedNote = good ? '' : '<p class="muted">Saved to Mistakes: it comes back until you get it right.</p>';
    feedback = `<div class="drill-fb ${good ? 'good' : 'bad'}"><b>${verdict}</b><p>${esc(q.note)}</p>${savedNote}</div>`
      + '\n      '
      + `<div class="btn-row drill-next"><button class="btn btn-ink" data-dnext>Next${icon('arrow')}</button>`
      + '<span class="kbd-hint">1–4 choose · Enter next · R hear</span></div>';
  }

  const parts = [
    '<div class="panel drill" aria-live="polite">',
    topRow,
    bigText,
    `<p class="drill-sub">${esc(q.sub)}</p>`,
    hearRow,
    options,
    feedback,
  ];
  return parts.join('\n    ') + '\n  </div>';
}

// Records an answer (option index): stats, XP, Mistakes list, then the sound and the spoken answer
function answerDrill(optionIndex) {
  if (!DQ || DQ.picked != null) return;
  DQ.picked = optionIndex;
  const good = optionIndex === DQ.answer;
  const stats = drillStats(DQ.kind);
  const say = DQ.say;
  const day = dayKey();
  stats.tries++;
  if (DQ.kind === 'tricky') {
    // Counts toward the word itself, and its Smart review
    const wordStats = stat(DQ.ref);
    wordStats.tries++;
    if (good) wordStats.right++;
    const unit = unitOfWord(DQ.ref);
    if (unit) schedule(P, DQ.ref, unit.id, good);
  }
  if (good) {
    stats.right++;
    const today = todayStats(P);
    today.drill = (today.drill || 0) + 1;
    P.xp += 1;
    P.days[day] = (P.days[day] || 0) + 1;
    dropMiss(DQ.kind, DQ.ref);
  } else {
    addMiss(DQ.kind, DQ.ref);
  }
  sfx(good ? 'ok' : 'bad');
  setTimeout(() => speak(say, PX.slow ? SLOW : 1), good ? 200 : 450);
  save();
  document.querySelector('[data-dnext]')?.focus({focusVisible: false});
}
const nextDrill = () => {
  DQ = BUILD[PT] ? newQ(PT) : null;
  renderPractice();
  // Listening questions play on their own
  if (DQ?.listen) setTimeout(() => DQ?.listen && DQ.picked == null && speak(DQ.say, PX.slow ? SLOW : 1), 250);
  document.querySelector('[data-dopt]')?.focus({focusVisible: false});
};

// ---- page ----
// A row of filter chips: name is the PX setting, list holds [value, label] pairs, cur the chosen value
const chips = (name, list, cur) => {
  const chipButton = ([value, label]) => `<button data-chip="${name}" data-v="${value}" `
    + `aria-pressed="${value === cur && !PX.miss}">${label}</button>`;
  return `<div class="chips" role="group" aria-label="${name}">${list.map(chipButton).join('')}</div>`;
};
function renderPractice() {
  $('pTabs').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.ptab === PT));

  // The filter chips above the question, per drill tab
  function filterChips() {
    if (PT === 'num') {
      const types = [['all', 'All'], ...Object.entries(NUM_TYPES).map(([k, t]) => [k, t.label])];
      return chips('numType', types, PX.numType)
        + chips('numMode', [['read', 'Read'], ['listen', 'Listen']], PX.numMode);
    }
    if (PT === 'verb') {
      const levels = [['1', 'TOPIK 1'], ['2', 'TOPIK 2'], ['3', 'TOPIK 3'], ['all', 'All']];
      const forms = [['all', 'All endings'], ...Object.entries(VERB_FORMS).map(([k, f]) => [k, f.label])];
      return chips('verbLevel', levels, PX.verbLevel) + chips('verbForm', forms, PX.verbForm);
    }
    if (PT === 'part') {
      const types = [['all', 'All'], ...Object.entries(PARTICLES).map(([k, p]) => [k, p.label])];
      return chips('partType', types, PX.partType);
    }
    if (PT === 'casual') {
      const modes = [['casual', 'To casual'], ['book', 'To textbook'], ['mixed', 'Both']];
      return chips('casGroup', [['all', 'All'], ...Object.entries(CAS_GROUPS)], PX.casGroup)
        + chips('casMode', modes, PX.casMode);
    }
    return '';
  }

  let html = '';
  if (PT === 'tricky' && !trickyWords().length) {
    DQ = null;
    $('pBody').innerHTML = '<div class="panel" style="padding:20px"><b>No tricky words right now.</b>'
      + '<p class="muted" style="margin:6px 0 0">Words you miss 3 or more times in lessons, reviews and tests'
      + ' show up here with a hint, until you know them.</p></div>';
    return;
  }
  if (BUILD[PT] && (PT !== 'sound' || PX.sound)) {
    if (DQ?.kind !== PT) DQ = newQ(PT);
    const bar = filterChips();
    const backLink = PT === 'sound' ? `<button class="link back" data-squiz="">${icon('back')}All rules</button>` : '';
    html = backLink + `<div class="drill-bar">${bar}${missChip(PT)}${slowChip()}</div>` + quizHtml(DQ);
  } else if (PT === 'sound') {
    html = soundList();
  } else if (PT === 'talk') {
    const dialogue = DIALOGUES.find(x => x.id === TK.id);
    html = dialogue ? talkView(dialogue) : talkList();
  } else {
    const story = STORIES.find(x => x.id === PX.story);
    html = story ? storyView(story) : storyList();
  }
  $('pBody').innerHTML = html;
}

// Sound changes tab without a quiz running: every rule with its examples
function soundList() {
  const missButton = missList('sound').length
    ? `<button class="btn" data-squiz="all" data-missgo>${icon('rotate')}Mistakes · ${missList('sound').length}`
      + '</button>'
    : '';
  const topRow = '<div class="btn-row" style="margin-bottom:18px">'
    + `<button class="btn btn-ink" data-squiz="all">${icon('play')}Quiz all rules</button>`
    + missButton
    + '<span class="muted" style="align-self:center">'
    + 'Tap an example to hear it. Korean is written one way and said another.</span></div>';
  const exampleButton = ([word, pronunciation, meaning]) => `<button class="rx" data-say="${esc(word)}" title="Hear it">`
    + `<b class="ko">${esc(word)}</b><span class="ko">[${esc(pronunciation)}]</span>`
    + `<small>${esc(meaning)}</small></button>`;
  const ruleCard = rule => '<div class="panel rule"><div class="rule-head">'
    + `<div><span class="kicker">${rule.ko}</span><h3>${rule.name}</h3></div>`
    + `<button class="btn" data-squiz="${rule.id}">Quiz</button></div>`
    + '\n    '
    + `<p>${esc(rule.rule)}</p><div class="rule-ex">${rule.ex.map(exampleButton).join('')}</div></div>`;
  return topRow + '\n  ' + `<div class="rules">${SOUNDS.map(ruleCard).join('')}</div>`;
}

// ---- Reading ----
// The saved best score of a story. Stories come from backups too, so only numbers are trusted.
const storyResult = story => {
  const saved = P.stories?.[story.id];
  return saved && {best: Math.min(story.qs.length, +saved.best || 0)};
};
function storyList() {
  const storyButton = story => {
    const result = storyResult(story);
    const sealHtml = seal(story.level + '급', 'm', result ? 'jade' : '');
    const doneBadge = result ? `<span class="story-done">${icon('check')}${result.best}/${story.qs.length}</span>` : '';
    const details = `${story.en} · TOPIK ${story.level} · ${story.lines.length} sentences`;
    return `<button class="story" data-story="${story.id}">${sealHtml}`
      + '\n    '
      + `<span><b class="ko">${story.title}</b><small>${details}</small></span>${doneBadge}</button>`;
  };
  return `<div class="stories">${STORIES.map(storyButton).join('')}</div>`;
}
// An open story: its sentences, its words, and the questions about it (answers in PX.pick)
function storyView(story) {
  const words = storyWords(story);
  const gloss = storyGloss(story);
  const total = story.qs.length;
  const score = story.qs.filter(([, , answer], i) => PX.pick[i] === answer).length;

  const hearAllButton = `<button class="btn" data-sall>${icon(sQueue.on ? 'pause' : 'play')}`
    + `${sQueue.on ? 'Stop' : 'Hear all'}</button>`;
  const englishButton = `<button class="btn" data-sen aria-pressed="${PX.en}">`
    + `${PX.en ? 'Hide' : 'Show'} English</button>`;
  const head = '<div class="story-head"><div>'
    + `<span class="kicker">TOPIK ${story.level} · 읽기</span><h2 class="ko" lang="ko">${story.title}</h2>`
    + `<p class="muted">${story.en}</p></div>`
    + '\n    '
    + `<div class="btn-row">${hearAllButton}${slowChip()}${englishButton}</div></div>`;

  const sentenceRow = ([ko, en], i) => {
    const openClass = PX.en || PX.shown.has(i) ? ' open' : '';
    const nowClass = sQueue.on && sQueue.i === i ? ' now' : '';
    return `<div class="sent-row"><button class="sent${openClass}${nowClass}" data-sline="${i}">`
      + `<span class="ko" lang="ko" data-ko="${esc(ko)}">${esc(ko)}</span><small>${esc(en)}</small></button>`
      + `${saveBtn('s' + i, ko)}</div>`;
  };

  const wordChip = word => `<button class="wc" data-word="${esc(word.ch)}" title="Hear it, save it or say it">`
    + `<b class="ko">${esc(word.ch)}</b><small>${esc(word.meaning)}</small></button>`;
  const glossChip = ([ko, en]) => {
    const saved = inNotebook(ko);
    const title = saved ? 'In My words: tap to open' : 'Save to My words';
    return `<button class="wc gloss" data-gloss="${esc(ko)}" data-en="${esc(en)}" title="${title}">`
      + `<b class="ko">${esc(ko)}</b><small>${esc(en)}</small>${icon(saved ? 'check' : 'plus')}</button>`;
  };

  const questionRow = ([question, options, answer], questionIndex) => {
    const optionButton = (option, optionIndex) => {
      const picked = PX.pick[questionIndex] === optionIndex;
      let stateClass = '';
      if (PX.checked && optionIndex === answer) stateClass = ' ok';
      else if (PX.checked && picked) stateClass = ' bad';
      return `<button class="sq${stateClass}" data-sq="${questionIndex}" data-so="${optionIndex}" `
        + `aria-pressed="${picked}"${PX.checked ? ' disabled' : ''}>${esc(option)}</button>`;
    };
    return `<div class="sq-row" role="group" aria-label="${esc(question)}">`
      + `<b>${questionIndex + 1}. ${esc(question)}</b>`
      + `<div class="sq-opts">${options.map(optionButton).join('')}</div></div>`;
  };

  let checkArea;
  if (PX.checked) {
    const allRight = score === total;
    checkArea = `<div class="drill-fb ${allRight ? 'good' : 'bad'}">`
      + `<b>${score} of ${total} right${allRight ? '. Well read!' : ''}</b></div>`
      + '<button class="btn" data-sretry>Try again</button>';
  } else {
    const unanswered = Object.keys(PX.pick).length < total;
    checkArea = `<button class="btn btn-ink" data-scheck${unanswered ? ' disabled' : ''}>Check answers</button>`;
  }

  const parts = [
    `<button class="link back" data-story="">${icon('back')}All stories</button>`,
    head,
    `<div class="panel story-text">${story.lines.map(sentenceRow).join('')}</div>`,
    '<p class="muted" style="font-size:.9rem;margin:8px 0 0">Tap a sentence to hear it and see what it means.</p>',
    '<h2 class="section-title">Words in this story</h2>',
    `<div class="wchips">${words.map(wordChip).join('')}` + '\n    ' + `${gloss.map(glossChip).join('')}</div>`,
    '<h2 class="section-title">Questions</h2>',
    `<div class="panel story-qs">${story.qs.map(questionRow).join('')}` + '\n    ' + `${checkArea}</div>`,
  ];
  return parts.join('\n  ');
}
// Checks the story answers: keeps the best score, counts new right answers, +5 XP the first time all are right
function checkStory(story) {
  const total = story.qs.length;
  const score = story.qs.filter(([, , answer], i) => PX.pick[i] === answer).length;
  const day = dayKey();
  const previous = (P.stories ??= {})[story.id];
  const previousBest = +previous?.best || 0;
  const firstFullScore = !previous || previousBest < total && score === total;
  P.stories[story.id] = {best: Math.max(score, previousBest), at: Date.now()};
  const gain = Math.max(0, score - previousBest);
  const stats = drillStats('read');
  if (!previous) stats.tries += total;
  stats.right += gain;
  const today = todayStats(P);
  today.drill = (today.drill || 0) + gain;
  if (score === total && firstFullScore) {
    P.xp += 5;
    P.days[day] = (P.days[day] || 0) + 5;
    toast('task', 'Story read', `${story.title} · +5 XP`, 'book');
  }
  PX.checked = true;
  sfx(score === total ? 'done' : 'bad');
  save();
}
// One audio element for stories and dialogues: plays a recorded line, resolves when it ends
const sAudio = new Audio();
// "Hear all" of a story: on while playing, i is the sentence playing, run changes to stop an older run
const sQueue = {on: false, i: -1, run: 0};
// Next to each story or conversation sentence: a Papago button that translates the sentence in the browser,
// and a ☆ that saves the sentence to My words
const lookBtn = ko => `<button class="icon-btn s-look" data-slook="${esc(ko)}" title="Translate in Papago (browser)" `
  + `aria-label="Translate sentence in Papago">${icon('search')}</button>`;
const saveBtn = (key, ko) => lookBtn(ko) + saveBtn1(key, ko);
const saveBtn1 = (key, ko) => {
  const saved = inNotebook(ko);
  const title = saved ? 'Saved in My words: tap to remove' : 'Save this sentence to My words';
  return `<button class="icon-btn sm s-save${saved ? ' on' : ''}" data-ssave="${key}" aria-pressed="${saved}" `
    + `title="${title}" aria-label="Save sentence">${icon('star')}</button>`;
};
// Plays the recording of a line (male: the male voice, file name starts with "m-")
const playLine = (text, male) => new Promise(resolve => {
  const name = (male ? 'm-' : '') + audioName(text);
  sAudio.src = 'audio/' + name;
  sAudio.playbackRate = PX.slow ? SLOW : 1;
  if (PL.playing()) duck(30000); // the podcast goes quiet while the line plays
  sAudio.onended = sAudio.onerror = () => {
    unduck();
    setTimeout(resolve, 350);
  };
  sAudio.play().then(() => highlightWords(text, name)).catch(resolve);
});
// Word highlighting: audio/words.json says when each word of a story or conversation line is said (recorded with
// the line). It maps a file name to a list of [start ms, length ms, word].
let WORD_TIMES = null;
fetch('audio/words.json').then(r => r.json()).then(json => {
  WORD_TIMES = json;
}).catch(() => {});
// Lights up each word of the line on screen while the recording says it
function highlightWords(text, name) {
  const lineElement = [...document.querySelectorAll('[data-ko]')].find(e => e.dataset.ko === text);
  const wordTimes = WORD_TIMES?.[name];
  if (!lineElement || !wordTimes?.length) return;
  const tokens = text.split(' ');
  lineElement.innerHTML = tokens.map(t => `<span class="hw">${esc(t)}</span>`).join(' ');
  const spans = [...lineElement.children];
  // Timed word -> word on screen: the next word (from the last match on) that contains it
  let tokenIndex = 0;
  const spanOfTimedWord = wordTimes.map(([, , word]) => {
    const found = tokens.findIndex((t, i) => i >= tokenIndex && t.includes(word));
    if (found >= 0) tokenIndex = found;
    return tokenIndex;
  });
  const src = sAudio.src;
  const tick = () => {
    if (!lineElement.isConnected || sAudio.src !== src || sAudio.ended || sAudio.paused) {
      spans.forEach(s => s.classList.remove('on'));
      return;
    }
    const nowMs = sAudio.currentTime * 1000;
    let current = -1;
    for (let i = 0; i < wordTimes.length && wordTimes[i][0] <= nowMs; i++) current = i;
    spans.forEach((s, i) => s.classList.toggle('on', current >= 0 && i === spanOfTimedWord[current]));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
// Plays every sentence of a story in turn, marking the one playing
async function hearAll(story) {
  const run = ++sQueue.run;
  sQueue.on = true;
  for (let i = 0; i < story.lines.length; i++) {
    if (run !== sQueue.run) return;
    sQueue.i = i;
    renderPractice();
    await playLine(story.lines[i][0]);
  }
  if (run === sQueue.run) {
    sQueue.on = false;
    sQueue.i = -1;
    renderPractice();
  }
}
// Stops story "Hear all" and a running conversation
const stopHearAll = () => {
  sQueue.run++;
  sQueue.on = false;
  sQueue.i = -1;
  sAudio.pause();
  TK.run++;
};

// ---- Talk: role-play a dialogue ----
// The app says the other part; on your turn you hear it, record yourself and compare.
// id: open dialogue, role: 'A' or 'B', i: current line, run: changes to stop an older run, rec: recording now,
// urls: your recording of each line, check: pronunciation result for the current line
const TK = {id: null, role: null, i: -1, run: 0, rec: false, urls: {}, check: null};
// Pronunciation check on your turn (Windows speech recognition, like the word card): the line plus the other lines of
// this conversation as look-alikes, so Windows has to tell them apart
const canCheck = () => !!tauri && navigator.userAgent.includes('Windows');
async function talkCheck(dialogue) {
  const lineIndex = TK.i;
  const line = dialogue.lines[lineIndex][1];
  TK.check = {i: lineIndex, busy: true};
  renderPractice();
  let msg;
  let ok = false;
  try {
    const lookAlikes = dialogue.lines.filter((l, k) => k !== lineIndex).map(l => l[1]).slice(0, 12);
    const heard = (await tauri.core.invoke('recognize', {phrases: [line, ...lookAlikes]})).trim();
    ok = heard === line;
    if (ok) msg = 'Windows understood your line ✓';
    else if (heard) msg = 'Windows heard a different line. Listen again and retry.';
    else msg = 'Didn’t catch it. Try again, a little closer to the microphone.';
  } catch (e) {
    if (String(e).includes('NO_KOREAN')) {
      msg = 'Needs Windows’ Korean speech pack (Settings › Time & language › Language › Korean › Speech).';
    } else {
      msg = 'Could not listen: ' + e;
    }
  }
  if (ok) {
    P.totals.pron = (P.totals.pron || 0) + 1;
    save();
  }
  sfx(ok ? 'ok' : 'bad');
  if (TK.i === lineIndex) {
    TK.check = {i: lineIndex, msg, ok};
    renderPractice();
  }
}
const talkDone = dialogue => !!P.talks?.[dialogue.id];
function talkList() {
  const intro = '<p class="muted" style="margin:0 0 14px">Pick a conversation and a part. The app plays the other'
    + ' person; on your turn, say your line, record it and compare it with the native speaker.</p>';
  const dialogueButton = dialogue => {
    const sealHtml = seal(dialogue.level + '급', 'm', talkDone(dialogue) ? 'jade' : '');
    const details = `${dialogue.en} · TOPIK ${dialogue.level} · ${dialogue.lines.length} lines`;
    const doneBadge = talkDone(dialogue) ? `<span class="story-done">${icon('check')}Done</span>` : '';
    return `<button class="story" data-talk="${dialogue.id}">${sealHtml}`
      + '\n    '
      + `<span><b class="ko">${dialogue.title}</b><small>${details}</small></span>${doneBadge}</button>`;
  };
  return intro + '\n  ' + `<div class="stories">${DIALOGUES.map(dialogueButton).join('')}</div>`;
}
// An open conversation: the part buttons, the lines as bubbles, and the bar with what to do now
function talkView(dialogue) {
  const speakerName = role => role === 'A' ? dialogue.a : dialogue.b;
  const currentLine = dialogue.lines[TK.i];
  const myTurn = currentLine && currentLine[0] === TK.role;
  const ended = TK.role && TK.i >= dialogue.lines.length;

  const roleButton = role => `<button class="btn${TK.role === role ? ' btn-ink' : ''}" data-role="${role}">`
    + `Be ${esc(speakerName(role))}</button>`;
  const englishButton = `<button class="btn" data-sen aria-pressed="${PX.en}">`
    + `${PX.en ? 'Hide' : 'Show'} English</button>`;
  const roles = `<div class="btn-row">${['A', 'B'].map(roleButton).join('')}${slowChip()}${englishButton}</div>`;

  const bubble = ([role, ko, en], i) => {
    const mine = role === TK.role;
    const now = i === TK.i;
    const laterClass = TK.role && i > TK.i && !ended ? ' later' : '';
    const english = PX.en || now && mine ? `<em>${esc(en)}</em>` : '';
    const myRecording = TK.urls[i] ? `<button class="link" data-tmine="${i}">${icon('play')}My recording</button>` : '';
    return `<div class="bubble${mine ? ' me' : ''}${now ? ' now' : ''}${laterClass}">`
      + `<small>${esc(speakerName(role))}${mine ? ' · you' : ''}</small>`
      + '\n      '
      + `<button class="b-line" data-tline="${i}" title="Hear it">`
      + `<span class="ko" lang="ko" data-ko="${esc(ko)}">${esc(ko)}</span>${english}</button>`
      + '\n      '
      + `${myRecording}${saveBtn('t' + i, ko)}</div>`;
  };

  // Your turn: hear the line, record yourself, compare, check the pronunciation, go on
  const yourTurnBar = () => {
    const recordButton = `<button class="btn btn-red${TK.rec ? ' recording' : ''}" data-trec>`
      + `<span class="rec-dot"></span>${TK.rec ? 'Recording… say it' : 'Record me'}</button>`;
    let bothButton = '';
    if (TK.urls[TK.i]) bothButton = `<button class="btn" data-tboth>${icon('repeat')}Native, then me</button>`;
    let checkButton = '';
    if (canCheck()) {
      const busy = TK.check?.busy;
      checkButton = `<button class="btn" data-tcheck${busy ? ' disabled' : ''}>`
        + `${icon('check')}${busy ? 'Listening…' : 'Check'}</button>`;
    }
    let checkResult = '';
    if (TK.check?.i === TK.i && TK.check.msg) {
      checkResult = `<span class="t-check ${TK.check.ok ? 'good' : 'bad'}">${esc(TK.check.msg)}</span>`;
    }
    return [
      '<span class="kicker">Your turn</span>',
      `<button class="btn" data-thear>${icon('volume')}Hear it</button>`,
      recordButton,
      bothButton,
      checkButton,
      checkResult,
      `<button class="btn btn-ink" data-tnext>Next${icon('arrow')}</button>`,
    ].join('');
  };
  const talkBar = () => {
    if (!TK.role) return '<span class="muted">Choose your part to start.</span>';
    if (ended) return `<b>Conversation done!</b><button class="btn" data-tstart>${icon('rotate')}Again</button>`;
    if (TK.i < 0) return `<button class="btn btn-ink" data-tstart>${icon('play')}Start</button>`;
    if (myTurn) return yourTurnBar();
    return `<span class="muted">${esc(speakerName(currentLine[0]))} is speaking…</span>`;
  };

  const head = '<div class="story-head"><div>'
    + `<span class="kicker">TOPIK ${dialogue.level} · 대화</span><h2 class="ko" lang="ko">${dialogue.title}</h2>`
    + `<p class="muted">${dialogue.en}</p></div>${roles}</div>`;
  const parts = [
    `<button class="link back" data-talk="">${icon('back')}All conversations</button>`,
    head,
    `<div class="panel talk">${dialogue.lines.map(bubble).join('')}</div>`,
    `<div class="talk-bar">${talkBar()}</div>`,
  ];
  return parts.join('\n  ');
}
// Plays a conversation line ([speaker, korean]); the second speaker has a male voice
const sayLine = ([who, ko]) => playLine(ko, who === 'B');
// Moves to line i: the other part plays and moves on by itself; your part waits for Next
async function talkGo(dialogue, i) {
  const run = ++TK.run;
  TK.i = i;
  renderPractice();
  if (i >= dialogue.lines.length) {
    talkFinish(dialogue);
    return;
  }
  if (dialogue.lines[i][0] === TK.role) return;
  await sayLine(dialogue.lines[i]);
  if (run === TK.run) talkGo(dialogue, i + 1);
}
// End of a conversation: counts it, +5 XP the first time
function talkFinish(dialogue) {
  const first = !talkDone(dialogue);
  const day = dayKey();
  P.talks ??= {};
  P.talks[dialogue.id] = (+P.talks[dialogue.id] || 0) + 1;
  P.totals.talks = (P.totals.talks || 0) + 1;
  const today = todayStats(P);
  today.talks = (today.talks || 0) + 1;
  if (first) {
    P.xp += 5;
    P.days[day] = (P.days[day] || 0) + 5;
    toast('task', 'Conversation done', `${dialogue.title} · +5 XP`, 'mic');
  }
  sfx('done');
  save();
}
// Records you saying the current line, then plays it back
async function talkRecord(dialogue) {
  const lineIndex = TK.i;
  const run = TK.run;
  if (TK.rec) return;
  TK.rec = true;
  renderPractice();
  try {
    // Long enough for the line: 2.2 s plus 170 ms per character (more when Slow is on), at most 9 s
    const characters = [...dialogue.lines[lineIndex][1]].length;
    const url = await recordClip(Math.min(9000, 2200 + characters * 170 / (PX.slow ? SLOW : 1)));
    if (TK.urls[lineIndex]) URL.revokeObjectURL(TK.urls[lineIndex]);
    TK.urls[lineIndex] = url;
    P.totals.recordings = (P.totals.recordings || 0) + 1;
    const today = todayStats(P);
    today.spoken = (today.spoken || 0) + 1;
    TK.rec = false;
    save();
    if (run === TK.run) await playUrl(url);
  } catch (e) {
    toast('sync', 'No microphone found', micHelp(), 'mic');
  } finally {
    TK.rec = false;
    renderPractice();
  }
}
// Back to the start of the open conversation: stops it and throws away your recordings
const talkReset = () => {
  stopHearAll();
  Object.values(TK.urls).forEach(u => URL.revokeObjectURL(u));
  Object.assign(TK, {i: -1, urls: {}, rec: false});
};

$('pTabs').onclick = event => {
  const tabButton = event.target.closest('[data-ptab]');
  if (!tabButton) return;
  PT = tabButton.dataset.ptab;
  lsSet('ptab', PT);
  stopHearAll();
  PX.miss = false;
  DQ = null;
  renderPractice();
};
$('pBody').addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  const data = button.dataset;
  const has = attribute => button.hasAttribute(attribute);

  // Saves a whole sentence to My words (with its English); again removes it. The key is "s" or "t" + line index.
  function toggleSavedSentence(key) {
    const lineIndex = +key.slice(1);
    let line;
    if (key[0] === 's') line = STORIES.find(x => x.id === PX.story)?.lines[lineIndex];
    else line = DIALOGUES.find(x => x.id === TK.id)?.lines[lineIndex]?.slice(1);
    if (!line) return;
    const [ko, en] = line;
    if (inNotebook(ko)) {
      removeFromNotebook(ko);
    } else {
      addToNotebook(ko, en);
      toast('sync', 'Sentence saved', 'In My words, and in Smart review from today', 'star');
    }
    save();
    return renderPractice();
  }

  function handleTalkClick(dialogue) {
    if (data.role) {
      talkReset();
      TK.role = data.role;
      return renderPractice();
    }
    if (has('data-tstart')) {
      talkReset();
      return talkGo(dialogue, 0);
    }
    if (data.tline != null) {
      const lineIndex = +data.tline;
      // While the other part is speaking, tapping a line does nothing
      const othersTurn = TK.role && TK.i >= 0 && TK.i < dialogue.lines.length && dialogue.lines[TK.i][0] !== TK.role;
      if (othersTurn) return;
      stopHearAll();
      sayLine(dialogue.lines[lineIndex]);
      return;
    }
    if (has('data-thear')) return sayLine(dialogue.lines[TK.i]);
    if (has('data-trec')) return talkRecord(dialogue);
    if (has('data-tcheck')) return talkCheck(dialogue);
    if (data.tmine != null) return playUrl(TK.urls[+data.tmine]);
    if (has('data-tboth')) {
      const lineIndex = TK.i;
      return sayLine(dialogue.lines[lineIndex]).then(() => TK.urls[lineIndex] && playUrl(TK.urls[lineIndex]));
    }
    if (has('data-tnext')) return talkGo(dialogue, TK.i + 1);
  }

  function handleStoryClick(story) {
    if (data.sline != null) {
      const lineIndex = +data.sline;
      stopHearAll();
      if (PX.shown.has(lineIndex)) PX.shown.delete(lineIndex);
      else PX.shown.add(lineIndex);
      playLine(story.lines[lineIndex][0]);
      todayStats(P).heard++;
      return renderPractice();
    }
    if (has('data-sall')) {
      if (sQueue.on) {
        stopHearAll();
        renderPractice();
      } else {
        hearAll(story);
      }
      return;
    }
    if (data.sq != null) {
      PX.pick[+data.sq] = +data.so;
      return renderPractice();
    }
    if (has('data-scheck')) return checkStory(story);
    if (has('data-sretry')) {
      PX.pick = {};
      PX.checked = false;
      return renderPractice();
    }
    if (data.gloss) {
      const ko = data.gloss;
      if (inNotebook(ko)) return openWord(ko);
      addToNotebook(ko, data.en);
      save();
      toast('sync', 'Saved to My words', ko, 'star');
    }
  }

  // Drill question and page-wide buttons
  if (data.dopt != null) return answerDrill(+data.dopt);
  if (has('data-dnext')) return nextDrill();
  if (has('data-dsay')) return DQ && speak(DQ.say);
  if (has('data-dslow')) return DQ && speak(DQ.say, SLOW);
  if (has('data-slow')) {
    PX.slow = !PX.slow;
    return renderPractice();
  }
  if (has('data-miss')) {
    PX.miss = !PX.miss;
    return nextDrill();
  }
  if (data.chip) {
    PX[data.chip] = data.v;
    PX.miss = false;
    return nextDrill();
  }
  if (data.squiz != null) {
    PX.sound = data.squiz || null;
    PX.miss = has('data-missgo');
    DQ = null;
    renderPractice();
    return scrollTo(0, 0);
  }
  if (data.story != null) {
    stopHearAll();
    Object.assign(PX, {story: data.story || null, shown: new Set(), pick: {}, checked: false});
    renderPractice();
    return scrollTo(0, 0);
  }
  if (data.talk != null) {
    talkReset();
    Object.assign(TK, {id: data.talk || null, role: null});
    renderPractice();
    return scrollTo(0, 0);
  }
  if (has('data-sen')) {
    PX.en = !PX.en;
    return renderPractice();
  }
  if (data.slook) return openLink(papagoUrl(data.slook));
  if (data.ssave) return toggleSavedSentence(data.ssave);

  const dialogue = DIALOGUES.find(x => x.id === TK.id);
  if (PT === 'talk' && dialogue) return handleTalkClick(dialogue);
  const story = STORIES.find(x => x.id === PX.story);
  if (!story) return;
  handleStoryClick(story);
});
// Keys for drill questions: 1-4 choose, Enter next, R hear again
document.addEventListener('keydown', event => {
  const ignored = view !== 'practice'
    || !DQ
    || !$('pBody').querySelector('.drill')
    || L
    || document.querySelector('dialog[open]')
    || event.ctrlKey
    || event.altKey
    || event.metaKey
    || event.target.closest?.('input,select,textarea');
  if (ignored) return;
  if (/^[1-4]$/.test(event.key) && DQ.picked == null && +event.key <= DQ.opts.length) {
    event.preventDefault();
    answerDrill(+event.key - 1);
  } else if (event.key === 'Enter' && DQ.picked != null) {
    event.preventDefault();
    nextDrill();
  } else if (event.key.toLowerCase() === 'r' && (DQ.listen || DQ.picked != null)) {
    speak(DQ.say, PX.slow ? SLOW : 1);
  }
});
// Leaving the page stops Hear all
document.querySelectorAll('.nav-item').forEach(navButton => navButton.addEventListener('click', () => {
  if (navButton.dataset.tab !== 'practice') stopHearAll();
}));
