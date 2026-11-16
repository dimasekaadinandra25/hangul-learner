// Practice tools: the word sheet (hear a word, save it to My words, record yourself, check your pronunciation),
// My words (add, import, export), stroke order on the Write › Trace pad, and typing (Write › Type, Listen, Race).
//
// Needs from earlier scripts: $, P, save, speak, sfx, toast, setMsg, icon, esc, dayKey, todayStats, stat,
// UNITS, VOCAB, SECTIONS, GRAMMAR_ITEMS, STORIES, RECORDED, audioName, familiesOf, parseWordList, shuffle, micHelp,
// openLink, naverUrl, tauri, update, view, L; the Write pad (cv, PAD, cur) from write.js; STROKES, samplePoints,
// strokeScore, strokeOrderIssue from strokes.js; KEY_ROWS, KEY_JAMO, SHIFT_JAMO, JAMO_KEY, composeJamo, keysFor
// from hangul-ime.js.
// Provides: openWord, closeSheet, inNotebook, addToNotebook, removeFromNotebook, renderMineCount, recordClip,
// unitOfWord, drawGuide, myStrokes, wTab, typeable, TY, tKey, tRender, raceTick.

// The word unit that teaches a word, if any
const unitOfWord = ch => UNITS.find(unit => unit.kind === 'word' && unit.items.some(item => item.ch === ch));

// ---------------- Word sheet ----------------
let wsW = null; // the word the sheet shows (see findWord)
let nativeBuf = null; // the word's recording, decoded (AudioBuffer)
let mineBuf = null; // your recording of it, decoded
let recUrl = null; // object URL of your latest recording
let mediaRec = null; // the MediaRecorder of the latest recording
let recTimer = 0; // stops a recording after a few seconds
let wctx = null; // the AudioContext, made on first use
const audioCtx = () => wctx ??= new AudioContext();

// A word for the sheet: from the course vocabulary, else from My words (custom: no recorded voice). null if unknown.
function findWord(ch) {
  const courseWord = VOCAB.find(word => word.ch === ch);
  if (courseWord) {
    return {...courseWord, kicker: `${SECTIONS[courseWord.section].title} · ${courseWord.unit}`};
  }
  const myWord = (P.notebook || []).find(word => word.ch === ch);
  if (myWord) {
    return {ch: myWord.ch, meaning: myWord.meaning, say: myWord.ch, kicker: 'My words', custom: true};
  }
  return null;
}

// Open the word sheet: show the word and its Hanja families, say it, count it as heard, load its recording
function openWord(ch) {
  const word = findWord(ch);
  if (!word) return;

  // Words sharing a Hanja root with this one, as chips that open them
  const familiesHtml = () => familiesOf(word.ch).map(family => {
    const root = `<b title="Hanja root"><span lang="zh">${family.han}</span>${family.ko} · ${esc(family.en)}</b>`;
    const chips = family.words.map(member => {
      const current = member === word.ch ? ' aria-current="true"' : '';
      return `<button class="wc" lang="ko" data-word="${esc(member)}"${current}>${esc(member)}</button>`;
    }).join('');
    return `<div class="fam">${root}${chips}</div>`;
  }).join('');

  wsW = word;
  nativeBuf = null;
  mineBuf = null;
  if (recUrl) {
    URL.revokeObjectURL(recUrl);
    recUrl = null;
  }
  $('wsKicker').textContent = word.kicker;
  $('wsWord').textContent = word.ch;
  $('wsWord').classList.toggle('long', [...word.ch].length > 6);
  $('wsMean').textContent = word.meaning;
  $('wsMine').disabled = true;
  $('wsBoth').disabled = true;
  $('wsLen').textContent = '';
  const noVoice = 'Your own words have no recorded voice: Hear uses your computer’s Korean voice if it has one.';
  setMsg('wsMsg', word.custom ? noVoice : '');
  $('wsFam').innerHTML = familiesHtml();
  renderSave();
  drawWave();
  // the sheet may be open already: a word family chip inside it opens another word
  if (!$('wordSheet').open) $('wordSheet').showModal();
  $('wsClose').focus({focusVisible: false});
  speak(word.say);
  stat(word.ch).heard++;
  todayStats(P).heard++;
  save();
  if (RECORDED.includes(word.say)) {
    fetch('audio/' + audioName(word.say))
      .then(response => response.arrayBuffer())
      .then(bytes => audioCtx().decodeAudioData(bytes))
      .then(buffer => {
        if (wsW === word) { // the sheet may show another word by now
          nativeBuf = buffer;
          drawWave();
        }
      })
      .catch(() => {});
  }
}
// Any element with data-word opens the word sheet for that word
document.addEventListener('click', event => {
  const wordElement = event.target.closest('[data-word]');
  if (wordElement) openWord(wordElement.dataset.word);
});
const closeSheet = () => {
  if (mediaRec?.state === 'recording') mediaRec.stop();
  $('wordSheet').close();
};
$('wsClose').onclick = closeSheet;
// a click on the backdrop (the dialog element itself) closes the sheet
$('wordSheet').addEventListener('click', event => {
  if (event.target === $('wordSheet')) closeSheet();
});
$('wsHear').onclick = () => wsW && speak(wsW.say);
$('wsSlow').onclick = () => wsW && speak(wsW.say, 0.7);
$('wsLook').onclick = () => wsW && openLink(naverUrl(wsW.ch));

