// ---- Lesson player ----
// The full-screen lesson: shows one exercise at a time (intro card, multiple choice, typed answer or tiles),
// checks answers, keeps hearts and combo, records progress and shows the result screen.
// Needs from earlier scripts: $, icon, seal, long (icons.js); P, save, stat, held, ask (save.js);
// toast, pushInbox (notify.js); speak, sfx (sound.js); show (views.js); UNITS, SECTIONS, STEPS, HEARTS,
// PASS_STEP, CHALLENGE_STEP, examPlan, stepXp, schedule, learned, itemFor, todayStats, dayKey, shuffle,
// pickOne (lesson.js); composeJamo, KEY_JAMO, SHIFT_JAMO (hangul-ime.js).
// At call time: esc, PL (listen.js); addToNotebook, inNotebook (practice.js).
// Provides: L, PRAISE, examLine, startLesson, flushHeld, closeLesson, renderTop, KIND_KO, nextExercise,
// ready, renderTyped, renderTiles, setFoot, select, check, onAction, missedList, finish.

// The running lesson, or null: {make, meta:{unitIdx,step}, queue, total, done, hearts, right, wrong, combo,
// start, ex, sel, picked, answered, finished, passed}
let L = null;
const PRAISE = ['Correct', 'Well done', 'Exactly', 'Nicely done', 'That’s right'];

// TOPIK exam countdown on Learn (set in Settings › Goals)
function examLine() {
  const plan = examPlan(P);
  if (!plan) return '';
  const level = SECTIONS[plan.level].title;
  const plural = count => (count === 1 ? '' : 's');
  const daysLeft = `<b>${plan.days} day${plural(plan.days)}</b> to your ${level} exam`;
  let text;
  if (plan.days < 0) {
    text = `Your ${level} exam date has passed. Set the next one in Settings › Goals.`;
  } else if (plan.days === 0) {
    text = `${level} exam today. 화이팅!`;
  } else if (plan.left) {
    let pace;
    if (plan.perDay > 1) pace = `about ${plan.perDay} units a day`;
    else pace = `about 1 unit every ${plan.every} day${plural(plan.every)}`;
    text = `${daysLeft} · ${plan.left} unit${plural(plan.left)} to go · ${pace}`;
  } else {
    text = `${daysLeft} · every unit passed: keep reviewing and take practice tests`;
  }
  return `<p class="exam-line">${icon('award')}<span>${text}</span></p>`;
}

// Open the lesson screen. make() builds the exercise queue (called again for "Try again");
// meta.step is the path step, or null for reviews and mixes.
function startLesson(make, meta) {
  const queue = make();
  if (!queue.length) return;
  const resume = L?.resume || (typeof PL !== 'undefined' && PL.playing());
  // pause the podcast so lesson audio is clear; it plays on after the lesson
  if (typeof PL !== 'undefined' && PL.playing()) PL.toggle();
  const hearts = meta.step == null ? HEARTS : STEPS[meta.step].hearts;
  clearTimeout(L?.sayT);
  L = {
    make,
    meta,
    queue,
    total: queue.length,
    done: 0,
    hearts,
    right: 0,
    wrong: 0,
    combo: 0,
    start: Date.now(),
    resume,
    missed: new Map(),
  };
  $('lesson').hidden = false;
  document.body.classList.add('in-lesson');
  document.querySelector('.app').inert = true;
  nextExercise();
}

// Show the notifications held back during the lesson (at most the last 4)
function flushHeld() {
  held.splice(0).slice(-4).forEach(args => toast(...args));
}

// Leave the lesson screen, go back to Learn and resume the podcast if the lesson paused it
function closeLesson() {
  clearTimeout(L?.sayT);
  const resume = L?.resume;
  flushHeld();
  $('lesson').hidden = true;
  document.body.classList.remove('in-lesson');
  document.querySelector('.app').inert = false;
  L = null;
  show('learn');
  if (resume && typeof PL !== 'undefined' && !PL.playing()) PL.toggle();
}

// Progress bar and hearts at the top of the lesson
function renderTop() {
  $('lBar').style.width = L.done / L.total * 100 + '%';
  const bar = $('lBar').parentElement;
  bar.setAttribute('aria-valuemax', L.total);
  bar.setAttribute('aria-valuenow', Math.min(L.done, L.total));
  $('hearts').innerHTML = icon('heart') + L.hearts;
}

const KIND_KO = {'New letter': '새 글자', 'New syllable': '새 음절', 'New word': '새 단어', 'New grammar': '새 문법'};

