// TOPIK practice test and placement test (Test page), and the Stats page.
//
// Needs from earlier scripts: $, P, L, view, save, show, ask, speak, esc, icon, seal, long, pickOne, dayKey, weekKey,
// weekDays, addDays, todayStats, schedule, unitPassed, sectionPassed, buildTest, storyText, streak, activeDays,
// wordsMastered, isMastered, keyOf, storiesRead, talksDone, SECTIONS, LEVEL_SEAL, STORIES, DIALOGUES, VOCAB,
// GRAMMAR_ITEMS.
//
// Provides: TS (the running test), renderTest, startPlacement, withReading, finishTest, pct, renderStatsPage.

// ---------------- Practice test ----------------
const TEST_SECONDS = 600;
const PASS_PCT = 60;
const AREA_NAME = { vocab: 'Vocabulary', listening: 'Listening', grammar: 'Grammar', reading: 'Reading' };
// The running test, or null while the level picker shows:
// { si: level index, qs: questions, i: current question, picks: chosen values, start: ms, done, result,
//   place: [[level, %], ...] for a placement test, level: placement outcome }
let TS = null;
let testTimer = 0;
const pct = (part, whole) => whole ? Math.round(part / whole * 100) : 0;
// best score (%) on this level's practice tests, or null when it has not been taken
const bestOf = levelIndex => {
  const tests = (P.tests || []).filter(test => test.level === levelIndex);
  return tests.length ? Math.max(...tests.map(test => pct(test.score, test.total))) : null;
};
// A thin progress bar as used on the Test and Stats pages; barStyle is the inner bar's style ('width:40%').
const progressPageBar = (now, max, label, barStyle) => {
  return `<div class="line" role="progressbar" aria-valuenow="${now}" aria-valuemax="${max}" aria-label="${label}">`
    + `<i style="${barStyle}"></i></div>`;
};

function renderTest() {
  if (!TS) return renderPicker();
  if (TS.done) return TS.place ? renderPlacement() : renderResult();
  renderQuestion();
}

// The level picker: the placement test offer, then one card per level with its best score.
function renderPicker() {
  const placementCta = [
    '<div class="panel place-cta"><div><b>Not sure where to start?</b>',
    '<small>The placement test checks one level at a time (8 questions each) and stops at the first one that’s new to you.',
    '</small></div>',
    `<button class="btn btn-ink" data-tplace>${icon('target')}Find my level</button></div>`,
  ].join('');
  const levelCard = (section, levelIndex) => {
    const best = bestOf(levelIndex);
    const subtitle = levelIndex ? section.tag : 'Letters, syllables and first words';
    const bestText = best == null ? 'Not taken yet' : `Best: ${best}%`;
    return [
      `<button class="lvl-card" data-tlevel="${levelIndex}">${seal(LEVEL_SEAL[levelIndex], 's')}`,
      `<b>${section.title}</b><small>${subtitle}</small><small>${bestText}</small></button>`,
    ].join('');
  };
  const note = 'Questions come from every unit of the level, including ones you have not studied yet. '
    + 'Wrong answers on things you have studied go to Review mistakes and Smart review.';
  $('testBody').innerHTML = `${placementCta}<div class="levels-grid">${SECTIONS.map(levelCard).join('')}</div>
    <p class="muted" style="margin-top:20px;font-size:.88rem">${note}</p>`;
}

// Reading, like the real exam: a short story of this level with its questions, in place of the same number of
// vocabulary questions. Hangul basics has no story, so its test stays as it was.
function withReading(questions, levelIndex) {
  const story = pickOne(STORIES.filter(s => s.level === levelIndex));
  if (!story) return questions;
  const readingQuestions = story.qs.map(([question, options, answer]) => ({
    area: 'reading',
    skill: 'read',
    prompt: esc(question),
    passage: storyText(story),
    options: options.map((option, index) => ({ value: String(index), label: esc(option) })),
    answer: String(answer),
  }));
  let vocabToDrop = readingQuestions.length;
  const kept = questions.filter(q => !(q.area === 'vocab' && vocabToDrop-- > 0));
  return [...kept, ...readingQuestions]; // reading comes last, as in TOPIK
}

