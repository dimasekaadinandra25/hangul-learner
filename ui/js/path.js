// ---- Learn: levels, units and steps ----
// The Learn page: level tabs, the hero card with "Continue", today's strip, the task/review slips and the
// path of units, each unit a <details> with its 4 steps. Also the horizontal scroller helpers used by
// every row of level tabs.
// Needs from earlier scripts: $, icon, seal (icons.js); P, save (save.js); toast (notify.js);
// UNITS, SECTIONS, STEPS, CHALLENGE_STEP, stepDone, sectionPassed, dueKeys, buildStep, buildReview,
// buildMix, buildSmart, todayStats, streak, activeDays, dayKey, DAILY_GOAL (lesson.js);
// nextTask (views.js). At call time: examLine, startLesson (player.js).
// Provides: WASH, openUnits, LEVEL_SEAL, STEP_KO, unitsOf, levelTabs, fadeEdges, prevInTrack, unitOpen,
// stepOpen, noun, what, stepInfo, nextStep, renderPath.

// Ink-wash mountain ridges, drawn in currentColor at low opacity behind the hero
const WASH = [
  '<svg class="wash" viewBox="0 0 360 150" preserveAspectRatio="none" aria-hidden="true">',
  '<path fill="currentColor" d="M0 150c30-8 48-40 72-52 18-9 30 10 46 6 24-6 36-52 62-58 22-5 34 30 54 34 18 4 30-14',
  ' 48-10 30 7 52 44 78 50v30z"/>',
  '<path fill="currentColor" opacity=".7" d="M40 150c26-6 40-24 64-28 26-4 40 18 66 16 34-3 54-36 90-38 40-2 70 26',
  ' 100 30v20z"/></svg>',
].join('');
const openUnits = new Set(); // units the learner expanded by hand (kept across re-renders)
const LEVEL_SEAL = ['한글', '초급', '초급', '중급', '중급', '고급', '고급']; // beginner / intermediate / advanced
const STEP_KO = ['학습 1', '학습 2', '연습', '도전'];

// The units of one level (section) as [unit, index in UNITS] pairs
const unitsOf = sectionIndex => {
  return UNITS.map((unit, index) => [unit, index]).filter(([unit]) => unit.section === sectionIndex);
};

// Level tabs: 한글 (basics) | TOPIK 1..6, optional "All". sub(i) = small caption under each tab,
// or [caption, tooltip].
function levelTabs(el, attr, current, sub, withAll) {
  const tab = levelIndex => {
    const name = levelIndex < 0 ? 'All levels' : SECTIONS[levelIndex].title;
    const [caption, tip] = [].concat(sub(levelIndex));
    let label = levelIndex;
    if (levelIndex < 0) label = 'All';
    else if (levelIndex === 0) label = '한글';
    return [
      `<button class="lv" ${attr}="${levelIndex}" aria-pressed="${levelIndex === current}"`,
      ` title="${name}${tip ? ' · ' + tip : ''}" aria-label="${name}${tip ? ', ' + tip : ''}">`,
      `<b>${label}</b><small>${caption}</small></button>`,
    ].join('');
  };
  const topikTabs = SECTIONS.slice(1).map((_, k) => tab(k + 1)).join('');
  el.innerHTML = (withAll ? tab(-1) : '') + tab(0) + '<span class="lv-group" aria-hidden="true">TOPIK</span>' + topikTabs;
  el.querySelector('[aria-pressed=true]')?.scrollIntoView({block: 'nearest', inline: 'nearest'});
  fadeEdges(el);
}

// Horizontal scrollers: fade the edge that has more content; mouse wheel scrolls sideways.
function fadeEdges(el) {
  const maxScroll = el.scrollWidth - el.clientWidth;
  el.classList.toggle('fade-l', el.scrollLeft > 2);
  el.classList.toggle('fade-r', el.scrollLeft < maxScroll - 2);
}
document.querySelectorAll('.scroller').forEach(el => {
  el.addEventListener('scroll', () => fadeEdges(el), {passive: true});
  el.addEventListener('wheel', e => {
    if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    }
  }, {passive: false});
});
addEventListener('resize', () => document.querySelectorAll('.scroller').forEach(fadeEdges));

