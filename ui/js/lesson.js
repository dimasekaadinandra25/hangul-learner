// lesson.js: the game logic, with no DOM access. It builds exercises and lesson steps, schedules Smart review
// (spaced repetition), builds practice tests and the daily mix, merges two copies of the progress when two
// computers sync, and computes streaks, daily and weekly quests, tasks and achievements.
// tools/check.js runs this file in node and tests it.
//
// Needs from earlier scripts (content/vocab.js, content/grammar.js, js/data.js):
//   UNITS, SECTIONS, VOCAB, GROUPS, ALL, SYL_C, SYL_V, keyOf, fillQ.
// Uses only when called, from later scripts: keysFor and JAMO_KEY (hangul-ime.js), STORIES (content/practice-data.js).
//
// Main names it provides:
//   lesson building: HEARTS, STEPS, PASS_STEP, CHALLENGE_STEP, shuffle, pickOne, makeExercise, introCard, buildStep;
//   Smart review: schedule, learned, seedSrs, migrateKeys, dueKeys, notebookUnit, itemFor, buildSmart;
//   other sessions: buildTest, buildMix, buildReview, examPlan;
//   progress: freshProgress, mergeProgress, isMastered, stepDone, stepXp, dayKey, streak, useRestDays;
//   quests and rewards: DAILY_GOAL, GOALS, QUEST_XP, WEEKLY_XP, QUESTS, dailyQuests, todayStats, questProgress,
//   WEEKLY, weekKey, weeklyQuests, weekProgress, TASKS, ACHIEVEMENTS.

const HEARTS = 5;
const QUEST_XP = 10;
const WEEKLY_XP = 40;
const GOALS = [10, 30, 50, 100];
let DAILY_GOAL = 30; // XP per day; the learner picks it in Settings (P.goal), set on every render
const shuffle = list => list.map(x => [Math.random(), x]).sort((p, q) => p[0] - q[0]).map(p => p[1]);
const pickOne = list => list[Math.floor(Math.random() * list.length)];

// Every unit has 4 steps on the path. Passing PASS_STEP unlocks the next unit.
const STEPS = [
  {name: 'Learn 1', icon: 'book', hearts: 5, xp: 10},
  {name: 'Learn 2', icon: 'book', hearts: 5, xp: 10},
  {name: 'Practice', icon: 'repeat', hearts: 5, xp: 10},
  {name: 'Challenge', icon: 'crown', hearts: 3, xp: 20},
];
const PASS_STEP = 2;
const CHALLENGE_STEP = 3;

// Sounds that are (nearly) identical in modern Korean never appear as options together.
// ㅇ and ㅏ are in the list because both play as 아.
const SAME = ['ㅐㅔ', 'ㅒㅖ', 'ㅙㅞㅚ', 'ㅇㅏ'];
const soundsDifferent = (a, b) => a !== b && !SAME.some(group => group.includes(a) && group.includes(b));

// `answer` plus up to count-1 others from `pool`, each with a key(...) that differs from the key of every option
// already picked. Returned in random order.
function options(answer, pool, key, count = 4, differ = (a, b) => a !== b) {
  const picked = [answer];
  for (const candidate of shuffle(pool)) {
    if (picked.length === count) break;
    if (picked.every(option => differ(key(option), key(candidate)))) picked.push(candidate);
  }
  return shuffle(picked);
}

// The line shown under a question once its answer is revealed
const explainOf = (unit, item) => {
  if (unit.kind === 'final') return `${item.parts.join(' + ')} = ${item.ch}, said [${item.sound}] · ${item.note}`;
  if (unit.kind === 'letter') return `${item.ch} sounds like “${item.rom}”`;
  if (unit.kind === 'syllable') return `${item.parts.join(' + ')} = ${item.ch}`;
  return `${item.ch} = ${item.meaning}`;
};

// Exercise types per kind and difficulty. easy = recognition only, hard = recall without visual hints.
// Finals are never built from their sound alone: 낮 and 낫 sound the same.
const TYPES = {
  letter: {easy: ['listen', 'read', 'rom2ch'], mixed: ['listen', 'read', 'rom2ch'], hard: ['listen', 'rom2ch']},
  final: {easy: ['buildShown', 'fsound'], mixed: ['buildShown', 'fsound', 'listen'], hard: ['fsound', 'listen']},
  syllable: {
    easy: ['buildShown', 'listen'],
    mixed: ['buildShown', 'buildHeard', 'listen'],
    hard: ['buildHeard', 'listen'],
  },
  word: {
    easy: ['meaning', 'reverse', 'listen'],
    mixed: ['meaning', 'listen', 'reverse', 'tiles'],
    hard: ['tiles', 'type', 'listen', 'reverse'],
  },
  grammar: {
    easy: ['gmeaning', 'fill'],
    mixed: ['fill', 'gmeaning', 'glisten', 'order'],
    hard: ['order', 'fill', 'glisten'],
  },
};