// Take the next exercise from the queue and draw it (or finish when the queue is empty)
function nextExercise() {
  if (!L.queue.length) return finish(true);
  clearTimeout(L.sayT);
  const ex = L.ex = L.queue.shift();
  L.sel = null;
  L.picked = [];
  L.keys = [];
  L.answered = false;
  renderTop();

  const speakBtn = (cls = '') => {
    return `<button class="speak ${cls}" id="exPlay" aria-label="Play sound (R)">${icon('volume')}</button>`;
  };
  const glyph = text => `<div class="glyph${long(text) ? ' long' : ''}">${esc(text)}</div>`;

  function introHtml() {
    let example = '';
    if (ex.example) {
      const [korean, english] = ex.example;
      example = `<p class="intro-ex"><b lang="ko">${esc(korean)}</b><span>${esc(english)}</span></p>`;
    }
    return [
      `<div class="intro-card"><span class="kicker">${KIND_KO[ex.prompt]} · ${ex.prompt}</span>`,
      `\n      ${glyph(ex.big)}<p class="intro-meaning">${esc(ex.explain)}</p>${example}${speakBtn()}</div>`,
    ].join('');
  }

  function choiceHtml() {
    const optionHtml = (option, n) => {
      let label;
      if (option.big) {
        // long labels get a smaller font
        const length = [...option.label].length;
        let sizeClass = '';
        if (length > 8) sizeClass = 'sm';
        else if (length > 4) sizeClass = 'md';
        label = `<b class="${sizeClass}">${esc(option.label)}</b>`;
      } else {
        label = `<span class="lbl">${esc(option.label)}</span>`;
      }
      const keyNumber = `<span class="k">${n + 1}</span>`;
      return `<button class="opt" data-v="${esc(option.value)}" aria-pressed="false">${keyNumber}${label}</button>`;
    };
    return `<div class="opts">${ex.options.map(optionHtml).join('')}</div>`;
  }

  function typeHtml() {
    return [
      '<div class="type-box lesson-type" id="lType" role="textbox" aria-label="Type the answer">',
      '<span class="caret"></span></div>',
      '<p class="muted type-note">Type on your keyboard: keys follow the Korean 2-beolsik layout',
      ' (no Korean keyboard setting needed). Shift gives ㄲ ㄸ ㅃ ㅆ ㅉ ㅒ ㅖ, Backspace undoes a key.</p>',
    ].join('');
  }

  function questionHtml() {
    let html = `<h2 class="prompt">${esc(ex.prompt)}</h2>`;
    if (ex.big) {
      html += `<div class="prompt-glyph">${glyph(ex.big)}${ex.play ? speakBtn() : ''}</div>`;
    } else if (ex.play) {
      const note = '<span class="muted">Listen, then answer.<br>Press R to replay.</span>';
      html += `<div class="listen">${speakBtn('lg')}${note}</div>`;
    }
    if (ex.type === 'choice') html += choiceHtml();
    else if (ex.type === 'type') html += typeHtml();
    else html += '<div class="answer-line" id="slots"></div><div class="bank" id="bank"></div>';
    return html;
  }

  // Keyboard help under the exercise
  function keyboardHint() {
    const replay = ex.play ? ' · R replay · Shift+R slowly' : '';
    if (ex.type === 'intro') return 'Enter continue' + replay;
    if (ex.type === 'type') return 'Type the word · Enter check';
    const pick = ex.type === 'choice' ? `1–${ex.options.length} choose` : '1–9 pick a tile · Backspace undo';
    return pick + ' · Enter check' + replay;
  }

  const html = ex.type === 'intro' ? introHtml() : questionHtml();
  $('exercise').innerHTML = `<div class="enter">${html}</div>`;
  if (ex.type === 'tiles') renderTiles();
  setFoot('idle');
  $('kbd').textContent = keyboardHint();
  if (ex.play) speak(ex.play);
}

// Can the learner press Check (or Continue on an intro card)?
const ready = () => {
  if (L.ex.type === 'intro') return true;
  if (L.ex.type === 'choice') return L.sel != null;
  if (L.ex.type === 'type') return L.keys.length > 0;
  return L.picked.length > 0;
};

// Typed answer: the Hangul built from the keys pressed so far, with a caret while still typing
function renderTyped() {
  $('lType').innerHTML = `${esc(composeJamo(L.keys))}${L.answered ? '' : '<span class="caret"></span>'}`;
  setFoot('idle');
}