// Words and grammar are separate tracks in a level: the first unit of each is open, then each needs the one before it
const prevInTrack = unitIndex => {
  const unit = UNITS[unitIndex];
  const isGrammar = unit.kind === 'grammar';
  for (let j = unitIndex - 1; j >= 0 && UNITS[j].section === unit.section; j--) {
    if ((UNITS[j].kind === 'grammar') === isGrammar) return UNITS[j];
  }
  return null;
};
const unitOpen = unitIndex => {
  const previous = prevInTrack(unitIndex);
  return !previous || (P.units[previous.id] || 0) > 0;
};
// Step 0 opens with the unit; every later step needs the step before it
const stepOpen = (unit, unitIndex, positionInLevel, step) => {
  if (step === 0) return unitOpen(unitIndex, positionInLevel);
  return stepDone(P, unit, step - 1);
};

// What a unit's items are called: "words", "letters", "patterns" or "syllables"
const noun = unit => {
  if (unit.kind === 'word') return 'words';
  if (unit.kind === 'letter') return 'letters';
  if (unit.kind === 'grammar') return 'patterns';
  return 'syllables';
};
const what = unit => `${unit.items.length} ${noun(unit)}`;

// Caption for a step row. The two Learn steps split the unit's items between them (10 at most each).
const stepInfo = (unit, step) => {
  const itemCount = unit.items.length;
  const half = step === 0 ? Math.ceil(itemCount / 2) : Math.floor(itemCount / 2);
  return [
    `${Math.min(10, half)} new ${noun(unit)}`,
    `${Math.min(10, half)} new ${noun(unit)}`,
    '10 mixed questions',
    '12 questions · 3 hearts · bonus XP',
  ][step];
};

// First open, unfinished step in this level as [unit index, step], or null when all are done
function nextStep(sectionIndex) {
  const list = unitsOf(sectionIndex);
  for (let k = 0; k < list.length; k++) {
    for (let step = 0; step < STEPS.length; step++) {
      const [unit, unitIndex] = list[k];
      if (stepOpen(unit, unitIndex, k, step) && !stepDone(P, unit, step)) return [unitIndex, step];
    }
  }
  return null;
}