function startTest(levelIndex) {
  TS = {
    si: levelIndex,
    qs: withReading(buildTest(levelIndex), levelIndex),
    i: 0,
    picks: [],
    start: Date.now(),
    done: false,
  };
  clearInterval(testTimer);
  testTimer = setInterval(tickTest, 1000);
  renderQuestion();
}

// seconds left on the test clock
const timeLeft = () => Math.max(0, TEST_SECONDS - Math.floor((Date.now() - TS.start) / 1000));

// Runs every second: updates the clock and ends the test when time is up.
function tickTest() {
  if (!TS || TS.done) return clearInterval(testTimer);
  if (!timeLeft()) return finishTest();
  const timerEl = $('testTime');
  if (timerEl) {
    const seconds = timeLeft();
    timerEl.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    timerEl.classList.toggle('low', seconds < 60);
  }
}

function renderQuestion() {
  const question = TS.qs[TS.i];
  const count = TS.qs.length;
  const pick = TS.picks[TS.i];

  const placeLabel = TS.place ? `Placement · ${SECTIONS[TS.si].title} · ` : '';
  const topBar = [
    `<div class="test-top"><span class="muted">${placeLabel}Question ${TS.i + 1} of ${count}</span>`,
    progressPageBar(TS.i, count, 'Test progress', `width:${TS.i / count * 100}%`),
    '<span class="test-timer" id="testTime"></span></div>',
  ].join('');

  const passageHtml = question.passage ? `<p class="test-passage" lang="ko">${esc(question.passage)}</p>` : '';
  let bigHtml = '';
  if (question.big) bigHtml = `<div class="glyph${long(question.big) ? ' long' : ''}" lang="ko">${question.big}</div>`;
  let playHtml = '';
  if (question.play) {
    playHtml = '<div class="listen">'
      + `<button class="speak lg" id="tqPlay" aria-label="Play sound (R)">${icon('volume')}</button>`
      + '<span class="muted">Listen, then answer.<br>Press R to replay.</span></div>';
  }

  // long Korean answers get a smaller font
  const sizeClass = label => {
    const length = [...label].length;
    if (length > 8) return 'sm';
    if (length > 4) return 'md';
    return '';
  };
  const optionButton = (option, index) => {
    let label = `<span class="lbl">${option.label}</span>`;
    if (option.big) label = `<b class="${sizeClass(option.label)}">${option.label}</b>`;
    return `<button class="opt" data-tv="${esc(option.value)}" aria-pressed="${pick === option.value}">`
      + `<span class="k">${index + 1}</span>${label}</button>`;
  };
  const optionsHtml = question.options.map(optionButton).join('');

  const nextLabel = TS.i === count - 1 ? 'Finish test' : 'Next';
  const actionsHtml = [
    '<div class="test-actions"><button class="link" id="tqQuit">Stop test</button>',
    `<button class="btn btn-ink" id="tqNext" ${pick == null ? 'disabled' : ''}>${nextLabel}${icon('arrow')}</button></div>`,
  ].join('');

  $('testBody').innerHTML = `${topBar}
    <div class="test-q"><span class="kicker">${AREA_NAME[question.area]}</span><h2 class="prompt">${question.prompt}</h2>
      ${passageHtml}
      ${bigHtml}
      ${playHtml}
      <div class="opts">${optionsHtml}</div>
      ${actionsHtml}</div>`;
  tickTest();
  if (question.play) speak(question.play);
}