// Tiles exercise: the picked tiles in the answer line and the tile bank below
function renderTiles() {
  const ex = L.ex;
  const tileClass = ex.parts.join('').length > ex.parts.length ? 'tile word' : 'tile'; // phrase tiles are whole words
  const pickedHtml = L.picked.map((tileIndex, position) => {
    const disabled = L.answered ? 'disabled' : '';
    return `<button class="${tileClass}" data-j="${position}" ${disabled}>${esc(ex.tiles[tileIndex])}</button>`;
  }).join('');
  $('slots').innerHTML = pickedHtml || '<span class="hint">Tap the tiles below in order</span>';
  let freeNumber = 0; // free tiles are numbered: keys 1–9 pick them
  $('bank').innerHTML = ex.tiles.map((tile, tileIndex) => {
    const used = L.picked.includes(tileIndex);
    const keyNumber = used ? '' : ++freeNumber;
    const keyHint = keyNumber && keyNumber < 10 && !L.answered ? `<span class="tk">${keyNumber}</span>` : '';
    return [
      `<button class="${tileClass}${used ? ' used' : ''}" data-i="${tileIndex}" ${used || L.answered ? 'disabled' : ''}`,
      ` aria-label="${esc(tile)}">${keyHint}${esc(tile)}</button>`,
    ].join('');
  }).join('');
  setFoot('idle');
}

// The lesson footer: 'idle' (waiting for an answer), 'ok', 'bad' or 'finish'
function setFoot(state) {
  const foot = $('foot');
  const action = $('action');
  const feedback = $('fb');
  let footClass = '';
  if (state === 'ok') footClass = ' ok';
  else if (state === 'bad') footClass = ' bad';
  foot.className = 'lesson-foot' + footClass;
  $('kbd').hidden = state !== 'idle';
  if (state === 'idle') {
    feedback.innerHTML = '';
    action.textContent = L.ex.type === 'intro' ? 'Continue' : 'Check';
    action.className = 'btn btn-lg btn-ink';
    action.disabled = !ready();
  } else if (state === 'ok') {
    const combo = L.combo >= 3 ? `<span class="combo">${L.combo} in a row</span>` : '';
    feedback.innerHTML = `${seal('정답', 'm')}<div><h3>${pickOne(PRAISE)}${combo}</h3><p>${esc(L.ex.explain)}</p></div>`;
    action.textContent = 'Continue';
    action.className = 'btn btn-lg btn-jade';
    action.disabled = false;
  } else if (state === 'bad') {
    feedback.innerHTML = `<div><h3>아쉬워요<small>Not quite</small></h3><p>${esc(L.ex.explain)}</p></div>`;
    action.textContent = L.hearts > 0 ? 'Got it' : 'Continue';
    action.className = 'btn btn-lg btn-red';
    action.disabled = false;
  } else { // finish
    feedback.innerHTML = '';
    action.textContent = L.passed ? 'Continue' : 'Try again';
    action.className = 'btn btn-lg btn-ink';
    action.disabled = false;
  }
  action.focus({preventScroll: true, focusVisible: false}); // Enter works right away; ring only for keyboard users
}

// Pick a multiple-choice option
function select(value) {
  if (L.answered) return;
  L.sel = value;
  $('exercise').querySelectorAll('.opt').forEach(option => option.setAttribute('aria-pressed', option.dataset.v === value));
  setFoot('idle');
}

// Check the current answer, update hearts, stats and the review schedule, and show the feedback
function check() {
  const ex = L.ex;
  let value;
  if (ex.type === 'choice') value = L.sel;
  else if (ex.type === 'type') value = composeJamo(L.keys);
  else value = L.picked.map(i => ex.tiles[i]).join('');
  L.answered = true;
  const right = value === ex.answer;
  const itemStats = stat(ex.key);
  const dayStats = todayStats(P);
  itemStats.tries++;
  schedule(P, ex.key, ex.unit, right); // smart review: when to ask this again

  if (right) {
    if (ex.smart) dayStats.srs = (dayStats.srs || 0) + 1;
    if (ex.grammar) dayStats.grammar = (dayStats.grammar || 0) + 1;
    itemStats.right++;
    L.done++;
    L.right++;
    L.combo++;
    dayStats.correct++;
    dayStats[ex.skill] = (dayStats[ex.skill] || 0) + 1;
    dayStats.combo = Math.max(dayStats.combo, L.combo);
    if (L.meta.step == null) delete P.mistakes[ex.key]; // only a review clears mistakes
  } else {
    L.wrong++;
    L.combo = 0;
    L.hearts--;
    P.mistakes[ex.key] = ex.unit;
    L.missed.set(ex.key, ex);
    // missed questions come back at the end, options in a new order
    L.queue.push(ex.type === 'choice' ? {...ex, options: shuffle([...ex.options])} : ex);
    // restart the hearts animation: reading offsetWidth forces a reflow between remove and add
    $('hearts').classList.remove('hit');
    void $('hearts').offsetWidth;
    $('hearts').classList.add('hit');
  }

  if (ex.type === 'choice') {
    $('exercise').querySelectorAll('.opt').forEach(option => {
      option.disabled = true;
      if (option.dataset.v === ex.answer) option.classList.add('ok');
      else if (option.dataset.v === value) option.classList.add('bad');
    });
  } else if (ex.type === 'type') {
    renderTyped();
    $('lType').classList.add(right ? 'ok' : 'bad');
  } else {
    renderTiles();
  }
  renderTop();
  setFoot(right ? 'ok' : 'bad');
  sfx(right ? 'ok' : 'bad');
  L.sayT = setTimeout(() => speak(ex.say), 350);
  save();
}