// ---- My words ----
const inNotebook = ch => (P.notebook || []).some(word => word.ch === ch);
// The sheet's Save button: shows whether its word is in My words
function renderSave() {
  const saved = inNotebook(wsW.ch);
  $('wsSave').innerHTML = saved ? `${icon('star', true)}Saved · Remove` : `${icon('star', false)}Save to My words`;
  $('wsSave').setAttribute('aria-pressed', saved);
}
// Add a word to My words; false when it is there already
function addToNotebook(ch, meaning) {
  P.notebook ??= [];
  if (inNotebook(ch)) return false;
  P.notebook.push({ch, meaning, added: Date.now()});
  if (!P.srs?.[ch]) {
    // due today, so it shows up in today's Smart review
    P.srs ??= {};
    P.srs[ch] = {u: unitOfWord(ch)?.id || 'mine', iv: 0, ease: 2.3, due: dayKey()};
  }
  return true;
}
// Remove a word from My words, and from the review when it was there only as one of My words
function removeFromNotebook(ch) {
  P.notebook = (P.notebook || []).filter(word => word.ch !== ch);
  if (P.srs?.[ch]?.u === 'mine') delete P.srs[ch];
}
$('wsSave').onclick = () => {
  if (inNotebook(wsW.ch)) {
    removeFromNotebook(wsW.ch);
    if (wsW.custom) closeSheet(); // a word of your own no longer exists once removed
  } else {
    addToNotebook(wsW.ch, wsW.meaning);
  }
  if (!wsW.custom || inNotebook(wsW.ch)) renderSave();
  save();
};
// the mini player's ☆ button saves (or removes) the word on its card
tauri?.event.listen('mini-save', event => {
  const ch = String(event.payload?.ch || '').slice(0, 40);
  const meaning = String(event.payload?.meaning || '').slice(0, 80);
  if (!ch || !meaning) return;
  if (inNotebook(ch)) removeFromNotebook(ch);
  else addToNotebook(ch, meaning);
  save();
  update();
});
// Export My words as CSV (Korean,English; UTF-8 with BOM so Excel shows Hangul). Anki: File › Import, comma separated.
const csvCell = value => /[",\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
$('exportWords').onclick = async () => {
  const list = P.notebook || [];
  if (!list.length) return setMsg('exportMsg', 'My words is empty.', true);
  const name = `hangul-my-words-${dayKey()}.csv`;
  const rows = list.map(word => csvCell(word.ch) + ',' + csvCell(word.meaning));
  const data = '\ufeff' + rows.join('\r\n') + '\r\n';
  if (!tauri) {
    // in a browser: download it
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([data], {type: 'text/csv'}));
    link.download = name;
    link.click();
    return;
  }
  try {
    const path = await tauri.core.invoke('export_backup', {name, data});
    const showButton = '<button class="link" id="showWords">Show in folder</button>';
    $('exportMsg').innerHTML = `${list.length} words saved · ${showButton}`;
    $('exportMsg').classList.remove('bad');
    $('showWords').onclick = () => tauri.core.invoke('show_in_folder', {path});
  } catch (error) {
    setMsg('exportMsg', 'Could not save: ' + error, true);
  }
};
// Import a word list into My words (parseWordList is in practice-data.js)
$('importWords').onchange = async event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > 5e6) return toast('sync', 'That file is too big', 'Word lists up to 5 MB', 'upload');
  const list = parseWordList(await file.text());
  let added = 0;
  for (const [ko, en] of list.slice(0, 2000)) {
    if (addToNotebook(ko, en)) added++;
  }
  save();
  const title = added ? `Imported ${added} word${added === 1 ? '' : 's'}` : 'No new words found';
  const notAdded = list.length - added;
  const detail = list.length > added
    ? `${notAdded} already in My words or skipped`
    : 'They are in My words and today’s Smart review';
  toast('sync', title, detail, 'upload');
};
// the number of My words, after its title
const renderMineCount = () => {
  const count = (P.notebook || []).length;
  $('mineCount').textContent = count ? `(${count})` : '';
};
$('addWord').onsubmit = event => {
  event.preventDefault();
  const ko = $('awKo').value.trim().slice(0, 40);
  const en = $('awEn').value.trim().slice(0, 80);
  if (!/[가-힣]/.test(ko)) {
    return toast('sync', 'Type the word in Korean', 'Use the Korean keyboard, or copy it from somewhere.', 'keyboard');
  }
  if (!en) return;
  if (!addToNotebook(ko, en)) return toast('sync', 'Already in My words', ko, 'star');
  $('awKo').value = '';
  $('awEn').value = '';
  save();
  $('awKo').focus();
};