$('testBody').addEventListener('click', async event => {
  const target = event.target;
  const levelButton = target.closest('[data-tlevel]');
  if (levelButton) return startTest(+levelButton.dataset.tlevel);
  if (target.closest('[data-tplace]')) return startPlacement();
  if (target.closest('[data-tgolearn]')) {
    TS = null;
    renderTest();
    return show('learn');
  }
  if (!TS) return;
  const optionButton = target.closest('[data-tv]');
  if (optionButton && !TS.done) {
    TS.picks[TS.i] = optionButton.dataset.tv;
    $('testBody').querySelectorAll('[data-tv]').forEach(button => {
      button.setAttribute('aria-pressed', button === optionButton);
    });
    $('tqNext').disabled = false;
    return;
  }
  if (target.closest('#tqPlay')) return speak(TS.qs[TS.i].play);
  if (target.closest('#tqNext')) {
    if (TS.i < TS.qs.length - 1) {
      TS.i++;
      renderQuestion();
    } else {
      finishTest();
    }
    return;
  }
  if (target.closest('#tqQuit')) {
    const stop = await ask({
      title: 'Stop this test?',
      text: 'Your answers so far will not be scored.',
      ok: 'Stop test',
      cancel: 'Keep going',
      danger: true,
    });
    if (stop) stopTest();
    return;
  }
  if (target.closest('[data-tagain]')) return startTest(TS.si);
  if (target.closest('[data-tlevels]')) {
    TS = null;
    renderTest();
  }
});

// During a test: 1-4 pick an answer, Enter goes on, R replays the sound.
document.addEventListener('keydown', event => {
  if (view !== 'test' || !TS || TS.done || L || document.querySelector('dialog[open]')) return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  const number = +event.key;
  const question = TS.qs[TS.i];
  if (number >= 1 && number <= question.options.length) {
    $('testBody').querySelectorAll('[data-tv]')[number - 1].click();
  } else if (event.key === 'Enter' && !$('tqNext').disabled) {
    event.preventDefault();
    $('tqNext').click();
  } else if ((event.key === 'r' || event.key === 'R') && question.play) {
    speak(question.play);
  }
});

function stopTest() {
  clearInterval(testTimer);
  TS = null;
  renderTest();
}

// ---- Placement test: levels in order, 8 questions each; 75% moves on. The first level not passed becomes the
// starting level on Learn. No XP, reviews or mistakes: it only finds where to begin. ----
const PLACE_N = 8;
const PLACE_PASS = 75;

function startPlacement() {
  TS = { si: 0, qs: buildTest(0, PLACE_N), i: 0, picks: [], start: Date.now(), done: false, place: [] };
  clearInterval(testTimer);
  testTimer = setInterval(tickTest, 1000);
  renderQuestion();
}

// Scores the level just answered: a pass moves on to the next level, otherwise this level is where to start.
function finishPlacement() {
  clearInterval(testTimer);
  const rightCount = TS.qs.filter((q, k) => TS.picks[k] === q.answer).length;
  const score = pct(rightCount, TS.qs.length);
  TS.place.push([TS.si, score]);
  if (score >= PLACE_PASS && TS.si < SECTIONS.length - 1) {
    const nextLevel = TS.si + 1;
    Object.assign(TS, { si: nextLevel, qs: buildTest(nextLevel, PLACE_N), i: 0, picks: [], start: Date.now() });
    testTimer = setInterval(tickTest, 1000);
    return renderQuestion();
  }
  TS.done = true;
  TS.level = TS.si; // the level being learned now (TOPIK 6 if everything passed)
  P.section = TS.level;
  P.placed = TS.level;
  save();
  renderTest();
}

function renderPlacement() {
  const section = SECTIONS[TS.level];
  const levelRow = ([levelIndex, score]) => {
    const title = SECTIONS[levelIndex].title;
    const bar = progressPageBar(score, 100, title, `width:${score}%`);
    return `<div><span>${title}</span>${bar}<em>${score}%${score >= PLACE_PASS ? ' ✓' : ''}</em></div>`;
  };
  const headStart = `<div class="result-head">${seal(LEVEL_SEAL[TS.level], 'l', 'jade')}`
    + '<div><span class="kicker">Placement test</span>';
  const note = 'Start here. Learn now opens at this level; earlier levels stay open for review.';
  const buttons = `<button class="btn btn-ink" data-tgolearn>${icon('map')}Start learning</button>`
    + '<button class="btn" data-tlevels>All tests</button>';
  $('testBody').innerHTML = `${headStart}<div class="score-big">${section.title}</div>
    <p style="margin:6px 0 0">${note}</p></div></div>
    <div class="chart-card"><h3>By level</h3><div class="hbars">${TS.place.map(levelRow).join('')}</div></div>
    <div class="btn-row">${buttons}</div>`;
}