// One random exercise for `item`. unitIdx is an index into UNITS, or a unit object (My words, see notebookUnit).
// type 'choice': pick the option whose value === answer. 'tiles': tap tiles in order, joined === answer.
// 'type': type the answer on the keyboard. 'intro' (introCard): a teaching card.
// key = item id for stats and mistakes; say and explain are played and shown when the answer is revealed.
function makeExercise(unitIdx, item, mode = 'mixed') {
  const unit = typeof unitIdx === 'number' ? UNITS[unitIdx] : unitIdx;
  if (unit.kind === 'grammar') return grammarExercise(unitIdx, item, mode);
  const base = {unit: unit.id, key: keyOf(item), say: item.say, explain: explainOf(unit, item)};

  // Distractors: items of the same kind and level, from the units so far.
  // My words: the learner's own words plus beginner words.
  let pool;
  if (typeof unitIdx === 'number') {
    pool = UNITS.slice(0, unitIdx + 1)
      .filter(other => other.kind === unit.kind && other.section === unit.section)
      .flatMap(other => other.items);
  } else {
    pool = [...unit.items, ...VOCAB.slice(0, 80)];
  }

  const choice = (prompt, show, candidates, label, big) => ({
    ...base,
    type: 'choice',
    prompt,
    ...show,
    answer: item.ch,
    options: candidates.map(option => ({value: option.ch, label: label(option), big})),
  });
  // The answer's parts plus up to 4 other tiles from `extra`
  const tiles = (prompt, show, parts, extra) => {
    const extraTiles = shuffle([...new Set(extra)].filter(tile => !parts.includes(tile))).slice(0, 4);
    const allTiles = shuffle([...parts, ...extraTiles]);
    return {...base, type: 'tiles', prompt, ...show, parts, answer: parts.join(''), tiles: allTiles};
  };
  const tilesOf = word => (word.includes(' ') ? word.split(' ') : [...word]); // phrases are built from whole words
  const isPhrase = item.ch.includes(' ');
  const syllableLetters = [...SYL_C, ...SYL_V];

  // Typed recall (Challenge) only for words whose every letter is on the 2-beolsik keyboard; else tiles
  const canType = typeof keysFor === 'function' && keysFor(item.ch).every(jamo => jamo === ' ' || JAMO_KEY[jamo]);
  let type = pickOne(TYPES[unit.kind][mode]);
  if (type === 'type' && !canType) type = 'tiles';

  function exerciseOfType() {
    switch (type) {
      case 'type':
        return {...base, type: 'type', prompt: `Type “${item.meaning}” in Korean`, answer: item.ch};
      case 'listen':
        if (unit.kind === 'letter') {
          const letterOptions = options(item, pool, letter => letter.ch, 4, soundsDifferent);
          return choice('Which letter do you hear?', {play: item.say}, letterOptions, letter => letter.ch, true);
        }
        return choice(
          unit.kind === 'word' ? 'Which one do you hear?' : 'Which syllable do you hear?',
          {play: item.say},
          options(item, pool, x => x.sound || x.ch),
          x => x.ch,
          true,
        );
      case 'fsound':
        return choice('How is this said?', {big: item.ch}, options(item, pool, x => x.sound), x => `[${x.sound}]`,
          true);
      case 'read':
        return choice('How does this letter sound?', {big: item.ch}, options(item, pool, l => l.rom), l => l.rom,
          false);
      case 'rom2ch':
        return choice(`Which letter makes the sound “${item.rom}”?`, {}, options(item, pool, l => l.rom), l => l.ch,
          true);
      case 'buildShown':
        return tiles('Build this syllable from its letters', {big: item.ch, play: item.say}, item.parts,
          syllableLetters);
      case 'buildHeard':
        return tiles('Build the syllable you hear', {play: item.say}, item.parts, syllableLetters);
      case 'meaning':
        return choice('What does this mean?', {big: item.ch, play: item.say}, options(item, pool, w => w.meaning),
          w => w.meaning, false);
      case 'reverse':
        return choice(`Which one means “${item.meaning}”?`, {}, options(item, pool, w => w.meaning), w => w.ch, true);
      case 'tiles': {
        // extra tiles come from words of the same shape: phrases for a phrase, single words for a word
        const extra = pool.filter(word => word.ch.includes(' ') === isPhrase).flatMap(word => tilesOf(word.ch));
        return tiles(`Write “${item.meaning}” in Korean`, {play: item.say}, tilesOf(item.ch), extra);
      }
    }
  }

  const exercise = exerciseOfType();
  // The skill the question trains, for the skill quests
  if (type === 'listen') exercise.skill = 'listen';
  else if (['buildShown', 'buildHeard', 'tiles', 'type'].includes(type)) exercise.skill = 'write';
  else exercise.skill = 'read';
  return exercise;
}

// Grammar: fill the blank (English shows the meaning), what a sentence means, which sentence you hear, word order.
// item.ex is a list of [korean, english] examples;
// item.q is [question with ___, its English, right answer, wrong answers].
function grammarExercise(unitIdx, item, mode) {
  const unit = UNITS[unitIdx];
  const otherItems = UNITS.slice(0, unitIdx + 1)
    .filter(other => other.kind === 'grammar' && other.section === unit.section)
    .flatMap(other => other.items)
    .filter(other => other !== item);
  const otherSentences = otherItems.flatMap(other => other.ex);
  const [korean, english] = pickOne(item.ex);
  const [questionKo, questionEn, rightAnswer, wrongAnswers] = item.q;
  const type = pickOne(TYPES.grammar[mode]);
  const explain = `${item.ch} · ${item.meaning}. ${korean} = ${english}`;
  const base = {unit: unit.id, key: keyOf(item), say: korean, explain};
  const choice = (prompt, show, answer, values) => ({
    ...base,
    type: 'choice',
    prompt,
    ...show,
    answer,
    options: values.map(value => ({value, label: value, big: false})),
  });

  function exerciseOfType() {
    switch (type) {
      case 'fill': {
        const answers = shuffle([rightAnswer, ...wrongAnswers]);
        const question = choice(`Fill in the blank: “${questionEn}”`, {big: questionKo}, rightAnswer, answers);
        const filled = fillQ(item.q);
        return {...question, say: filled, explain: `${item.ch} · ${item.meaning}. ${filled} = ${questionEn}`};
      }
      case 'gmeaning': {
        const meanings = options([korean, english], otherSentences, s => s[1]).map(s => s[1]);
        return choice('What does this sentence mean?', {big: korean, play: korean}, english, meanings);
      }
      case 'glisten': {
        const sentences = options([korean, english], otherSentences, s => s[0]).map(s => s[0]);
        return choice('Which sentence do you hear?', {play: korean}, korean, sentences);
      }
      case 'order': {
        const parts = korean.split(' ');
        const otherWords = otherSentences.flatMap(s => s[0].split(' ')).filter(word => !parts.includes(word));
        const extra = shuffle(otherWords).slice(0, 3);
        return {
          ...base,
          type: 'tiles',
          prompt: `Put the words in order: “${english}”`,
          play: korean,
          parts,
          answer: parts.join(''),
          tiles: shuffle([...parts, ...extra]),
        };
      }
    }
  }

  const exercise = exerciseOfType();
  if (type === 'glisten') exercise.skill = 'listen';
  else if (type === 'order') exercise.skill = 'write';
  else exercise.skill = 'read';
  exercise.grammar = true;
  return exercise;
}

// The teaching card shown before an item is first asked
function introCard(unitIdx, item) {
  const unit = typeof unitIdx === 'number' ? UNITS[unitIdx] : unitIdx;
  if (unit.kind === 'grammar') {
    const example = item.ex[0];
    return {
      type: 'intro',
      unit: unit.id,
      key: keyOf(item),
      say: example[0],
      play: example[0],
      big: item.ch,
      prompt: 'New grammar',
      explain: `${item.meaning} · ${item.note}`,
      example,
      grammar: true,
    };
  }
  let prompt = 'New word';
  if (unit.kind === 'letter') prompt = 'New letter';
  else if (unit.kind === 'syllable' || unit.kind === 'final') prompt = 'New syllable';
  let explain = item.meaning;
  if (unit.kind === 'letter') explain = `Sounds like “${item.rom}”`;
  else if (unit.kind === 'syllable') explain = `${item.parts.join(' + ')} = ${item.ch}`;
  else if (unit.kind === 'final') explain = `Said [${item.sound}] · ${item.note}`;
  return {type: 'intro', unit: unit.id, key: keyOf(item), say: item.say, play: item.say, big: item.ch, prompt, explain};
}

// `count` items from `list` in random order; a list shorter than that repeats, shuffled again each round
const fillTo = (list, count) => {
  const out = [];
  while (list.length && out.length < count) out.push(...shuffle(list));
  return out.slice(0, count);
};

