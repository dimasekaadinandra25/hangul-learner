// Desktop helpers: focus timer (work with Korean audio, then a short break), word of the day, the weekly report and
// review reminder notifications, and the copied-Korean word catcher.
// Loaded after listen.js and settings.js (uses tauri, PL, NP, update, lsGet, lsSet, swSet, swOn, setMsg, fmt), and
// uses icons.js ($, icon), save.js (P, save, loaded), notify.js (toast), sound.js (sfx), data.js (VOCAB, findWords)
// and lesson.js (dayKey, weekKey, weekDays, todayStats, dueKeys, metricOn, pickOne).
// Provides: FO, focusState, focusToggle, renderFocus, wotd, checkWotd, weekReport, checkWeekly, checkReviewReminder,
// notify, CLIP, clipOn, clipWords.

// ---- Focus timer: runs in this window (also while hidden in the tray); the mini player shows it ----
// Setting value -> [work minutes, break minutes]
const FOCUS_SETS = {'25-5': [25, 5], '50-10': [50, 10], '15-3': [15, 3]};
const focusSet = () => FOCUS_SETS[lsGet('focusLen', '25-5')] || FOCUS_SETS['25-5'];
let FO = null; // {phase:'work'|'break', end: ms}

// Seconds left in the running phase (0 when the timer is off)
const focusLeft = () => {
  if (!FO) return 0;
  return Math.max(0, Math.ceil((FO.end - Date.now()) / 1000));
};
const focusState = () => FO && {phase: FO.phase, left: focusLeft()}; // sent to the mini player with player-state

function focusStart(phase = 'work') {
  const [workMinutes, breakMinutes] = focusSet();
  const minutes = phase === 'work' ? workMinutes : breakMinutes;
  FO = {phase, end: Date.now() + minutes * 60000};
  if (phase === 'work' && NP && !PL.playing()) PL.toggle(); // keep the Korean audio going while you work
  // rings on time even while Windows slows the hidden window
  tauri?.core.invoke('alarm', {ms: FO.end - Date.now() + 50});
  renderFocus();
  update();
}

function focusStop() {
  FO = null;
  renderFocus();
  update();
}

const focusToggle = () => {
  if (FO) focusStop();
  else focusStart();
};

// Tells the learner a phase is over: a reminder card in the mini window (opened if needed), a toast in a browser
async function focusAlert(message) {
  sfx('done');
  if (!tauri) {
    toast('sync', message.title, message.body, 'clock');
    return;
  }
  if (!await tauri.core.invoke('mini_visible')) await tauri.core.invoke('toggle_mini');
  tauri.event.emit('reminder', message).catch(() => {});
}

// Runs every second and on the Rust alarm: ends the phase when its time is up, else redraws the countdown
function focusTick() {
  if (!FO) return;
  if (Date.now() >= FO.end) {
    const [workMinutes, breakMinutes] = focusSet();
    if (FO.phase === 'work') {
      P.totals.focus = (P.totals.focus || 0) + 1;
      const today = todayStats(P);
      today.focus = (today.focus || 0) + 1;
      save();
      focusStart('break');
      focusAlert({
        title: 'Break time',
        body: `${workMinutes} minutes done. Rest ${breakMinutes} minutes and try the word card.`,
        go: 'Skip break',
        cmd: 'focus-work',
      });
    } else {
      focusStop();
      focusAlert({title: 'Break over', body: `Start another ${workMinutes} minutes?`, go: 'Start', cmd: 'focus-work'});
    }
    return;
  }
  renderFocus();
  if ($('dock').hidden) update(); // the dock's own timer already updates every second while something is loaded
}
setInterval(focusTick, 1000);
tauri?.event.listen('alarm', focusTick);