// Scores the test: XP, today's stats, Smart review and Mistakes for studied items, and the saved test history.
function finishTest() {
  if (TS.place) return finishPlacement();
  clearInterval(testTimer);
  const day = dayKey();
  const todayLog = todayStats(P, day);
  const areas = {}; // area -> [right, asked]
  const wrong = [];
  TS.qs.forEach((question, k) => {
    const ok = TS.picks[k] === question.answer;
    areas[question.area] ??= [0, 0];
    areas[question.area][1]++;
    if (ok) areas[question.area][0]++;
    // only items you have studied join Smart review and Mistakes (reading questions never do)
    const known = question.key && (P.srs?.[question.key] || unitPassed(P, question.unit));
    if (known) schedule(P, question.key, question.unit, ok, day);
    if (ok) {
      todayLog.correct++;
      todayLog[question.skill] = (todayLog[question.skill] || 0) + 1;
    } else {
      if (known) P.mistakes[question.key] = question.unit;
      wrong.push({ q: question, pick: TS.picks[k] });
    }
  });
  const score = TS.qs.filter((q, k) => TS.picks[k] === q.answer).length;
  const total = TS.qs.length;
  const xp = Math.round(score / total * 20);
  P.xp += xp;
  P.days[day] = (P.days[day] || 0) + xp;
  todayLog.seconds += Math.min(TEST_SECONDS, Math.round((Date.now() - TS.start) / 1000));
  P.tests ??= [];
  P.tests.push({ at: Date.now(), level: TS.si, score, total, areas });
  P.tests = P.tests.slice(-50);
  TS = { ...TS, done: true, result: { score, total, areas, wrong, xp, timeUp: !timeLeft() } };
  save();
  renderTest();
}

// the label of the option with this value, for the review list
const labelOf = (q, v) => q.options.find(o => o.value === v)?.label ?? '(no answer)';

function renderResult() {
  const { score, total, areas, wrong, xp, timeUp } = TS.result;
  const percent = pct(score, total);
  const pass = percent >= PASS_PCT;
  const levelTitle = SECTIONS[TS.si].title;

  const kicker = `${levelTitle} · practice test${timeUp ? ' · time ran out' : ''}`;
  const verdict = pass ? 'Likely pass at this level. Try the next one.' : `Keep practising: the pass mark is ${PASS_PCT}%.`;
  const summary = `${score} of ${total} right · +${xp} XP · ${verdict}`;

  const areaRow = ([area, [right, asked]]) => {
    const bar = progressPageBar(right, asked, AREA_NAME[area], `width:${pct(right, asked)}%`);
    const counts = `${right}/${asked} · ${pct(right, asked)}%`;
    return `<div><span>${AREA_NAME[area]}</span>${bar}<em class="muted">${counts}</em></div>`;
  };
  const areaRows = Object.entries(areas).map(areaRow).join('');

  const wrongItem = ({ q, pick }) => {
    const big = q.big ? `<b lang="ko">${q.big}</b> · ` : '';
    const yours = pick != null ? ` · yours: ${labelOf(q, pick)}` : '';
    return `<div><small class="muted">${AREA_NAME[q.area]} · ${q.prompt}</small><br>`
      + `${big}Right answer: <b>${labelOf(q, q.answer)}</b>${yours}</div>`;
  };
  let wrongHtml = '<p>A perfect score. Every question right.</p>';
  if (wrong.length) {
    wrongHtml = `<h2 class="section-title">To review (${wrong.length})</h2>`
      + `<div class="wrong-list">${wrong.map(wrongItem).join('')}</div>`;
  }

  const buttons = `<button class="btn btn-ink" data-tagain>Take another ${levelTitle} test</button>`
    + '<button class="btn" data-tlevels>Choose a level</button>';
  const sealHtml = seal(pass ? '합격' : '연습', 'l', pass ? '' : 'gold');
  $('testBody').innerHTML = `<div class="result-head">${sealHtml}<div><span class="kicker">${kicker}</span>
      <div class="score-big">${percent}%</div><p style="margin:6px 0 0">${summary}</p></div></div>
    <div class="chart-card"><h3>By area</h3><div class="area-bars">${areaRows}</div></div>
    ${wrongHtml}
    <div class="btn-row" style="margin-top:22px">${buttons}</div>`;
}