// Learn steps teach half the unit each (max 10 new items, intro cards first); Practice mixes all; Challenge is harder.
function buildStep(unitIdx, step) {
  const items = UNITS[unitIdx].items;
  const middle = Math.ceil(items.length / 2);
  if (step < PASS_STEP) {
    let half = step === 0 ? items.slice(0, middle) : items.slice(middle);
    if (half.length > 10) half = shuffle(half).slice(0, 10); // only the 70-syllable unit is bigger
    const intros = half.map(item => introCard(unitIdx, item));
    const questions = fillTo(half, Math.max(8, half.length)).map(item => makeExercise(unitIdx, item, 'easy'));
    return [...intros, ...questions];
  }
  if (step === PASS_STEP) return fillTo(items, 10).map(item => makeExercise(unitIdx, item, 'mixed'));
  return fillTo(items, 12).map(item => makeExercise(unitIdx, item, 'hard'));
}

// ---- Smart review (spaced repetition) ----
// P.srs {key: {u: unitId, iv: days, ease, due: YYYY-MM-DD}}. A right answer on a due item pushes it further out
// (1 day, then x ease: ~3, 7, 16 … days, max 180); a wrong answer brings it back today and makes it come back sooner.

// The day `count` days after `day` (both YYYY-MM-DD)
const addDays = (day, count) => {
  const [year, month, date] = day.split('-').map(Number);
  return dayKey(new Date(year, month - 1, date + count));
};
// A number in [0, 1) that is always the same for the same key (FNV-1a hash)
const hashFrac = key => {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
};

// Records one answer for an item in Smart review and returns its schedule entry
function schedule(P, key, unit, right, day = dayKey()) {
  P.srs ??= {};
  const entry = (P.srs[key] ??= {u: unit, iv: 0, ease: 2.3, due: day});
  entry.u = unit;
  entry.at = Date.now(); // newest answer wins when two computers sync
  if (!right) {
    // Asked again today. Once right, it comes back after a quarter of the old interval (not from zero).
    if (entry.iv >= 4) entry.lapse = Math.round(entry.iv / 4);
    entry.iv = 0;
    entry.ease = Math.max(1.3, +(entry.ease - 0.2).toFixed(2));
    entry.due = day;
    return entry;
  }
  if (entry.due > day) return entry; // already scheduled ahead: answering again early doesn't move it
  let interval = entry.iv ? Math.min(180, Math.round(entry.iv * entry.ease)) : (entry.lapse || 1);
  delete entry.lapse;
  // ±10%, fixed per item, so a unit learned together doesn't all fall due on one day
  if (interval >= 4) interval += Math.round(interval * 0.1 * (hashFrac(key) * 2 - 1));
  entry.iv = interval;
  entry.ease = Math.min(2.8, +(entry.ease + 0.05).toFixed(2));
  entry.due = addDays(day, entry.iv);
  return entry;
}

// After an intro card: the item joins Smart review, due tomorrow (an item already scheduled keeps its entry)
const learned = (P, key, unit, day = dayKey()) => {
  P.srs ??= {};
  P.srs[key] ??= {u: unit, iv: 0, ease: 2.3, due: addDays(day, 1)};
};

// Learners from before Smart review: every item already answered right joins the schedule, spread over a week
function seedSrs(P, day = dayKey()) {
  P.srs ??= {};
  if (P.srsSeeded) return;
  P.srsSeeded = true;
  let added = 0;
  for (const unit of UNITS) {
    for (const item of unit.items) {
      if (P.stats[item.ch]?.right > 0 && !P.srs[keyOf(item)]) {
        P.srs[keyOf(item)] = {u: unit.id, iv: 1, ease: 2.3, due: addDays(day, added++ % 7)};
      }
    }
  }
}

// Saves from before grammar keys: a schedule or mistake of a grammar unit filed under the plain spelling
// moves to its own key
function migrateKeys(P) {
  for (const unit of UNITS) {
    if (unit.kind !== 'grammar') continue;
    for (const pattern of unit.items) {
      if (!pattern.key) continue;
      if (P.srs?.[pattern.ch]?.u === unit.id) {
        P.srs[pattern.key] ??= P.srs[pattern.ch];
        delete P.srs[pattern.ch];
      }
      if (P.mistakes?.[pattern.ch] === unit.id) {
        P.mistakes[pattern.key] = unit.id;
        delete P.mistakes[pattern.ch];
      }
      if (P.stats?.[pattern.ch] && !P.stats[pattern.key]) P.stats[pattern.key] = {...P.stats[pattern.ch]};
    }
  }
}

// Keys of the items due on `day` or before, the earliest due date first
const dueKeys = (P, day = dayKey()) => {
  const byDueDate = ([, a], [, b]) => {
    if (a.due < b.due) return -1;
    if (a.due > b.due) return 1;
    return 0;
  };
  return Object.entries(P.srs || {})
    .filter(([, entry]) => entry.due <= day)
    .sort(byDueDate)
    .map(([key]) => key);
};

// My words as a unit object, so the normal exercises work for them
const notebookUnit = P => ({
  id: 'mine',
  title: 'My words',
  kind: 'word',
  section: -1,
  items: (P.notebook || []).map(word => ({ch: word.ch, meaning: word.meaning, say: word.ch})),
});

// [unit, item] for an item key, or null when it no longer exists. unit is an index into UNITS,
// or the notebook unit object for My words (unitId 'mine'); makeExercise and introCard take either.
function itemFor(P, key, unitId) {
  if (unitId === 'mine') {
    const notebook = notebookUnit(P);
    const word = notebook.items.find(x => x.ch === key);
    return word ? [notebook, word] : null;
  }
  const unitIndex = UNITS.findIndex(unit => unit.id === unitId);
  const item = unitIndex < 0 ? null : UNITS[unitIndex].items.find(x => keyOf(x) === key);
  return item ? [unitIndex, item] : null;
}

// Up to `limit` due items, oldest first, one question each
function buildSmart(P, day = dayKey(), limit = 15) {
  const dueItems = dueKeys(P, day).flatMap(key => {
    const found = itemFor(P, key, P.srs[key].u);
    return found ? [found] : [];
  });
  return dueItems.slice(0, limit).map(([unit, item]) => ({...makeExercise(unit, item, 'mixed'), smart: true}));
}