// Records the microphone for ms milliseconds -> an object URL of the recording (throws when there is no microphone)
async function recordClip(ms) {
  const stream = await navigator.mediaDevices.getUserMedia({audio: true});
  try {
    const chunks = [];
    const recorder = new MediaRecorder(stream);
    const stopped = new Promise(resolve => {
      recorder.onstop = resolve;
    });
    recorder.ondataavailable = event => event.data.size && chunks.push(event.data);
    recorder.start();
    setTimeout(() => recorder.state === 'recording' && recorder.stop(), ms);
    await stopped;
    return URL.createObjectURL(new Blob(chunks, {type: recorder.mimeType}));
  } finally {
    stream.getTracks().forEach(track => track.stop());
  }
}

// ---- Say it: record yourself, compare the sound shapes ----
let micOpening = false; // asking for the microphone: a second click waits for that

// The Record button: records you saying the sheet's word, or stops the recording in progress.
// It stops by itself 1.5 s after the length of the word's recording (2.5 to 6 seconds in all).
async function record() {
  if (mediaRec?.state === 'recording') {
    mediaRec.stop();
    return;
  }
  if (micOpening) return;
  let stream;
  micOpening = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({audio: true});
  } catch (error) {
    return setMsg('wsMsg', 'No microphone found, or the app may not use it. ' + micHelp(), true);
  } finally {
    micOpening = false;
  }
  const chunks = [];
  const word = wsW;

  const finishRecording = async () => {
    clearTimeout(recTimer);
    stream.getTracks().forEach(track => track.stop());
    $('wsRec').classList.remove('recording');
    $('wsRecLbl').textContent = 'Record again';
    if (wsW !== word || !chunks.length) return; // the sheet shows another word by now
    const blob = new Blob(chunks, {type: mediaRec.mimeType});
    if (recUrl) URL.revokeObjectURL(recUrl);
    recUrl = URL.createObjectURL(blob);
    $('wsMine').disabled = false;
    $('wsBoth').disabled = !nativeBuf;
    P.totals.recordings = (P.totals.recordings || 0) + 1;
    todayStats(P).spoken = (todayStats(P).spoken || 0) + 1;
    save();
    try {
      mineBuf = await audioCtx().decodeAudioData(await blob.arrayBuffer());
      drawWave();
    } catch {}
    setMsg('wsMsg', '');
  };

  mediaRec = new MediaRecorder(stream);
  mediaRec.ondataavailable = event => event.data.size && chunks.push(event.data);
  mediaRec.onstop = finishRecording;
  mediaRec.start();
  $('wsRec').classList.add('recording');
  $('wsRecLbl').textContent = 'Stop';
  setMsg('wsMsg', 'Recording… say the word now.');
  const maxMs = Math.min(6000, Math.max(2500, (nativeBuf?.duration || 1.5) * 1000 + 1500));
  recTimer = setTimeout(() => mediaRec?.state === 'recording' && mediaRec.stop(), maxMs);
}
$('wsRec').onclick = record;
// Pronunciation check: Windows listens once and picks what it heard from the word plus a few look-alikes
// (a list, not free dictation, so it works offline and a wrong sound doesn't count as the word).
// The look-alikes are single words of about the same length, those sharing a syllable with the word first.
function lookAlikes(ch, n = 6) {
  const syllables = new Set(ch);
  const length = [...ch].length;
  const pool = VOCAB.filter(word => {
    return word.ch !== ch && !word.ch.includes(' ') && Math.abs([...word.ch].length - length) <= 1;
  });
  const sharingSyllable = shuffle(pool.filter(word => [...word.ch].some(syllable => syllables.has(syllable))));
  return [...sharingSyllable, ...shuffle(pool)]
    .map(word => word.ch)
    .filter((candidate, index, all) => all.indexOf(candidate) === index)
    .slice(0, n);
}
$('wsCheck').hidden = !tauri || !navigator.userAgent.includes('Windows'); // Windows speech recognition only
$('wsCheck').onclick = async () => {
  const word = wsW;
  if (!word || mediaRec?.state === 'recording') return;
  $('wsCheck').disabled = true;
  setMsg('wsMsg', 'Listening… say the word now.');
  try {
    const heard = (await tauri.core.invoke('recognize', {phrases: [word.ch, ...lookAlikes(word.ch)]})).trim();
    if (wsW !== word) return;
    if (heard === word.ch) {
      P.totals.pron = (P.totals.pron || 0) + 1;
      todayStats(P).spoken = (todayStats(P).spoken || 0) + 1;
      save();
      sfx('ok');
      setMsg('wsMsg', `Recognised: ${word.ch} ✓ Windows understood you.`);
    } else {
      sfx('bad');
      const tryAgain = heard
        ? `Windows heard “${heard}”. Listen again and try once more.`
        : 'Didn’t catch a word. Try again, a little closer to the microphone.';
      setMsg('wsMsg', tryAgain, true);
    }
  } catch (error) {
    const needsSpeechPack = 'Windows needs its Korean speech pack for this: '
      + 'Settings › Time & language › Language & region › add Korean (or open its Language options) › '
      + 'Speech recognition. Then try again.';
    setMsg('wsMsg', String(error).includes('NO_KOREAN') ? needsSpeechPack : 'Could not listen: ' + error, true);
  } finally {
    $('wsCheck').disabled = false;
  }
};
// Plays your latest recording; resolves when it ends, fails, or when there is none
const playMine = () => new Promise(resolve => {
  if (!recUrl) return resolve();
  const audio = new Audio(recUrl);
  audio.onended = resolve;
  audio.onerror = resolve;
  audio.play().catch(resolve);
});
$('wsMine').onclick = playMine;
// the word's recording, then yours
$('wsBoth').onclick = () => {
  const nativeAudio = new Audio('audio/' + audioName(wsW.say));
  nativeAudio.onended = () => setTimeout(playMine, 300);
  nativeAudio.play().catch(() => {});
};
// Loudness envelope with silence trimmed at both ends -> {v: n values 0..1, sec: seconds of sound}
function envelope(buf, n = 120) {
  const samples = buf.getChannelData(0);
  const windowSize = Math.max(1, Math.floor(samples.length / 600));
  const loudness = []; // RMS of each window of samples
  for (let start = 0; start < samples.length; start += windowSize) {
    let sumOfSquares = 0;
    for (let j = start; j < Math.min(samples.length, start + windowSize); j++) {
      sumOfSquares += samples[j] * samples[j];
    }
    loudness.push(Math.sqrt(sumOfSquares / windowSize));
  }
  const loudest = Math.max(...loudness) || 1;
  const isSound = loudness.map(value => value / loudest > 0.08); // quieter than 8% of the loudest is silence
  const first = isSound.indexOf(true);
  const last = isSound.lastIndexOf(true);
  if (first < 0) return {v: [], sec: 0};
  const sound = loudness.slice(first, last + 1).map(value => value / loudest);
  return {
    v: Array.from({length: n}, (_, k) => sound[Math.floor(k / n * sound.length)]),
    sec: (last - first + 1) * windowSize / buf.sampleRate,
  };
}
// The sound shapes in the word sheet: the word's recording above the line, yours below, on one time scale
function drawWave() {
  const canvas = $('wsWave');
  const g = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  const css = getComputedStyle(document.body);
  g.clearRect(0, 0, width, height);
  const rows = [
    {buffer: nativeBuf, color: css.getPropertyValue('--ink').trim(), middle: height * 0.25},
    {buffer: mineBuf, color: css.getPropertyValue('--red').trim(), middle: height * 0.75},
  ];
  const envelopes = rows.map(row => row.buffer ? envelope(row.buffer) : null);
  const longest = Math.max(0.5, ...envelopes.map(shape => shape?.sec || 0));

  const drawPlaceholder = (rowIndex, middle) => {
    let text = 'Record to see your sound shape';
    if (rowIndex === 0) text = wsW?.custom ? 'No recorded voice for this word' : 'Loading…';
    g.fillStyle = css.getPropertyValue('--muted').trim();
    g.font = '26px Segoe UI, sans-serif';
    g.fillText(text, 20, middle + 9);
  };
  // the shape mirrored around its row's middle line
  const drawShape = (shape, color, middle) => {
    const shapeWidth = width * shape.sec / longest;
    const amplitude = height * 0.22;
    const values = shape.v;
    const xAt = i => i / (values.length - 1) * shapeWidth;
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, middle);
    values.forEach((value, i) => g.lineTo(xAt(i), middle - value * amplitude));
    for (let i = values.length - 1; i >= 0; i--) g.lineTo(xAt(i), middle + values[i] * amplitude);
    g.closePath();
    g.fill();
  };

  g.strokeStyle = css.getPropertyValue('--hair').trim();
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, height / 2);
  g.lineTo(width, height / 2);
  g.stroke();
  rows.forEach((row, rowIndex) => {
    const shape = envelopes[rowIndex];
    if (!shape || !shape.v.length) drawPlaceholder(rowIndex, row.middle);
    else drawShape(shape, row.color, row.middle);
  });
  const [nativeShape, mineShape] = envelopes;
  $('wsLen').textContent = nativeShape?.sec && mineShape?.sec
    ? `Native ${nativeShape.sec.toFixed(1)} s · You ${mineShape.sec.toFixed(1)} s`
    : '';
}