// ---------------- Stats ----------------
// Each skill over your practice tests: the last 3 tests that had it, against the 3 before
function skillTrend() {
  // average share right (%) of this area over the given tests, or null when there are none
  const average = (area, tests) => {
    if (!tests.length) return null;
    const shareSum = tests.reduce((sum, test) => sum + test.areas[area][0] / test.areas[area][1], 0);
    return Math.round(shareSum / tests.length * 100);
  };
  const rows = Object.keys(AREA_NAME).map(area => {
    const withArea = (P.tests || []).filter(test => test.areas?.[area]?.[1] > 0);
    return { area, now: average(area, withArea.slice(-3)), before: average(area, withArea.slice(-6, -3)) };
  }).filter(row => row.now != null);
  if (!rows.length) return '';

  const trendText = row => {
    if (row.before == null) return '';
    let direction = 'same as';
    if (row.now > row.before) direction = '▲ up';
    else if (row.now < row.before) direction = '▼ down';
    const from = row.now === row.before ? '' : 'from ';
    return ` · ${direction} ${from}${row.before}%`;
  };
  const rowHtml = row => {
    const color = row.now >= PASS_PCT ? 'var(--jade)' : 'var(--gold)';
    const bar = progressPageBar(row.now, 100, AREA_NAME[row.area], `width:${row.now}%;background:${color}`);
    return `<div><span>${AREA_NAME[row.area]}</span>${bar}<em>${row.now}%${trendText(row)}</em></div>`;
  };
  return '<div class="chart-card"><h3>By skill</h3><p>Your last 3 practice tests, against the 3 before.</p>'
    + `<div class="hbars">${rows.map(rowHtml).join('')}</div></div>`;
}