// ---- TOPIK practice test: choice questions only, no feedback until the end ----
// Areas: vocab (meaning / reverse), listening, grammar (fill / sentence meaning)
function buildTest(sectionIndex, questionCount = 20) {
  const units = UNITS.map((unit, index) => [unit, index]).filter(([unit]) => unit.section === sectionIndex);
  const wordUnits = units.filter(([unit]) => unit.kind !== 'grammar');
  const grammarUnits = units.filter(([unit]) => unit.kind === 'grammar');

  // `count` choice questions of one area; items that can't make one (e.g. syllables for reading) are skipped
  const pickQuestions = (unitList, count, area, mode) => {
    const out = [];
    const items = shuffle(unitList.flatMap(([unit, index]) => unit.items.map(item => [index, item])));
    for (let attempt = 0; out.length < count && attempt < count * 6 && items.length; attempt++) {
      const [unitIndex, item] = items[attempt % items.length];
      // makeExercise picks the exercise type at random, so try a few times for a fitting one
      for (let tries = 0; tries < 12; tries++) {
        const exercise = makeExercise(unitIndex, item, mode);
        if (exercise.type === 'choice' && (area === 'listening') === (exercise.skill === 'listen')) {
          out.push({...exercise, area});
          break;
        }
      }
    }
    return out;
  };

  const grammarCount = grammarUnits.length ? Math.round(questionCount * 0.3) : 0;
  const listeningCount = Math.round(questionCount * 0.3);
  return shuffle([
    ...pickQuestions(wordUnits, questionCount - grammarCount - listeningCount, 'vocab', 'mixed'),
    ...pickQuestions(wordUnits, listeningCount, 'listening', 'mixed'),
    ...pickQuestions(grammarUnits, grammarCount, 'grammar', 'mixed'),
  ]);
}

// Daily mix: 10 questions from every unit you have passed (words and grammar), shuffled together.
function buildMix(P) {
  const items = UNITS.flatMap((unit, index) => {
    if (!((P.units[unit.id] || 0) > 0)) return [];
    return unit.items.map(item => [index, item]);
  });
  return fillTo(items, Math.min(10, items.length)).map(([index, item]) => makeExercise(index, item, 'mixed'));
}

// TOPIK exam plan: days until the exam and units of the target level (and below) still to pass.
function examPlan(P, today = new Date()) {
  const exam = P.exam;
  if (!exam?.date || !(+exam.level >= 1)) return null;
  const level = +exam.level;
  const days = Math.round((new Date(exam.date + 'T00:00') - new Date(dayKey(today) + 'T00:00')) / 864e5);
  const stillToPass = unit => unit.section >= 1 && unit.section <= level && !((P.units[unit.id] || 0) > 0);
  const left = UNITS.filter(stillToPass).length;
  const planned = left && days > 0;
  return {
    days,
    left,
    level,
    every: planned ? Math.max(1, Math.floor(days / left)) : 0, // one unit every N days
    perDay: planned ? Math.ceil(left / days) : 0, // perDay > 1: more units than days
  };
}

// mistakes: {itemKey: unitId}. Each mistaken item is practised twice, up to 10 questions.
function buildReview(mistakes, P = {}) {
  const list = Object.entries(mistakes).flatMap(([key, unitId]) => {
    const found = itemFor(P, key, unitId);
    return found ? [found] : [];
  });
  return fillTo(list, Math.min(10, list.length * 2)).map(([unit, item]) => makeExercise(unit, item, 'mixed'));
}

// ---- Progress ----
// stats {key: {heard, right, tries, written}}, days {YYYY-MM-DD: xp}, units {unitId: practice passes},
// steps {"unitId:step": passes}, mistakes {key: unitId}, daily = today's quest counters,
// badges = unlocked achievement ids,
// log {YYYY-MM-DD: daily counters}, weekClaims {weekKey: [questIds]}, tasks = finished task ids,
// inbox = recent notifications [{kind, title, body, at}], inboxSeen = time the inbox was last opened,
// srs = smart review schedule, notebook = My words [{ch, meaning, added}],
// tests = practice test results [{at, level, score, total, areas}]
const freshProgress = () => ({
  stats: {},
  xp: 0,
  days: {},
  units: {},
  steps: {},
  mistakes: {},
  section: 0,
  bestStreak: 0,
  badges: [],
  srs: {},
  notebook: [],
  tests: [],
  drills: {},
  stories: {},
  drillMiss: {},
  talks: {},
  totals: {
    lessons: 0,
    perfect: 0,
    challenges: 0,
    reviews: 0,
    quests: 0,
    weekly: 0,
    built: 0,
    searches: 0,
    fullDays: 0,
    listenSec: 0,
    smart: 0,
    recordings: 0,
    typed: 0,
    strokes: 0,
    focus: 0,
    shadow: 0,
    dictation: 0,
  },
  bestStroke: 0,
  log: {},
  weekClaims: {},
  tasks: [],
  inbox: [],
  inboxSeen: 0,
});

// Sync: merges two progress copies that both changed since they last agreed (base = that agreed copy).
// Counters (XP, daily stats, word stats, totals, lesson counts) add up what each PC earned since base;
// lists are joined and something removed on either PC stays removed; review schedules keep the one answered
// most recently; anything else comes from the newer copy (aNewer: a was saved last).
function mergeProgress(base, a, b, aNewer) {
  base = base || {};
  const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  // Only one side changed: take that one; both changed: the newer one
  const pick = (baseValue, x, y) => {
    if (same(x, baseValue)) return y;
    if (same(y, baseValue)) return x;
    return aNewer ? x : y;
  };
  const add = (baseValue, x, y) => Math.max(0, (+x || 0) + (+y || 0) - (+baseValue || 0));
  const identity = value => (typeof value === 'object' ? JSON.stringify(value) : String(value));

  function list(baseList, x, y, id = identity) {
    baseList = baseList || [];
    x = x || [];
    y = y || [];
    const inX = new Set(x.map(id));
    const inY = new Set(y.map(id));
    const removed = new Set(baseList.map(id).filter(k => !inX.has(k) || !inY.has(k)));
    const seen = new Set();
    const out = [];
    for (const value of [...x, ...y]) {
      const k = id(value);
      if (!removed.has(k) && !seen.has(k)) {
        seen.add(k);
        out.push(value);
      }
    }
    return out;
  }

  // Counters, nested (log days, word stats, drills)
  function sum(baseObject, x, y) {
    baseObject = baseObject || {};
    x = x || {};
    y = y || {};
    const out = {};
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
      out[k] = sumValue(baseObject[k], x[k], y[k]);
    }
    return out;
  }
  function sumValue(baseValue, xValue, yValue) {
    if (isObject(xValue) || isObject(yValue)) return sum(baseValue, xValue, yValue);
    if (Array.isArray(xValue) || Array.isArray(yValue)) return list(baseValue, xValue, yValue);
    if (typeof (xValue ?? yValue) === 'number') return add(baseValue, xValue, yValue);
    return pick(baseValue, xValue, yValue);
  }

  // Per-key values, each merged by mergeOne; a key removed on one PC (it was in base) stays removed
  function keyed(baseObject, x, y, mergeOne = pick) {
    baseObject = baseObject || {};
    x = x || {};
    y = y || {};
    const out = {};
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
      if (k in baseObject && (!(k in x) || !(k in y))) continue;
      if (k in x && k in y) out[k] = mergeOne(baseObject[k], x[k], y[k]);
      else if (k in x) out[k] = x[k];
      else out[k] = y[k];
    }
    return out;
  }

  // Both PCs answered the item: the later answer wins (entries saved before `at` existed: the later due date)
  const laterReview = (baseEntry, x, y) => {
    if (same(x, baseEntry)) return y;
    if (same(y, baseEntry)) return x;
    if (x.at || y.at) return (x.at || 0) >= (y.at || 0) ? x : y;
    return x.due >= y.due ? x : y;
  };
  const bestStory = (baseStory, x, y) => ({
    best: Math.max(+x.best || 0, +y.best || 0),
    at: Math.max(+x.at || 0, +y.at || 0),
  });

  const older = aNewer ? b : a;
  const newer = aNewer ? a : b;
  const merged = {...older, ...newer};
  const counterFields = ['days', 'log', 'stats', 'totals', 'drills', 'units', 'steps', 'talks'];
  for (const k of counterFields) merged[k] = sum(base[k], a[k], b[k]);
  merged.xp = add(base.xp, a.xp, b.xp);
  merged.srs = keyed(base.srs, a.srs, b.srs, laterReview);
  merged.mistakes = keyed(base.mistakes, a.mistakes, b.mistakes);
  merged.weekClaims = keyed(base.weekClaims, a.weekClaims, b.weekClaims, list);
  merged.drillMiss = keyed(base.drillMiss, a.drillMiss, b.drillMiss, list);
  merged.stories = keyed(base.stories, a.stories, b.stories, bestStory);
  merged.notebook = list(base.notebook, a.notebook, b.notebook, word => word.ch);
  merged.tests = list(base.tests, a.tests, b.tests, test => String(test.at)).sort((x, y) => x.at - y.at).slice(-50);
  for (const k of ['badges', 'tasks']) merged[k] = list(base[k], a[k], b[k]);
  for (const k of ['bestStreak', 'bestStroke', 'inboxSeen', 'raceBest']) merged[k] = Math.max(+a[k] || 0, +b[k] || 0);
  merged.inbox = a.inbox || [];
  return merged;
}