// ---------------- Stroke order (Write › Trace) ----------------
const BOX = [30, 310]; // the template's 100x100 box on the 340px pad
const toPad = ([x, y]) => [BOX[0] + x * (BOX[1] - BOX[0]) / 100, BOX[0] + y * (BOX[1] - BOX[0]) / 100];
const fromPad = ([x, y]) => [(x - BOX[0]) * 100 / (BOX[1] - BOX[0]), (y - BOX[0]) * 100 / (BOX[1] - BOX[0])];
let myStrokes = []; // what you drew, in template units: one list of points per stroke
let anim = 0; // the animation frame of "Show stroke order"
const guideCv = $('wGuideCv');
const gctx = guideCv.getContext('2d');
// Draw one template stroke on the guide canvas g, or only its first `upto` part (0..1)
function strokePath(g, s, upto = 1) {
  const points = samplePoints([s], 2);
  const count = Math.max(2, Math.round(points.length * upto));
  g.beginPath();
  points.slice(0, count).forEach((point, i) => {
    const [x, y] = toPad(point);
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  });
  g.stroke();
}
// The stroke guide for the current letter: every stroke faint, with its number at its start point.
// progress = [stroke index, 0..1] while animating: the strokes so far in red, later numbers hidden.
function drawGuide(progress = null) {
  const strokes = STROKES[cur().ch] || [];
  const css = getComputedStyle(document.body);
  const ink = css.getPropertyValue('--ink').trim();
  const red = css.getPropertyValue('--red').trim();
  gctx.clearRect(0, 0, 340, 340);
  if (guideCv.hidden) return;
  Object.assign(gctx, {lineWidth: 15, lineCap: 'round', lineJoin: 'round', strokeStyle: ink, globalAlpha: .1});
  strokes.forEach(stroke => strokePath(gctx, stroke));
  if (progress) {
    const [strokeIndex, fraction] = progress;
    Object.assign(gctx, {strokeStyle: red, globalAlpha: .75});
    strokes.forEach((stroke, i) => {
      if (i < strokeIndex) strokePath(gctx, stroke);
      else if (i === strokeIndex) strokePath(gctx, stroke, fraction);
    });
  }
  gctx.globalAlpha = 1;
  // numbered start points
  strokes.forEach((stroke, i) => {
    if (progress && i > progress[0]) return;
    const [x, y] = toPad(stroke[0]);
    gctx.fillStyle = red;
    gctx.beginPath();
    gctx.arc(x, y, 11, 0, 7);
    gctx.fill();
    gctx.fillStyle = '#fff';
    gctx.font = 'bold 13px Segoe UI, sans-serif';
    gctx.textAlign = 'center';
    gctx.textBaseline = 'middle';
    gctx.fillText(i + 1, x, y + 1);
  });
}
// Show stroke order: turn the guide on and draw the strokes one after another, 700 ms each
$('wOrder').onclick = () => {
  cancelAnimationFrame(anim);
  guideCv.hidden = false;
  $('wGuide').textContent = 'Guide on';
  $('wGuide').setAttribute('aria-pressed', true);
  const strokeCount = (STROKES[cur().ch] || []).length;
  const startTime = performance.now();
  const msPerStroke = 700;
  const step = now => {
    const strokesDrawn = (now - startTime) / msPerStroke;
    const strokeIndex = Math.floor(strokesDrawn);
    if (strokeIndex >= strokeCount) return drawGuide();
    drawGuide([strokeIndex, strokesDrawn - strokeIndex]);
    anim = requestAnimationFrame(step);
  };
  anim = requestAnimationFrame(step);
};
$('wGuide').onclick = event => {
  guideCv.hidden = !guideCv.hidden;
  event.currentTarget.textContent = 'Guide ' + (guideCv.hidden ? 'off' : 'on');
  event.currentTarget.setAttribute('aria-pressed', !guideCv.hidden);
  drawGuide();
};
// collect what you draw (in template units) next to the main pad handlers
const padPos = event => {
  const rect = cv.getBoundingClientRect();
  return fromPad([(event.clientX - rect.left) * PAD / rect.width, (event.clientY - rect.top) * PAD / rect.height]);
};
let drawingNow = false;
cv.addEventListener('pointerdown', event => {
  drawingNow = true;
  myStrokes.push([padPos(event)]);
});
cv.addEventListener('pointermove', event => {
  if (drawingNow) myStrokes[myStrokes.length - 1].push(padPos(event));
});
addEventListener('pointerup', () => {
  drawingNow = false;
});
const resetStrokes = () => {
  myStrokes = [];
  $('wScore').innerHTML = '';
};
$('wClear').addEventListener('click', resetStrokes);
$('wNext').addEventListener('click', () => {
  resetStrokes();
  drawGuide();
});
$('wSel').addEventListener('change', () => {
  resetStrokes();
  drawGuide();
});
// Check: score the shape (stars) and the stroke order, and say what to try next
$('wCheck').onclick = () => {
  const ch = cur().ch;
  const template = STROKES[ch];
  const mine = myStrokes.filter(stroke => stroke.length > 1 || stroke.length === 1);
  if (!mine.length) {
    $('wScore').innerHTML = '<span class="muted">Draw the letter first, then check.</span>';
    return;
  }
  const plural = count => count === 1 ? '' : 's';
  const starsForShape = score => {
    if (score >= 90) return 3;
    if (score >= 75) return 2;
    if (score >= 55) return 1;
    return 0;
  };
  const score = strokeScore(template, mine);
  const order = strokeOrderIssue(template, mine);
  const stars = Math.min(order > 0 ? 2 : 3, starsForShape(score)); // right shape, wrong order: 2 stars at most
  P.bestStroke = Math.max(P.bestStroke || 0, score);
  P.totals.strokes = (P.totals.strokes || 0) + 1;
  save();
  let count = `you used ${mine.length} stroke${plural(mine.length)}; ${ch} has ${template.length}`;
  if (mine.length === template.length) count = `${template.length} stroke${plural(template.length)}, right count`;
  let tip = '';
  if (order > 0) tip = ` · stroke ${order} is out of order or drawn the wrong way: try “Show stroke order”`;
  else if (score < 75) tip = ' · try “Show stroke order”';
  const starsHtml = `<span>${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span>`;
  $('wScore').innerHTML = `<b>${score}%</b>${starsHtml}<span class="muted">match · ${count}${tip}</span>`;
};
$('wGhost').hidden = true; // the stroke guide replaces the font ghost
drawGuide();