// The Focus button in the Listen screen: the countdown while running, else the work length
function renderFocus() {
  const button = $('lFocus');
  if (!button) return;
  const [workMinutes] = focusSet();
  let label = `Focus ${workMinutes} min`;
  if (FO) {
    const phaseName = FO.phase === 'work' ? 'Focus' : 'Break';
    label = `${phaseName} ${fmt(focusLeft())} · Stop`;
  }
  button.innerHTML = `${icon('clock')}<span class="lbl">${label}</span>`;
  button.setAttribute('aria-pressed', !!FO);
  if (FO) button.title = 'Stop the focus timer';
  else button.title = `Work for ${workMinutes} minutes with Korean audio, then take a short break`;
}
$('lFocus').onclick = focusToggle;
tauri?.event.listen('player-cmd', event => {
  if (event.payload === 'focus') focusToggle();
  else if (event.payload === 'focus-work') focusStart('work');
});
$('focusLen').value = lsGet('focusLen', '25-5');
$('focusLen').onchange = event => {
  lsSet('focusLen', event.target.value);
  renderFocus();
};
renderFocus();

// ---- Word of the day: one Windows notification a day (at or after the chosen time), also while in the tray ----
// Its settings (localStorage 'wotd'): on, time "HH:MM", last = the day key of the last one sent
const wotd = () => ({on: false, time: '09:00', last: '', ...lsGet('wotd', {})});

// A word due for Smart review, otherwise one from your level
function wotdWord() {
  const dueWords = dueKeys(P).map(key => VOCAB.find(word => word.ch === key)).filter(Boolean);
  if (dueWords.length) return pickOne(dueWords);
  return pickOne(VOCAB.filter(word => word.section === (P.section || 0)));
}

// A system notification (a toast in a plain browser). Throws when the system does not allow notifications.
async function notify(title, body) {
  const notifications = tauri?.notification;
  if (!notifications) {
    toast('sync', title, body, 'bell');
    return;
  }
  const allowed = await notifications.isPermissionGranted() || await notifications.requestPermission() === 'granted';
  if (!allowed) throw Error('Your system did not allow notifications for this app');
  notifications.sendNotification({title, body});
}

// Sends the word of the day now; resolves to the word (null when there is none)
async function wotdSend() {
  const word = wotdWord();
  if (!word) return null;
  await notify(`오늘의 단어 · ${word.ch}`, `${word.meaning} · Word of the day from Hangul Learner`);
  return word;
}

// Sends today's word if it is on, not sent yet today and the chosen time has passed. Returns true when it was due.
async function checkWotd(now = new Date()) {
  const settings = wotd();
  const day = dayKey(now);
  const [hours, minutes] = settings.time.split(':').map(Number);
  if (!settings.on || settings.last === day) return false;
  if (now.getHours() * 60 + now.getMinutes() < hours * 60 + minutes) return false;
  settings.last = day; // marked first, so a failing send is not retried every 30 seconds
  lsSet('wotd', settings);
  try {
    await wotdSend();
  } catch (error) {
    setMsg('wotdMsg', String(error.message || error), true);
  }
  return true;
}
setInterval(() => {
  if (loaded) checkWotd();
}, 30000);

const renderWotd = () => {
  const settings = wotd();
  swSet('wotdSw', settings.on);
  $('wotdTime').value = settings.time;
};
$('wotdSw').onclick = () => {
  const settings = wotd();
  settings.on = !settings.on;
  lsSet('wotd', settings);
  renderWotd();
};
$('wotdTime').onchange = event => {
  const settings = wotd();
  settings.time = event.target.value || '09:00';
  settings.last = ''; // a new time can still bring today's word
  lsSet('wotd', settings);
};
$('wotdTry').onclick = () => {
  const showSent = word => {
    if (word) setMsg('wotdMsg', `Sent: ${word.ch} (${word.meaning})`);
  };
  const showError = error => setMsg('wotdMsg', String(error.message || error), true);
  return wotdSend().then(showSent, showError);
};
renderWotd();

// ---- Weekly report: one notification on Sunday evening (or the first time the app runs after it, that week) ----
// The report for a week: {title, body} with XP, active days, minutes, lessons and the best day
function weekReport(week = weekKey()) {
  const days = weekDays(week);
  const sumOverDays = valueOfDay => days.reduce((total, day) => total + valueOfDay(day), 0);
  const xp = sumOverDays(day => P.days[day] || 0);
  const activeDays = days.filter(day => P.days[day] > 0).length;
  const minutes = sumOverDays(day => metricOn(P, day, 'minutes'));
  const lessons = sumOverDays(day => metricOn(P, day, 'lessons'));
  const bestDay = days.reduce((best, day) => ((P.days[day] || 0) > (P.days[best] || 0) ? day : best), days[0]);
  const bestDayName = new Date(bestDay + 'T12:00').toLocaleDateString('en-US', {weekday: 'long'});
  const title = '이번 주 · Your week in Korean';
  if (!xp) return {title, body: 'No study this week yet. Ten minutes tomorrow is a great restart.'};
  const lessonPlural = lessons === 1 ? '' : 's';
  const body = [
    `${xp.toLocaleString()} XP · ${activeDays} of 7 days · `,
    `${minutes} min · ${lessons} lesson${lessonPlural}. Best day: ${bestDayName}.`,
  ].join('');
  return {title, body};
}