// Right at least 3 times, and right 75% of the time or Smart review already spaces it 3+ weeks out
const isMastered = (P, key) => {
  const stats = P.stats[key];
  return !!stats && stats.right >= 3 && (stats.right / stats.tries >= 0.75 || (P.srs?.[key]?.iv || 0) >= 21);
};
// Units passed before steps existed count as having their Learn and Practice steps done.
const stepDone = (P, unit, step) =>
  (P.steps[unit.id + ':' + step] || 0) > 0 || (step <= PASS_STEP && (P.units[unit.id] || 0) > 0);
// XP for a finished step: its XP plus 1 per heart left (2 on a Challenge). Not a path step (step == null): 10.
const stepXp = (step, heartsLeft) => {
  if (step == null) return 10;
  const perHeart = step === CHALLENGE_STEP ? 2 : 1;
  return STEPS[step].xp + heartsLeft * perHeart;
};

const dayKey = (d = new Date()) => d.toLocaleDateString('sv'); // local YYYY-MM-DD
// A streak survives until a full day is missed, so if today isn't done yet count from yesterday.
// Rest days (streak freeze): finishing all 3 weekly quests earns one (up to 2 kept). A missed day is covered by one
// automatically, so the streak goes on; rest days count for the streak only, never as XP or study days.
const activeDays = P => ({...(P.frozen || {}), ...P.days});

// Spends rest days on the missed days just before today; returns the days covered
function useRestDays(P, today = new Date()) {
  const used = [];
  // the day before yesterday, then yesterday (today can still be studied)
  for (let daysAgo = 2; daysAgo >= 1; daysAgo--) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    const day = dayKey(date);
    const dayBefore = new Date(date);
    dayBefore.setDate(dayBefore.getDate() - 1);
    if ((P.freezes || 0) > 0 && !activeDays(P)[day] && streak(activeDays(P), dayBefore) > 0) {
      (P.frozen ??= {})[day] = 1;
      P.freezes--;
      used.push(day);
    }
  }
  return used;
}

// Days in a row present in `days`, counting back from today (from yesterday while today isn't done yet)
function streak(days, today = new Date()) {
  const date = new Date(today);
  let count = 0;
  if (!days[dayKey(date)]) date.setDate(date.getDate() - 1);
  while (days[dayKey(date)]) {
    count++;
    date.setDate(date.getDate() - 1);
  }
  return count;
}

// ---- Daily quests: 4 per day (one XP quest + three others), the same all day ----
const QUESTS = [
  {id: 'xp30', text: 'Earn 30 XP', metric: 'xp', target: 30, icon: 'zap'},
  {id: 'xp60', text: 'Earn 60 XP', metric: 'xp', target: 60, icon: 'zap'},
  {id: 'xp100', text: 'Earn 100 XP', metric: 'xp', target: 100, icon: 'zap'},
  {id: 'lessons2', text: 'Complete 2 lessons', metric: 'lessons', target: 2, icon: 'book'},
  {id: 'lessons3', text: 'Complete 3 lessons', metric: 'lessons', target: 3, icon: 'book'},
  {id: 'lessons5', text: 'Complete 5 lessons', metric: 'lessons', target: 5, icon: 'book'},
  {id: 'correct15', text: 'Answer 15 questions correctly', metric: 'correct', target: 15, icon: 'check'},
  {id: 'correct30', text: 'Answer 30 questions correctly', metric: 'correct', target: 30, icon: 'check'},
  {id: 'correct50', text: 'Answer 50 questions correctly', metric: 'correct', target: 50, icon: 'check'},
  {id: 'combo8', text: 'Get 8 correct answers in a row', metric: 'combo', target: 8, icon: 'flame'},
  {id: 'combo15', text: 'Get 15 correct answers in a row', metric: 'combo', target: 15, icon: 'flame'},
  {id: 'combo25', text: 'Get 25 correct answers in a row', metric: 'combo', target: 25, icon: 'flame'},
  {id: 'perfect1', text: 'Finish a lesson without mistakes', metric: 'perfect', target: 1, icon: 'star'},
  {id: 'perfect2', text: 'Finish 2 lessons without mistakes', metric: 'perfect', target: 2, icon: 'star'},
  {id: 'write5', text: 'Practise writing 5 letters', metric: 'written', target: 5, icon: 'pen'},
  {id: 'write10', text: 'Practise writing 10 letters', metric: 'written', target: 10, icon: 'pen'},
  {id: 'review1', text: 'Complete a mistakes review', metric: 'reviews', target: 1, icon: 'rotate'},
  {id: 'heard10', text: 'Tap 10 letters or words to hear them', metric: 'heard', target: 10, icon: 'volume'},
  {id: 'listen8', text: 'Answer 8 listening questions correctly', metric: 'listen', target: 8, icon: 'volume'},
  {id: 'read10', text: 'Answer 10 reading questions correctly', metric: 'read', target: 10, icon: 'layers'},
  {id: 'build5', text: 'Build 5 answers from tiles', metric: 'write', target: 5, icon: 'type'},
  {id: 'intros5', text: 'Learn 5 new letters or words', metric: 'intros', target: 5, icon: 'sparkles'},
  {id: 'minutes10', text: 'Study for 10 minutes', metric: 'minutes', target: 10, icon: 'clock'},
  {id: 'minutes20', text: 'Study for 20 minutes', metric: 'minutes', target: 20, icon: 'clock'},
  {id: 'practice1', text: 'Pass a Practice step', metric: 'practice', target: 1, icon: 'repeat'},
  {id: 'challenge1', text: 'Finish a Challenge step', metric: 'challenges', target: 1, icon: 'crown'},
  {id: 'podcast10', text: 'Listen to Korean podcasts or videos for 10 minutes',
    metric: 'podcast', target: 10, icon: 'headphones'},
  {id: 'podcast20', text: 'Listen to Korean podcasts or videos for 20 minutes',
    metric: 'podcast', target: 20, icon: 'headphones'},
  {id: 'srs10', text: 'Get 10 Smart review answers right', metric: 'srs', target: 10, icon: 'repeat'},
  {id: 'grammar5', text: 'Answer 5 grammar questions correctly', metric: 'grammar', target: 5, icon: 'book'},
  {id: 'typed5', text: 'Type 5 words correctly on the Write page', metric: 'typed', target: 5, icon: 'keyboard'},
  {id: 'spoken3', text: 'Record yourself saying 3 words', metric: 'spoken', target: 3, icon: 'mic'},
  {id: 'drill10', text: 'Answer 10 questions right on the Practice page', metric: 'drill', target: 10, icon: 'target'},
  {id: 'drill25', text: 'Answer 25 questions right on the Practice page', metric: 'drill', target: 25, icon: 'target'},
  {id: 'dict5', text: 'Type 5 words you hear (Write › Listen)', metric: 'dict', target: 5, icon: 'headphones'},
  {id: 'focus1', text: 'Finish a focus timer session', metric: 'focus', target: 1, icon: 'clock'},
  {id: 'talk1', text: 'Finish a role-play conversation (Practice › Talk)', metric: 'talks', target: 1, icon: 'mic'},
];