// The Stats page: summary tiles, then one chart card per topic.
function renderStatsPage() {
  const today = new Date();
  const dayFormat = { weekday: 'short', month: 'short', day: 'numeric' };
  const studyDays = Object.entries(P.days).filter(([, xp]) => xp > 0);
  const tile = (value, label) => `<div><b>${value}</b><small>${label}</small></div>`;
  const shortDate = key => {
    const [, month, day] = key.split('-');
    return `${+month}/${+day}`;
  };
  // one column of a bar chart; label is the number shown above it ('' for none)
  const barColumn = (title, label, height) => `<div title="${title}">${label}<i style="height:${height}%"></i></div>`;

  function summaryTiles() {
    const grammarMastered = GRAMMAR_ITEMS.filter(g => isMastered(P, keyOf(g))).length;
    const tiles = [
      [P.xp.toLocaleString(), 'total XP'],
      [P.bestStreak || streak(activeDays(P)), 'best streak (days)'],
      [studyDays.length, 'study days'],
      [`${wordsMastered(P)}<small>/${VOCAB.length}</small>`, 'words mastered'],
      [`${grammarMastered}<small>/${GRAMMAR_ITEMS.length}</small>`, 'grammar patterns mastered'],
      [((P.totals.listenSec || 0) / 3600).toFixed(1), 'hours listened'],
      [P.totals.smart || 0, 'Smart reviews'],
      [(P.tests || []).length, 'practice tests'],
    ];
    return `<div class="tiles">${tiles.map(([value, label]) => tile(value, label)).join('')}</div>`;
  }

  // heatmap: 26 weeks, Monday first
  function calendarCard() {
    const heatClass = (xp, future) => {
      if (future) return 'future';
      if (xp >= 60) return 'l4';
      if (xp >= 30) return 'l3';
      if (xp >= 15) return 'l2';
      if (xp > 0) return 'l1';
      return '';
    };
    const start = new Date(weekKey(today) + 'T12:00:00');
    start.setDate(start.getDate() - 25 * 7);
    const cells = [];
    for (let date = new Date(start); cells.length < 26 * 7; date.setDate(date.getDate() + 1)) {
      const xp = P.days[dayKey(date)] || 0;
      const future = date > today;
      const title = `${date.toLocaleDateString(undefined, dayFormat)}: ${xp} XP`;
      cells.push(`<i class="${heatClass(xp, future)}" title="${title}"></i>`);
    }
    const heatKey = [
      '<div class="heat-key">Less <i style="background:var(--hair-2)"></i>',
      '<i class="l1" style="background:color-mix(in srgb,var(--red) 30%,var(--card))"></i>',
      '<i style="background:color-mix(in srgb,var(--red) 55%,var(--card))"></i>',
      '<i style="background:color-mix(in srgb,var(--red) 80%,var(--card))"></i>',
      '<i style="background:var(--red)"></i> More</div>',
    ].join('');
    return `<div class="chart-card"><h3>Study calendar</h3><p>XP per day, last 6 months. Hover a day for its total.</p>
      <div class="heat" role="img" aria-label="Study calendar: ${studyDays.length} study days">${cells.join('')}</div>
      ${heatKey}</div>`;
  }

  // XP per week, last 12 weeks
  function weeksCard() {
    const weeks = Array.from({ length: 12 }, (_, k) => {
      const monday = new Date(weekKey(today) + 'T12:00:00');
      monday.setDate(monday.getDate() - (11 - k) * 7);
      const key = dayKey(monday);
      return [key, weekDays(key).reduce((sum, day) => sum + (P.days[day] || 0), 0)];
    });
    const max = Math.max(1, ...weeks.map(week => week[1]));
    const top = weeks.findIndex(week => week[1] === max);
    // the number shows on the best week and on this week
    const bars = weeks.map(([key, xp], i) => {
      const label = (i === top && xp) || i === 11 ? `<span>${xp}</span>` : '';
      return barColumn(`Week of ${shortDate(key)}: ${xp} XP`, label, xp / max * 100);
    });
    const axis = weeks.map(([key], i) => `<span>${i % 3 === 2 || i === 11 ? shortDate(key) : ''}</span>`);
    return `<div class="chart-card"><h3>XP per week</h3><p>Last 12 weeks, Monday to Sunday.</p>
      <div class="bars" role="img" aria-label="XP per week">${bars.join('')}</div>
      <div class="bar-x">${axis.join('')}</div></div>`;
  }

  // Smart review forecast: words due each day for the next 14 days (today includes anything overdue)
  function forecastCard() {
    const todayKey = dayKey(today);
    const dueDays = Object.values(P.srs || {}).map(card => card.due);
    const forecast = Array.from({ length: 14 }, (_, i) => {
      const key = addDays(todayKey, i);
      return [key, dueDays.filter(due => i ? due === key : due <= key).length];
    });
    const max = Math.max(1, ...forecast.map(f => f[1]));
    const top = forecast.findIndex(f => f[1] === max);
    const dayName = (key, i) => i ? new Date(key + 'T12:00').toLocaleDateString(undefined, dayFormat) : 'Today';
    const dueInTwoWeeks = forecast.reduce((sum, f) => sum + f[1], 0);
    const bars = forecast.map(([key, count], i) => {
      const label = (i === 0 || i === top) && count ? `<span>${count}</span>` : '';
      return barColumn(`${dayName(key, i)}: ${count} word${count === 1 ? '' : 's'} due`, label, count / max * 100);
    });
    const axisLabel = (key, i) => {
      if (i === 0) return 'Today';
      if (i % 4 === 0) return shortDate(key);
      return '';
    };
    const axis = forecast.map(([key], i) => `<span>${axisLabel(key, i)}</span>`);
    const ariaLabel = `Smart review forecast: ${forecast[0][1]} due today, ${dueInTwoWeeks} in the next 2 weeks`;
    const intro = 'Words due each day, next 2 weeks. Today includes anything overdue.';
    return `<div class="chart-card"><h3>Smart review forecast</h3><p>${intro}</p>
      <div class="bars" role="img" aria-label="${ariaLabel}">${bars.join('')}</div>
      <div class="bar-x">${axis.join('')}</div></div>`;
  }

  function levelsCard() {
    const rows = SECTIONS.map((section, levelIndex) => {
      const passed = sectionPassed(P, levelIndex);
      const unitCount = section.units.length;
      const bar = progressPageBar(passed, unitCount, section.title, `width:${passed / unitCount * 100}%`);
      return `<div><span>${section.title}</span>${bar}<em>${passed}/${unitCount} units</em></div>`;
    });
    return `<div class="chart-card"><h3>Progress by level</h3><p>Units passed (words and grammar).</p>
      <div class="hbars">${rows.join('')}</div></div>`;
  }

  // answers right by skill, last 70 days
  function skillsCard() {
    const sum = field => Object.values(P.log || {}).reduce((total, day) => total + (day[field] || 0), 0);
    const skills = [
      ['listen', 'listening'], ['read', 'reading'], ['write', 'building / writing'],
      ['grammar', 'grammar'], ['typed', 'words typed'], ['spoken', 'recordings'],
    ];
    const tiles = skills.map(([field, label]) => tile(sum(field).toLocaleString(), label));
    return `<div class="chart-card"><h3>Right answers by skill</h3><p>Last 10 weeks.</p>
      <div class="tiles" style="margin:0">${tiles.join('')}</div></div>`;
  }

  function toolsCard() {
    const drills = [['num', 'Numbers'], ['verb', 'Verb endings'], ['part', 'Particles'], ['sound', 'Sound changes']];
    const drillTile = ([kind, label]) => {
      const drill = P.drills?.[kind] || {};
      const right = +drill.right || 0;
      const tries = +drill.tries || 0;
      const accuracy = tries ? `<small> · ${Math.round(right / tries * 100)}%</small>` : '';
      return tile(`${right}${accuracy}`, label);
    };
    const storiesTile = tile(`${storiesRead(P)}<small>/${STORIES.length}</small>`, 'stories read');
    const talksTile = tile(`${talksDone(P)}<small>/${DIALOGUES.length}</small>`, 'conversations');
    const focusTile = tile(+P.totals.focus || 0, 'focus sessions');
    const shadowTile = tile(+P.totals.shadow || 0, 'shadowing recordings');
    const dictationTile = tile(+P.totals.dictation || 0, 'words typed from listening');
    return `<div class="chart-card"><h3>Practice page and tools</h3><p>Right answers and accuracy per drill, all time.</p>
      <div class="tiles" style="margin:0">${drills.map(drillTile).join('')}
        ${storiesTile}${talksTile}
        ${focusTile}${shadowTile}${dictationTile}</div></div>`;
  }

  // the last 6 practice tests, newest first, then the skill trend
  function testsCard() {
    if (!(P.tests || []).length) return '';
    const testRow = test => {
      const score = pct(test.score, test.total);
      const color = score >= PASS_PCT ? 'var(--jade)' : 'var(--gold)';
      const bar = progressPageBar(test.score, test.total, 'Score', `width:${score}%;background:${color}`);
      const date = new Date(test.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return `<div><span>${SECTIONS[test.level]?.title || '?'}</span>${bar}<em>${score}% · ${date}</em></div>`;
    };
    const rows = P.tests.slice(-6).reverse().map(testRow).join('');
    return `<div class="chart-card"><h3>Practice tests</h3><p>Most recent first.</p><div class="hbars">${rows}</div></div>`
      + skillTrend();
  }

  $('statsBody').innerHTML = [
    summaryTiles(),
    calendarCard(),
    weeksCard(),
    forecastCard(),
    levelsCard(),
    skillsCard(),
    toolsCard(),
    testsCard(),
  ].join('\n    ');
}