// Draw the whole Learn page for the level the learner picked (P.section)
function renderPath() {
  const sectionIndex = Math.min(P.section || 0, SECTIONS.length - 1);
  const section = SECTIONS[sectionIndex];
  const list = unitsOf(sectionIndex);
  const next = nextStep(sectionIndex);
  const unitsPassed = sectionPassed(P, sectionIndex);
  const plural = count => (count === 1 ? '' : 's');

  function heroHtml() {
    const progressRow = [
      '<div class="progress-row">',
      '<div class="line" role="progressbar" aria-label="Units passed"',
      ` aria-valuenow="${unitsPassed}" aria-valuemax="${list.length}">`,
      `<i style="width:${unitsPassed / list.length * 100}%"></i></div>`,
      `${unitsPassed} of ${list.length} units</div>`,
    ].join('');
    let continueHtml = '<span class="kicker">Every step in this level is complete.</span>';
    if (next) {
      const [unitIndex, step] = next;
      continueHtml = [
        `<button class="btn btn-ink" data-unit="${unitIndex}" data-step="${step}">`,
        `Continue · ${UNITS[unitIndex].title}, ${STEPS[step].name}${icon('arrow')}</button>`,
      ].join('');
    }
    return [
      `<div class="hero"><div><span class="kicker">${section.tag}</span><h2>${section.title}</h2><p>${section.desc}</p>`,
      `\n    ${progressRow}`,
      `\n    ${continueHtml}</div>`,
      `\n    ${seal(LEVEL_SEAL[sectionIndex], 'l')}<span class="sun" aria-hidden="true"></span>${WASH}</div>`,
    ].join('');
  }

  function todayStripHtml() {
    const today = P.days[dayKey()] || 0;
    const dayStats = todayStats(P);
    const ring = [
      '<svg class="ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="ring-bg" cx="18" cy="18" r="15.9"/>',
      '<circle cx="18" cy="18" r="15.9" pathLength="100" stroke-dasharray="100"',
      ` style="stroke:var(--red);stroke-linecap:round;stroke-dashoffset:${100 - Math.min(1, today / DAILY_GOAL) * 100}"/>`,
      '</svg>',
    ].join('');
    const numbers = [
      `<div><b>${Math.min(today, DAILY_GOAL)}/${DAILY_GOAL}</b><small>XP today</small></div>`,
      `<div><b>${dayStats.claimed.length}/4</b><small>daily quests</small></div>`,
      `<div><b>${streak(activeDays(P))}</b><small>day streak</small></div>`,
      '<button class="link" data-mix title="10 mixed questions from everything you\'ve passed">Daily mix</button>',
      '<button class="link" data-go="quests">Quests</button></div>',
    ].join('');
    return `<div class="today">${ring}\n    ${numbers}${examLine()}`;
  }

  function taskSlotHtml() {
    const task = nextTask();
    if (!task) return '';
    const [count, target] = task.get(P);
    return [
      '<button class="slip task" data-go="quests"><span class="kicker">할 일</span><span style="flex:1">',
      `<b>${task.text}</b><small class="muted">Next task · ${Math.min(count, target)}/${target} · +${task.xp} XP</small>`,
      `</span>${icon('arrow')}</button>`,
    ].join('');
  }

  function reviewSlotHtml() {
    const mistakeCount = Object.keys(P.mistakes).length;
    if (!mistakeCount) return '';
    return [
      '<button class="slip" data-review><span class="kicker">복습</span><span><b>Review mistakes</b>',
      `<small class="muted">${mistakeCount} item${plural(mistakeCount)} to practise · +10 XP</small></span>`,
      `${icon('arrow')}</button>`,
    ].join('');
  }

  function smartSlotHtml() {
    const dueCount = dueKeys(P).length;
    if (!dueCount) return '';
    return [
      '<button class="slip smart" data-smart><span class="kicker">기억</span><span style="flex:1"><b>Smart review</b>',
      `<small class="muted">${dueCount} item${plural(dueCount)} due today`,
      ' · brings back what you are about to forget · +10 XP</small></span>',
      `${icon('arrow')}</button>`,
    ].join('');
  }

  // One step row of a unit's timeline
  function stepRowHtml(unit, unitIndex, k, stepInfoEntry, step) {
    const done = stepDone(P, unit, step);
    const open = done || stepOpen(unit, unitIndex, k, step);
    const isCurrent = next && next[0] === unitIndex && next[1] === step;
    let right;
    if (isCurrent) right = `<span class="go">Start${icon('arrow')}</span>`;
    else if (done) right = seal('완', 's', step === CHALLENGE_STEP ? 'gold' : '');
    else if (open) right = '';
    else right = icon('lock');
    let state = 'locked';
    let labelEnd = ', locked';
    if (done) {
      state = 'done';
      labelEnd = ', complete';
    } else if (open) {
      state = 'open';
      labelEnd = '';
    }
    return [
      `<li class="${state}${isCurrent ? ' current' : ''}"><span class="node">${done ? icon('check') : ''}</span>`,
      `\n        <button class="row" data-unit="${unitIndex}" data-step="${step}" ${open ? '' : 'disabled'}`,
      ` aria-label="${unit.title}, ${stepInfoEntry.name}${labelEnd}">`,
      `\n        <span><b>${stepInfoEntry.name}</b><small>${STEP_KO[step]} · ${stepInfo(unit, step)}</small></span>`,
      `${right}</button></li>`,
    ].join('');
  }

  // Words and grammar units are numbered separately; a level with grammar gets a heading per track
  const hasGrammar = list.some(([unit]) => unit.kind === 'grammar');
  let wordCount = 0;
  let grammarCount = 0;

  function unitHtml([unit, unitIndex], k) {
    const isGrammar = unit.kind === 'grammar';
    const number = isGrammar ? ++grammarCount : ++wordCount;
    let head = '';
    if (hasGrammar && number === 1) {
      head = `<h3 class="track"><b>${isGrammar ? '문법' : '단어'}</b>${isGrammar ? 'Grammar' : 'Words'}</h3>`;
    }
    const open = unitOpen(unitIndex, k) || stepDone(P, unit, 0);
    const doneCount = STEPS.filter((_, step) => stepDone(P, unit, step)).length;
    const rows = STEPS.map((stepEntry, step) => stepRowHtml(unit, unitIndex, k, stepEntry, step)).join('');
    const expanded = (next && next[0] === unitIndex) || openUnits.has(unitIndex);
    const pips = STEPS.map((_, step) => {
      let pipClass = '';
      if (stepDone(P, unit, step)) pipClass = step === CHALLENGE_STEP ? 'gold' : 'on';
      return `<i class="${pipClass}"></i>`;
    }).join('');
    let badge;
    if (doneCount === 4) badge = seal('완', 's', '');
    else if (open) badge = `<span class="pips" aria-hidden="true">${pips}</span>`;
    else badge = icon('lock').replace('class="i', 'class="i lock');
    const unitNumber = `<span class="no">${isGrammar ? '문법' : '제'} ${number} ${isGrammar ? '' : '과'}</span>`;
    const summary = [
      `<summary class="unit-title" aria-label="${isGrammar ? 'Grammar' : 'Lesson'} ${number}: ${unit.title},`,
      ` ${doneCount} of 4 steps done">${unitNumber}<h3>${unit.title}</h3><span class="meta">${what(unit)}</span>`,
      `${badge}${icon('chev').replace('class="i', 'class="i chev')}</summary>`,
    ].join('');
    const detailsClass = `unit${open ? '' : ' locked'}${isGrammar ? ' grammar' : ''}`;
    return [
      `${head}<details class="${detailsClass}" data-u="${unitIndex}"${expanded ? ' open' : ''}>`,
      `${summary}<ol class="timeline">${rows}</ol></details>`,
    ].join('');
  }

  levelTabs($('levels'), 'data-sec', sectionIndex, levelIndex => {
    const passed = sectionPassed(P, levelIndex);
    const total = unitsOf(levelIndex).length;
    return [
      `<span class="lv-bar" aria-hidden="true"><i style="width:${passed / total * 100}%"></i></span>`,
      `${passed} of ${total} units passed`,
    ];
  });
  $('hero').innerHTML = heroHtml();
  $('todayStrip').innerHTML = todayStripHtml();
  $('taskSlot').innerHTML = taskSlotHtml();
  $('reviewSlot').innerHTML = reviewSlotHtml();
  $('smartSlot').innerHTML = smartSlotHtml();
  $('path').innerHTML = list.map(unitHtml).join('');
}