// The footer button (and Enter): continue, check, next exercise, or leave / retry on the result screen
function onAction() {
  if (!L) return;
  if (L.finished) return L.passed ? closeLesson() : startLesson(L.make, L.meta);
  if (L.ex.type === 'intro') {
    L.done++;
    stat(L.ex.key).heard++;
    todayStats(P).intros++;
    learned(P, L.ex.key, L.ex.unit);
    return nextExercise();
  }
  if (!L.answered) return ready() && check();
  if (L.hearts > 0) nextExercise();
  else finish(false);
}
$('action').onclick = onAction;

// Clicks inside the exercise: replay, save a missed word, leave, pick an option or a tile
$('exercise').onclick = e => {
  const button = e.target.closest('button');
  if (!button || !L) return;
  if (button.id === 'exPlay') return speak(L.ex.play);
  if (button.dataset.msave !== undefined) {
    const item = itemFor(P, button.dataset.msave, button.dataset.unit);
    if (item && addToNotebook(item[1].ch, item[1].meaning)) {
      save();
      button.outerHTML = `<span class="muted miss-saved">${icon('star')}Saved</span>`;
    }
    return;
  }
  if (button.dataset.leave !== undefined) return closeLesson();
  if (L.answered || button.disabled) return;
  if (button.dataset.v !== undefined) {
    select(button.dataset.v);
  } else if (button.dataset.i !== undefined) {
    L.picked.push(+button.dataset.i);
    renderTiles();
  } else if (button.dataset.j !== undefined) {
    L.picked.splice(+button.dataset.j, 1);
    renderTiles();
  }
};

// The items you got wrong in this lesson: hear them again, keep words in My words
function missedList() {
  if (!L.missed.size) return '';
  const rows = [...L.missed.values()].map(ex => {
    const item = itemFor(P, ex.key, ex.unit);
    // only words can be saved; an item from My words (not a numbered unit) is a word too
    const isWord = item && (typeof item[0] === 'number' ? UNITS[item[0]].kind === 'word' : true);
    let saveHtml = '';
    if (isWord) {
      if (inNotebook(item[1].ch)) {
        saveHtml = `<span class="muted miss-saved">${icon('star')}Saved</span>`;
      } else {
        saveHtml = [
          `<button class="link" data-msave="${esc(ex.key)}" data-unit="${esc(ex.unit)}">`,
          `${icon('star')}Save</button>`,
        ].join('');
      }
    }
    return [
      `<li><button class="icon-btn" data-say="${esc(ex.say)}" aria-label="Hear">${icon('volume')}</button>`,
      `<span lang="ko">${esc(ex.explain)}</span>${saveHtml}</li>`,
    ].join('');
  }).join('');
  return `<div class="missed"><h3>To look at again</h3><ul>${rows}</ul></div>`;
}