// A random number generator seeded by a string, so the same day (or week) always gets the same quests
const seeded = key => {
  let state = 0;
  for (const char of key) state = (state * 31 + char.charCodeAt(0)) >>> 0;
  return () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state / 2 ** 32;
  };
};
// `count` different entries of `list`, chosen with the generator `random`
function pickSeeded(list, count, random) {
  const remaining = [...list];
  const out = [];
  while (out.length < count && remaining.length) {
    out.push(remaining.splice(Math.floor(random() * remaining.length), 1)[0]);
  }
  return out;
}
function dailyQuests(day) {
  const random = seeded(day);
  const xpQuests = pickSeeded(QUESTS.filter(quest => quest.metric === 'xp'), 1, random);
  const otherQuests = pickSeeded(QUESTS.filter(quest => quest.metric !== 'xp'), 3, random);
  return [...xpQuests, ...otherQuests];
}

// P.goalLog {day: goal}: when the daily goal was changed, so past days keep the goal they had
const goalOn = (P, day) => {
  const lastChange = Object.keys(P.goalLog || {}).filter(changeDay => changeDay <= day).sort().pop();
  return lastChange ? P.goalLog[lastChange] : DAILY_GOAL;
};
const emptyDaily = day => ({
  date: day,
  lessons: 0,
  correct: 0,
  combo: 0,
  perfect: 0,
  written: 0,
  reviews: 0,
  heard: 0,
  challenges: 0,
  practice: 0,
  intros: 0,
  listen: 0,
  read: 0,
  write: 0,
  seconds: 0,
  podcastSec: 0,
  srs: 0,
  typed: 0,
  spoken: 0,
  grammar: 0,
  drill: 0,
  dict: 0,
  focus: 0,
  talks: 0,
  claimed: [],
});
// Today's quest counters (P.log[day]), created on first use
function todayStats(P, day = dayKey()) {
  P.log ??= {};
  return (P.log[day] ??= emptyDaily(day));
}
// One day's value for a quest metric. xp lives in P.days; minutes come from seconds (podcast: from podcastSec).
function metricOn(P, day, metric) {
  if (metric === 'xp') return P.days[day] || 0;
  const daily = P.log?.[day];
  if (!daily) return 0;
  if (metric === 'minutes') return Math.floor((daily.seconds || 0) / 60);
  if (metric === 'podcast') return Math.floor((daily.podcastSec || 0) / 60);
  return daily[metric] || 0;
}
const questProgress = (P, quest, day = dayKey()) => Math.min(quest.target, metricOn(P, day, quest.metric));

// ---- Weekly quests: 3 per week (Monday-Sunday), bigger targets, +WEEKLY_XP each ----
const WEEKLY = [
  {id: 'w-xp300', text: 'Earn 300 XP this week', metric: 'xp', target: 300, icon: 'zap'},
  {id: 'w-lessons15', text: 'Complete 15 lessons', metric: 'lessons', target: 15, icon: 'book'},
  {id: 'w-days5', text: 'Study on 5 different days', metric: 'days', target: 5, icon: 'flame'},
  {id: 'w-correct150', text: 'Answer 150 questions correctly', metric: 'correct', target: 150, icon: 'check'},
  {id: 'w-perfect5', text: 'Finish 5 lessons without mistakes', metric: 'perfect', target: 5, icon: 'star'},
  {id: 'w-challenge3', text: 'Finish 3 Challenge steps', metric: 'challenges', target: 3, icon: 'crown'},
  {id: 'w-minutes60', text: 'Study for 60 minutes', metric: 'minutes', target: 60, icon: 'clock'},
  {id: 'w-write25', text: 'Practise writing 25 letters', metric: 'written', target: 25, icon: 'pen'},
  {id: 'w-goal4', text: 'Reach your daily goal on 4 days', metric: 'goal', target: 4, icon: 'target'},
  {id: 'w-podcast60', text: 'Listen to Korean for 60 minutes', metric: 'podcast', target: 60, icon: 'headphones'},
  {id: 'w-srs50', text: 'Get 50 Smart review answers right', metric: 'srs', target: 50, icon: 'repeat'},
  {id: 'w-drill100', text: 'Answer 100 questions right on the Practice page',
    metric: 'drill', target: 100, icon: 'target'},
  {id: 'w-focus5', text: 'Finish 5 focus timer sessions', metric: 'focus', target: 5, icon: 'clock'},
];
// The Monday of the week `d` is in, as YYYY-MM-DD
function weekKey(d = new Date()) {
  const monday = new Date(d);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return dayKey(monday);
}
// The 7 days (YYYY-MM-DD) of the week that starts on the Monday `week`
function weekDays(week) {
  const [year, month, date] = week.split('-').map(Number);
  return Array.from({length: 7}, (_, offset) => dayKey(new Date(year, month - 1, date + offset)));
}
const weeklyQuests = week => pickSeeded(WEEKLY, 3, seeded('week' + week));
function weekProgress(P, quest, week = weekKey()) {
  const days = weekDays(week);
  let value;
  if (quest.metric === 'days') value = days.filter(day => (P.days[day] || 0) > 0).length;
  else if (quest.metric === 'goal') value = days.filter(day => (P.days[day] || 0) >= goalOn(P, day)).length;
  else value = days.reduce((total, day) => total + metricOn(P, day, quest.metric), 0);
  return Math.min(quest.target, value);
}