// ---------------- Typing (Write › Type) and dictation (Write › Listen: type the word you hear) ----------------
let wTab = 'trace'; // the Write tab: 'trace', 'type', 'dict' (Listen) or 'race'
$('wTabs').onclick = event => {
  const button = event.target.closest('[data-wtab]');
  if (!button) return;
  if (wTab !== button.dataset.wtab) raceReset();
  wTab = button.dataset.wtab;
  renderWriteTabs();
  if (wTab !== 'trace') {
    tPick();
    $('tBox').focus();
  }
};
function renderWriteTabs() {
  $('wTabs').querySelectorAll('button').forEach(button => {
    button.setAttribute('aria-pressed', button.dataset.wtab === wTab);
  });
  $('wTrace').hidden = wTab !== 'trace';
  $('wType').hidden = wTab === 'trace';
}
renderWriteTabs();
// every key of the word is on the Korean keyboard (or is a space)
const typeable = word => keysFor(word).every(jamo => jamo === ' ' || JAMO_KEY[jamo]);
// Fill the level picker: each section's words, My words, and (in Listen) each section's sentences.
// Keeps the level that was chosen, else starts at the learner's section.
function typeLevels() {
  const options = SECTIONS.map((section, i) => [String(i), section.title + ' words']);
  if ((P.notebook || []).length) options.push(['mine', 'My words']);
  if (wTab === 'dict') {
    SECTIONS.forEach((section, i) => {
      if (dictSentences(i).length) options.push(['s' + i, section.title + ' sentences']);
    });
  }
  const chosen = $('tLevel').value || String(Math.min(P.section || 0, SECTIONS.length - 1));
  $('tLevel').innerHTML = options.map(([value, label]) => `<option value="${value}">${esc(label)}</option>`).join('');
  $('tLevel').value = options.some(option => option[0] === chosen) ? chosen : '0';
}
// Sentence dictation (Write › Listen): grammar examples and story lines of a level, all recorded. You type the
// letters and spaces; punctuation is left out. Sentences with digits or Latin letters are skipped.
const dictSentences = si => {
  const grammarExamples = GRAMMAR_ITEMS.filter(item => item.section === si).flatMap(item => item.ex);
  const storyLines = STORIES.filter(story => story.level === si).flatMap(story => story.lines);
  return [...grammarExamples, ...storyLines]
    .filter(([ko]) => RECORDED.includes(ko) && !/[0-9A-Za-z]/.test(ko))
    .map(([ko, en]) => ({
      ch: ko.replace(/[^가-힣 ]/g, '').replace(/\s+/g, ' ').trim(),
      full: ko,
      meaning: en,
      say: ko,
      sentence: true,
    }));
};
// The typing state. word: what to type {ch, meaning, say, ...}; keys: the jamo typed so far; count / wrong: key
// presses, all and wrong ones; done: words finished; start: time of the first key (ms); shift: on-screen Shift is on.
// Set later: dict (typing what you hear), solved (word finished, the next one is coming), over (the race is over).
let TY = {word: null, keys: [], wrong: 0, count: 0, done: 0, start: 0, shift: false};
// Typing race: as many words as you can in 60 seconds; the clock starts with your first key. Best score: P.raceBest.
const RACE_SEC = 60;
let raceTimer = 0;
const raceLeft = () => TY.start ? Math.max(0, RACE_SEC - (Date.now() - TY.start) / 1000) : RACE_SEC;
function raceReset() {
  clearInterval(raceTimer);
  Object.assign(TY, {done: 0, count: 0, wrong: 0, start: 0, over: false});
}
// Every 250 ms of a race: count down, and at 0 end the race and show the result
function raceTick() {
  $('tLeft').textContent = Math.ceil(raceLeft());
  if (raceLeft() > 0) return;
  clearInterval(raceTimer);
  TY.over = true;
  TY.solved = true;
  const accuracy = TY.count ? Math.round((TY.count - TY.wrong) / TY.count * 100) : 100;
  const previousBest = +P.raceBest || 0;
  const best = Math.max(previousBest, TY.done);
  const isNewBest = TY.done > previousBest && TY.done > 0;
  P.raceBest = best;
  P.totals.races = (P.totals.races || 0) + 1;
  save();
  $('tWord').textContent = `${TY.done} word${TY.done === 1 ? '' : 's'}`;
  const newBest = isNewBest ? 'New best! ' : '';
  $('tMean').textContent = `${newBest}${accuracy}% accuracy · best ${best} words. Press Skip to race again.`;
  $('tBox').innerHTML = '';
  sfx(isNewBest ? 'done' : 'ok');
}
// The next word (or sentence) to type, at random from the chosen level and never the same one twice in a row
function tPick() {
  const wordsOfLevel = level => {
    if (level[0] === 's') return dictSentences(+level.slice(1));
    if (level === 'mine') return (P.notebook || []).map(word => ({ch: word.ch, meaning: word.meaning, say: word.ch}));
    return VOCAB.filter(word => word.section === +level);
  };
  const listenPrompt = sentence => {
    if (sentence) {
      return 'Listen, then type the sentence you hear: letters and spaces, no punctuation. '
        + 'A wrong key turns the box red; Backspace fixes it. Hear plays it again.';
    }
    return 'Listen, then type the word you hear. Hear plays it again.';
  };

  typeLevels();
  const list = wordsOfLevel($('tLevel').value).filter(word => typeable(word.ch) && word.ch !== TY.word?.ch);
  if (wTab === 'race' && TY.over) raceReset(); // Skip after a race starts a new one
  TY.word = list[Math.floor(Math.random() * list.length)] || VOCAB[0];
  TY.keys = [];
  TY.dict = wTab === 'dict';
  TY.solved = false;
  $('tWord').textContent = TY.dict ? '？' : TY.word.ch;
  $('tMean').textContent = TY.dict ? listenPrompt(TY.word.sentence) : TY.word.meaning;
  $('tBox').className = 'type-box' + (TY.word.sentence ? ' long' : '');
  $('tWord').classList.toggle('long', !!TY.word.sentence);
  if (TY.dict) setTimeout(() => speak(TY.word.say), 250);
  tRender();
}
// Show what you typed and the stats, and light up the next key on the on-screen keyboard
function tRender() {
  const target = keysFor(TY.word.ch);
  const typed = TY.keys;
  const onTrack = typed.every((jamo, i) => jamo === target[i]);
  $('tBox').innerHTML = `${esc(composeJamo(typed))}<span class="caret"></span>`;
  const next = onTrack && !TY.dict ? target[typed.length] : null; // no key hints when typing from listening
  const hint = next && JAMO_KEY[next];
  $('tKb').querySelectorAll('.key').forEach(key => {
    const code = key.dataset.code;
    const isNext = (!!hint && code === hint.code)
      || (next === ' ' && code === 'Space')
      || (!onTrack && code === 'Backspace');
    key.classList.toggle('next', isNext);
  });
  $('tDoneLbl').textContent = TY.dict ? 'heard and typed' : 'words';
  $('tRaceBox').hidden = wTab !== 'race';
  if (wTab === 'race') $('tLeft').textContent = Math.ceil(raceLeft());
  $('tKb').querySelector('[data-code=Shift]').classList.toggle('shift-next', !!hint?.shift);
  $('tDone').textContent = TY.done;
  $('tAcc').textContent = TY.count ? Math.round((TY.count - TY.wrong) / TY.count * 100) + '%' : '100%';
  $('tSpeed').textContent = TY.start && TY.count > 1 ? Math.round(TY.count / ((Date.now() - TY.start) / 60000)) : 0;
}
// One key press: a jamo, ' ' or 'Backspace'. A wrong key is typed too (the box turns red) until you Backspace it.
function tKey(j) {
  if (!TY.word || TY.solved) return; // solved: the next word comes in a moment

  // the word is typed: count it, then the next word after a pause (a sentence you heard stays up longest)
  const finishWord = () => {
    TY.done++;
    TY.solved = true;
    const today = todayStats(P);
    if (TY.dict) {
      P.totals.dictation = (P.totals.dictation || 0) + 1;
      today.dict = (today.dict || 0) + 1;
      $('tWord').textContent = TY.word.full || TY.word.ch;
      $('tMean').textContent = TY.word.meaning;
    } else {
      P.totals.typed = (P.totals.typed || 0) + 1;
      today.typed = (today.typed || 0) + 1;
    }
    const race = wTab === 'race';
    if (!race) speak(TY.word.say); // racing: no audio, next word at once
    $('tBox').classList.add('ok');
    save();
    tRender();
    const word = TY.word;
    let delay = 900;
    if (race) delay = 150;
    else if (TY.dict) delay = word.sentence ? 3500 : 1600;
    setTimeout(() => {
      if (TY.word === word && !TY.over) tPick();
    }, delay);
  };

  const target = keysFor(TY.word.ch);
  if (j === 'Backspace') {
    TY.keys.pop();
    $('tBox').classList.remove('bad');
    return tRender();
  }
  if (composeJamo(TY.keys) === TY.word.ch) return;
  if (!TY.start) {
    TY.start = Date.now();
    if (wTab === 'race') {
      clearInterval(raceTimer);
      raceTimer = setInterval(raceTick, 250);
    }
  }
  TY.count++;
  const isRight = TY.keys.every((typedKey, i) => typedKey === target[i]) && target[TY.keys.length] === j;
  if (isRight) {
    $('tBox').classList.remove('bad');
  } else {
    TY.wrong++;
    $('tBox').classList.add('bad');
  }
  TY.keys.push(j);
  tRender();
  if (composeJamo(TY.keys) === TY.word.ch) finishWord();
}
// on-screen keyboard: the letter rows (Backspace ends the first, Shift starts the last), then the space bar
$('tKb').innerHTML = KEY_ROWS.map((row, rowIndex) => {
  const keys = row.map(code => {
    const shifted = SHIFT_JAMO[code] ? `<sup>${SHIFT_JAMO[code]}</sup>` : '';
    const label = `<small>${code.slice(3)}</small>${KEY_JAMO[code]}${shifted}`;
    return `<button class="key" data-code="${code}">${label}</button>`;
  }).join('');
  const shiftKey = '<button class="key" data-code="Shift" aria-label="Shift">⇧</button>';
  const backspaceKey = '<button class="key" data-code="Backspace" aria-label="Backspace">⌫</button>';
  return `<div class="kb-row">${rowIndex === 2 ? shiftKey : ''}${keys}${rowIndex === 0 ? backspaceKey : ''}</div>`;
}).join('')
  + '<div class="kb-row"><button class="key wide" data-code="Space" aria-label="Space">space</button></div>';