// End of the lesson: record XP and progress when passed, then show the result screen
function finish(passed) {
  L.finished = true;
  L.passed = passed;
  renderTop();
  if (passed) $('lBar').style.width = '100%';
  const secs = Math.round((Date.now() - L.start) / 1000);
  const answers = L.right + L.wrong;
  const accuracy = answers ? Math.round(L.right / answers * 100) : 100;
  let xp = 0;
  let unlock = '';
  todayStats(P).seconds += secs; // study time counts even when hearts run out

  // A passed path step: count it, and passing the Practice step opens the next unit of the same track
  function recordStep(step, dayStats) {
    const unit = UNITS[L.meta.unitIdx];
    const stepKey = unit.id + ':' + step;
    const firstPass = !(P.units[unit.id] > 0);
    P.steps[stepKey] = (P.steps[stepKey] || 0) + 1;
    if (step === PASS_STEP) {
      dayStats.practice++;
      P.units[unit.id] = (P.units[unit.id] || 0) + 1;
      const isGrammar = unit.kind === 'grammar';
      const nextUnit = UNITS.slice(L.meta.unitIdx + 1)
        .find(x => x.section === unit.section && (x.kind === 'grammar') === isGrammar);
      if (firstPass && nextUnit) {
        unlock = `Next lesson unlocked: ${nextUnit.title}`;
        pushInbox('unlock', `${nextUnit.title} is open`, `${SECTIONS[nextUnit.section].title} · next lesson`);
      }
    }
    if (step === CHALLENGE_STEP) {
      dayStats.challenges++;
      P.totals.challenges++;
    }
  }

  if (passed) {
    const day = dayKey();
    const dayStats = todayStats(P, day);
    const step = L.meta.step;
    xp = stepXp(step, L.hearts);
    P.xp += xp;
    P.days[day] = (P.days[day] || 0) + xp;
    dayStats.lessons++;
    P.totals.lessons++;
    if (L.wrong === 0) {
      dayStats.perfect++;
      P.totals.perfect++;
    }
    if (step == null) {
      dayStats.reviews++;
      P.totals.reviews++;
      if (L.meta.smart) P.totals.smart = (P.totals.smart || 0) + 1;
    } else {
      recordStep(step, dayStats);
    }
  }

  const where = L.meta.step == null ? 'Review' : `${UNITS[L.meta.unitIdx].title} · ${STEPS[L.meta.step].name}`;
  let heading = 'Out of hearts';
  if (passed) heading = L.wrong === 0 ? 'A perfect lesson' : 'Lesson complete';
  const xpResult = passed ? `<div><b>+${xp}</b><small>XP</small></div>` : '';
  const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  $('exercise').innerHTML = [
    '<div class="finish enter">',
    `<div class="big-stamp${passed ? '' : ' fail'}"><span>${passed ? '참 잘했어요' : '다시 해 봐요'}</span></div>`,
    `<h2>${heading}</h2>`,
    `<p>${passed ? where : 'What you missed is saved in Review mistakes.'}</p>`,
    [
      `<div class="results">${xpResult}<div><b>${accuracy}%</b><small>accuracy</small></div>`,
      `<div><b>${time}</b><small>time</small></div></div>`,
    ].join(''),
    unlock ? `<div class="unlock">${unlock}</div>` : '',
    missedList(),
    `${passed ? '' : '<p><button class="link" data-leave>Back to the path</button></p>'}</div>`,
  ].join('\n    ');
  setFoot('finish');
  if (passed) sfx('done');
  save();
  flushHeld(); // rewards earned during the lesson appear on the result screen
}

$('quit').onclick = async () => {
  if (L?.finished) return closeLesson();
  const leave = await ask({
    title: 'Leave this lesson?',
    text: 'You will lose the XP for this lesson. Anything you got wrong stays in Review mistakes.',
    ok: 'Leave lesson',
    cancel: 'Keep learning',
    danger: true,
    sealText: '?',
  });
  if (leave) closeLesson();
};

// Lesson keys: Enter, Escape, typing, R to replay, 1–9 to pick, Backspace to undo a tile
document.addEventListener('keydown', e => {
  if (!L || $('lesson').hidden || $('ask').open || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    return onAction();
  }
  if (e.key === 'Escape') return $('quit').click();
  if (L.finished) return;
  if (L.ex.type === 'type' && !L.answered) { // typed answer: letter keys write Korean (2-beolsik), so R doesn't replay here
    let jamo;
    if (e.code === 'Space') jamo = ' ';
    else jamo = e.shiftKey && SHIFT_JAMO[e.code] || KEY_JAMO[e.code];
    if (jamo) {
      e.preventDefault();
      L.keys.push(jamo);
      renderTyped();
    } else if (e.code === 'Backspace') {
      e.preventDefault();
      L.keys.pop();
      renderTyped();
    }
    return;
  }
  if (e.key === 'r' || e.key === 'R') {
    if (L.ex.play) speak(L.ex.play, e.shiftKey ? .7 : 1);
    return;
  }
  if (L.answered) return;
  const number = +e.key;
  if (number >= 1 && number <= 9) {
    if (L.ex.type === 'choice' && L.ex.options[number - 1]) select(L.ex.options[number - 1].value);
    if (L.ex.type === 'tiles') {
      const freeTiles = L.ex.tiles.map((_, i) => i).filter(i => !L.picked.includes(i));
      if (freeTiles[number - 1] != null) {
        L.picked.push(freeTiles[number - 1]);
        renderTiles();
      }
    }
  }
  if (e.key === 'Backspace' && L.ex.type === 'tiles' && L.picked.length) {
    L.picked.pop();
    renderTiles();
  }
});