// ---- Tasks: one-time milestones with an XP reward, grouped into chapters. get(P) -> [current, target] ----
const heardCount = (P, list) => list.filter(letter => P.stats[letter.ch]?.heard).length;
const writtenCount = P => Object.values(P.stats).filter(stats => stats.written).length;
const unitPassed = (P, id) => (P.units[id] || 0) > 0;
const listenedMin = P => Math.floor((P.totals.listenSec || 0) / 60);
const drillRight = (P, kind) => +P.drills?.[kind]?.right || 0;
const talksDone = P => Object.values(P.talks || {}).filter(count => +count > 0).length;
// Stories with every question answered right
const storiesRead = P => {
  if (typeof STORIES === 'undefined') return 0;
  return STORIES.filter(story => +P.stories?.[story.id]?.best >= story.qs.length).length;
};
const TASKS = [
  {id: 't-hear', group: 'Getting started', text: 'Tap a letter to hear it', xp: 5, get: P => [heardCount(P, ALL), 1]},
  {id: 't-first', group: 'Getting started', text: 'Finish your first lesson', xp: 10, get: P => [P.totals.lessons, 1]},
  {id: 't-write', group: 'Getting started', text: 'Trace a letter on the Write page', xp: 5,
    get: P => [writtenCount(P), 1]},
  {id: 't-build', group: 'Getting started', text: 'Build and hear a syllable on the Letters page', xp: 5,
    get: P => [P.totals.built, 1]},
  {id: 't-search', group: 'Getting started', text: 'Search the word list', xp: 5, get: P => [P.totals.searches, 1]},
  {id: 't-podcast', group: 'Getting started', text: 'Listen to a Korean podcast or video for 5 minutes', xp: 10,
    get: P => [Math.min(listenedMin(P), 5), 5]},
  {id: 't-vowels', group: 'Hangul', text: 'Pass the Basic vowels unit', xp: 15,
    get: P => [+unitPassed(P, 'vowels'), 1]},
  {id: 't-cons', group: 'Hangul', text: 'Hear all 14 basic consonants', xp: 15,
    get: P => [heardCount(P, GROUPS[0][1]), 14]},
  {id: 't-write10', group: 'Hangul', text: 'Write 10 different letters', xp: 20, get: P => [writtenCount(P), 10]},
  {id: 't-letters10', group: 'Hangul', text: 'Master 10 letters', xp: 20,
    get: P => [ALL.filter(letter => isMastered(P, letter.ch)).length, 10]},
  {id: 't-basics', group: 'Hangul', text: 'Finish Hangul basics', xp: 50,
    get: P => [sectionPassed(P, 0), SECTIONS[0].units.length]},
  {id: 't-topik', group: 'TOPIK', text: 'Pass your first TOPIK unit', xp: 20,
    get: P => [UNITS.filter(unit => unit.section > 0 && unitPassed(P, unit.id)).length, 1]},
  {id: 't-words25', group: 'TOPIK', text: 'Master 25 words', xp: 25, get: P => [wordsMastered(P), 25]},
  {id: 't-topik1', group: 'TOPIK', text: 'Finish TOPIK 1', xp: 50,
    get: P => [sectionPassed(P, 1), SECTIONS[1].units.length]},
  {id: 't-words100', group: 'TOPIK', text: 'Master 100 words', xp: 50, get: P => [wordsMastered(P), 100]},
  {id: 't-challenge', group: 'Habits', text: 'Finish a Challenge step', xp: 15, get: P => [P.totals.challenges, 1]},
  {id: 't-review', group: 'Habits', text: 'Clear mistakes in a review', xp: 10, get: P => [P.totals.reviews, 1]},
  {id: 't-perfect', group: 'Habits', text: 'Finish a lesson without mistakes', xp: 10, get: P => [P.totals.perfect, 1]},
  {id: 't-streak3', group: 'Habits', text: 'Study 3 days in a row', xp: 20, get: P => [P.bestStreak, 3]},
  {id: 't-goal3', group: 'Habits', text: 'Reach your daily goal on 3 days', xp: 20,
    get: P => [Object.entries(P.days).filter(([day, xp]) => xp >= goalOn(P, day)).length, 3]},
  {id: 't-allday', group: 'Habits', text: 'Complete all 4 daily quests in one day', xp: 25,
    get: P => [P.totals.fullDays, 1]},
  {id: 't-weekly', group: 'Habits', text: 'Complete a weekly quest', xp: 15, get: P => [P.totals.weekly, 1]},
  {id: 't-streak7', group: 'Habits', text: 'Study 7 days in a row', xp: 40, get: P => [P.bestStreak, 7]},
  {id: 't-smart', group: 'Tools', text: 'Finish a Smart review', xp: 10, get: P => [P.totals.smart || 0, 1]},
  {id: 't-notebook', group: 'Tools', text: 'Save 5 words to My words', xp: 10,
    get: P => [(P.notebook || []).length, 5]},
  {id: 't-grammar', group: 'Tools', text: 'Pass your first grammar unit', xp: 20,
    get: P => [UNITS.filter(unit => unit.kind === 'grammar' && unitPassed(P, unit.id)).length, 1]},
  {id: 't-test', group: 'Tools', text: 'Take a TOPIK practice test', xp: 15, get: P => [(P.tests || []).length, 1]},
  {id: 't-test80', group: 'Tools', text: 'Score 80% or more on a practice test', xp: 30,
    get: P => [Math.max(0, ...(P.tests || []).map(test => Math.round(test.score / test.total * 100))), 80]},
  {id: 't-speak', group: 'Tools', text: 'Record yourself and compare with the native voice', xp: 10,
    get: P => [P.totals.recordings || 0, 1]},
  {id: 't-type', group: 'Tools', text: 'Type 10 words correctly', xp: 15, get: P => [P.totals.typed || 0, 10]},
  {id: 't-stroke', group: 'Tools', text: 'Score 80% or more on a stroke-order check', xp: 15,
    get: P => [P.bestStroke || 0, 80]},
  {id: 't-numbers', group: 'Practice', text: 'Get 20 number questions right', xp: 15,
    get: P => [drillRight(P, 'num'), 20]},
  {id: 't-casual', group: 'Practice', text: 'Get 15 casual-Korean questions right (Practice › Casual)', xp: 15,
    get: P => [drillRight(P, 'casual'), 15]},
  {id: 't-reply', group: 'Practice', text: 'Choose 10 right replies (Practice › Reply)', xp: 15,
    get: P => [drillRight(P, 'reply'), 10]},
  {id: 't-verbs', group: 'Practice', text: 'Get 20 verb-ending questions right', xp: 15,
    get: P => [drillRight(P, 'verb'), 20]},
  {id: 't-sounds', group: 'Practice', text: 'Get 15 sound-change questions right', xp: 15,
    get: P => [drillRight(P, 'sound'), 15]},
  {id: 't-story', group: 'Practice', text: 'Read a story and answer every question right', xp: 10,
    get: P => [storiesRead(P), 1]},
  {id: 't-stories', group: 'Practice', text: 'Read every story on the Practice page', xp: 40,
    get: P => [storiesRead(P), STORIES.length]},
  {id: 't-dict', group: 'Practice', text: 'Type 10 words you hear (Write › Listen)', xp: 15,
    get: P => [P.totals.dictation || 0, 10]},
  {id: 't-shadow', group: 'Practice', text: 'Shadow a podcast: replay 5 seconds and record yourself', xp: 10,
    get: P => [P.totals.shadow || 0, 1]},
  {id: 't-focus', group: 'Practice', text: 'Finish a focus timer session', xp: 10, get: P => [P.totals.focus || 0, 1]},
  {id: 't-particles', group: 'Practice', text: 'Get 20 particle questions right', xp: 15,
    get: P => [drillRight(P, 'part'), 20]},
  {id: 't-miss', group: 'Practice', text: 'Clear your Mistakes list in a drill', xp: 15,
    get: P => [P.totals.missCleared || 0, 1]},
  {id: 't-race', group: 'Practice', text: 'Finish a 60-second typing race', xp: 10,
    get: P => [+P.totals.races || 0, 1]},
  {id: 't-talk', group: 'Practice', text: 'Finish a role-play conversation', xp: 10, get: P => [talksDone(P), 1]},
  {id: 't-talks', group: 'Practice', text: 'Finish all 8 conversations', xp: 30, get: P => [talksDone(P), 8]},
  {id: 't-import', group: 'Practice', text: 'Have 25 words in My words', xp: 15,
    get: P => [(P.notebook || []).length, 25]},
];