$('tKb').onclick = event => {
  const key = event.target.closest('.key');
  if (!key) return;
  const code = key.dataset.code;
  if (code === 'Shift') {
    TY.shift = !TY.shift;
    key.classList.toggle('next', TY.shift);
    return;
  }
  if (code === 'Backspace') {
    tKey('Backspace');
  } else if (code === 'Space') {
    tKey(' ');
  } else {
    tKey(TY.shift && SHIFT_JAMO[code] || KEY_JAMO[code]);
    TY.shift = false;
  }
  $('tBox').focus();
};
// The computer's keys type Korean by their position (e.code), whatever keyboard layout is set
document.addEventListener('keydown', event => {
  if (view !== 'write' || wTab === 'trace' || L || document.querySelector('dialog[open]')) return;
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.target.closest?.('select,input')) return;
  if (KEY_JAMO[event.code]) {
    event.preventDefault();
    tKey(event.shiftKey && SHIFT_JAMO[event.code] || KEY_JAMO[event.code]);
  } else if (event.code === 'Backspace') {
    event.preventDefault();
    tKey('Backspace');
  } else if (event.code === 'Space') {
    event.preventDefault();
    tKey(' ');
  } else if (event.code === 'Enter' && composeJamo(TY.keys) === TY.word?.ch) {
    tPick();
  }
});
$('tLevel').onchange = tPick;
$('tSkip').onclick = () => {
  tPick();
  $('tBox').focus();
};
$('tSay').onclick = () => TY.word && speak(TY.word.say);