// One click handler for the whole Learn page
$('learn').onclick = e => {
  const summary = e.target.closest('summary');
  if (summary) { // remember hand-opened units
    const details = summary.parentElement;
    const unitIndex = +details.dataset.u;
    if (details.open) openUnits.delete(unitIndex);
    else openUnits.add(unitIndex);
    return;
  }
  const levelTab = e.target.closest('[data-sec]');
  if (levelTab) {
    P.section = +levelTab.dataset.sec;
    return save();
  }
  if (e.target.closest('[data-review]')) return startLesson(() => buildReview(P.mistakes, P), {step: null});
  if (e.target.closest('[data-mix]')) {
    if (buildMix(P).length) return startLesson(() => buildMix(P), {step: null});
    const why = 'Pass a unit first, then Daily mix asks about everything you know.';
    return toast('sync', 'Nothing to mix yet', why, 'layers');
  }
  if (e.target.closest('[data-smart]')) return startLesson(() => buildSmart(P), {step: null, smart: true});
  const stepButton = e.target.closest('[data-step]');
  if (!stepButton || stepButton.disabled) return;
  const unitIndex = +stepButton.dataset.unit;
  const step = +stepButton.dataset.step;
  startLesson(() => buildStep(unitIndex, step), {unitIdx: unitIndex, step});
};