// ---- Achievements: get(P) -> [current, target] ----
const sectionPassed = (P, sectionIndex) =>
  UNITS.filter(unit => unit.section === sectionIndex && (P.units[unit.id] || 0) > 0).length;
const wordsMastered = P => VOCAB.filter(word => isMastered(P, word.ch)).length;
const ACHIEVEMENTS = [
  {id: 'first', name: 'First steps', desc: 'Finish your first lesson', icon: 'star', get: P => [P.totals.lessons, 1]},
  {id: 'lessons50', name: 'Dedicated', desc: 'Finish 50 lessons', icon: 'book', get: P => [P.totals.lessons, 50]},
  {id: 'streak3', name: 'Warming up', desc: 'Reach a 3-day streak', icon: 'flame', get: P => [P.bestStreak, 3]},
  {id: 'streak7', name: 'Week warrior', desc: 'Reach a 7-day streak', icon: 'flame', get: P => [P.bestStreak, 7]},
  {id: 'streak30', name: 'Unstoppable', desc: 'Reach a 30-day streak', icon: 'flame', get: P => [P.bestStreak, 30]},
  {id: 'ears', name: 'Good listener', desc: 'Listen to Korean for 5 hours', icon: 'headphones',
    get: P => [listenedMin(P), 300]},
  {id: 'xp100', name: 'Rising star', desc: 'Earn 100 XP', icon: 'zap', get: P => [P.xp, 100]},
  {id: 'xp1000', name: 'XP hunter', desc: 'Earn 1,000 XP', icon: 'zap', get: P => [P.xp, 1000]},
  {id: 'xp5000', name: 'Scholar', desc: 'Earn 5,000 XP', icon: 'zap', get: P => [P.xp, 5000]},
  {id: 'perfect10', name: 'Perfectionist', desc: 'Finish 10 lessons without a mistake', icon: 'target',
    get: P => [P.totals.perfect, 10]},
  {id: 'challenge10', name: 'Champion', desc: 'Finish 10 Challenge steps', icon: 'crown',
    get: P => [P.totals.challenges, 10]},
  {id: 'quests20', name: 'Quest hunter', desc: 'Complete 20 daily quests', icon: 'gift',
    get: P => [P.totals.quests, 20]},
  {id: 'words50', name: 'Word collector', desc: 'Master 50 words', icon: 'layers', get: P => [wordsMastered(P), 50]},
  {id: 'words200', name: 'Walking dictionary', desc: 'Master 200 words', icon: 'layers',
    get: P => [wordsMastered(P), 200]},
  {id: 'memory', name: 'Memory keeper', desc: 'Finish 20 Smart reviews', icon: 'repeat',
    get: P => [P.totals.smart || 0, 20]},
  {id: 'grammar6', name: 'Grammar builder', desc: 'Pass 6 grammar units', icon: 'book',
    get: P => [UNITS.filter(unit => unit.kind === 'grammar' && unitPassed(P, unit.id)).length, 6]},
  {id: 'test90', name: 'Test ace', desc: 'Score 90% or more on a practice test', icon: 'award',
    get: P => [Math.max(0, ...(P.tests || []).map(test => Math.round(test.score / test.total * 100))), 90]},
  {id: 'speaker', name: 'Brave speaker', desc: 'Record yourself 50 times', icon: 'mic',
    get: P => [P.totals.recordings || 0, 50]},
  {id: 'talker', name: 'Conversation partner', desc: 'Finish all 8 role-play conversations', icon: 'mic',
    get: P => [talksDone(P), 8]},
  {id: 'drills200', name: 'Drill master', desc: 'Answer 200 Practice-page questions right', icon: 'target',
    get: P => [
      ['num', 'verb', 'part', 'sound', 'read', 'tricky', 'reply', 'pair', 'casual']
        .reduce((total, kind) => total + drillRight(P, kind), 0),
      200,
    ]},
  {id: 'bookworm', name: 'Bookworm', desc: 'Read every story', icon: 'book',
    get: P => [storiesRead(P), STORIES.length]},
  {id: 'focus10', name: 'Deep focus', desc: 'Finish 10 focus timer sessions', icon: 'clock',
    get: P => [P.totals.focus || 0, 10]},
  // one per section: pass every unit in it
  ...SECTIONS.map((section, index) => ({
    id: 'sec-' + section.id,
    name: index ? `${section.title} graduate` : 'Hangul hero',
    desc: `Pass every unit in ${section.title}`,
    icon: 'award',
    get: P => [sectionPassed(P, index), section.units.length],
  })),
];