// Sends the weekly report on Sunday from 19:00, once a week (Settings switch 'weekly'). Returns true when sent.
async function checkWeekly(now = new Date()) {
  if (!lsGet('weekly', true) || now.getDay() !== 0 || now.getHours() < 19) return false;
  if (lsGet('weeklySent', '') === weekKey(now)) return false;
  lsSet('weeklySent', weekKey(now));
  const report = weekReport(weekKey(now));
  try {
    await notify(report.title, report.body);
  } catch (e) {}
  return true;
}

// ---- Review reminder: one evening notification when Smart review words are due and nothing was reviewed today ----
async function checkReviewReminder(now = new Date()) {
  if (!lsGet('reviewRemind', true) || now.getHours() < 18 || lsGet('reviewSent', '') === dayKey(now)) return false;
  // one nudge an evening: the daily reminder covers due words
  if (typeof reminder === 'function' && reminder().on) return false;
  const dueCount = dueKeys(P).length;
  if (!dueCount || (todayStats(P).srs || 0) > 0) return false;
  lsSet('reviewSent', dayKey(now));
  const wordPlural = dueCount === 1 ? '' : 's';
  const body = `${dueCount} word${wordPlural} due for Smart review. A few minutes keeps them fresh.`;
  try {
    await notify('복습 · Review time', body);
  } catch (e) {}
  return true;
}
swSet('reviewSw', lsGet('reviewRemind', true));
$('reviewSw').onclick = () => {
  lsSet('reviewRemind', !lsGet('reviewRemind', true));
  swSet('reviewSw', lsGet('reviewRemind', true));
};
setInterval(() => {
  if (!loaded) return;
  checkWeekly();
  checkReviewReminder();
}, 60000);
swSet('weekSw', lsGet('weekly', true));
$('weekSw').onclick = () => {
  lsSet('weekly', !lsGet('weekly', true));
  swSet('weekSw', lsGet('weekly', true));
};
$('weekTry').onclick = () => {
  const report = weekReport();
  notify(report.title, report.body).then(
    () => setMsg('wotdMsg', 'Sent this week’s report.'),
    error => setMsg('wotdMsg', String(error.message || error), true),
  );
};

// ---- Copied Korean: the Rust app watches the clipboard while this is on and sends Korean text here.
// The text is only matched against the word list in memory; it is never saved or sent anywhere. ----
let CLIP = null; // {words, at}
const clipOn = () => lsGet('clip', false);

// The words from the last copied text, shown for 10 minutes
const clipWords = () => {
  if (CLIP && Date.now() - CLIP.at < 10 * 60000) return CLIP.words;
  return [];
};

// Tells the Rust app to start or stop watching the clipboard; switched off, the caught words are dropped
function applyClip() {
  tauri?.core.invoke('clip_watch', {on: clipOn()});
  if (!clipOn()) CLIP = null;
}
$('clipSw').onclick = () => {
  lsSet('clip', !clipOn());
  swSet('clipSw', clipOn());
  applyClip();
  update();
};
$('clipSw').closest('.set-row').hidden = !tauri; // only the desktop app can watch the clipboard
swSet('clipSw', clipOn());
applyClip();
tauri?.event.listen('clip', async event => {
  if (!clipOn()) return;
  const copiedText = String(event.payload || '').slice(0, 5000);
  const words = findWords(copiedText).slice(0, 30).map(word => ({ch: word.ch, meaning: word.meaning, say: word.say}));
  if (!words.length) return;
  CLIP = {words, at: Date.now()};
  update();
  if (!await tauri.core.invoke('mini_visible')) tauri.core.invoke('toggle_mini');
});
