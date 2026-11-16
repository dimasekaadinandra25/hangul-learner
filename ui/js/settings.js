// Settings sheet: voice, keyboard shortcuts, start with Windows, daily reminder, offline downloads, goals,
// Korean text size, app updates, backup export/import and sync between PCs.
//
// Needs from earlier scripts: $, tauri, lsGet, lsSet, esc, icon, toast, ask, speak, show, P, L, loaded, save,
// freshProgress, mergeProgress, dayKey, weekKey, dueKeys, DAILY_GOAL, GOALS, STORIES, SECTIONS, DIALOGUES,
// keepStamp (save.js), the tray/theme/word-of-the-day helpers, and the Listen page state (DL, DLM, renderListen).
//
// Provides: swSet / swOn / setMsg (switch and message helpers, also used by later files), openSettings,
// reminder / saveReminder / checkReminder, applyShortcuts, backupJson, cleanBackup, applyBackup, autoBackup,
// and the sync functions (syncPush is called by save() after every save, syncPull reads the sync folder).

// Switches are buttons with role="switch": their state lives in aria-checked.
const swSet = (id, on) => $(id).setAttribute('aria-checked', !!on);
const swOn = id => $(id).getAttribute('aria-checked') === 'true';
// Shows a status line under a settings row; bad = shown as an error.
const setMsg = (id, text, bad) => {
  $(id).textContent = text;
  $(id).classList.toggle('bad', !!bad);
};

$('voiceSel').value = lsGet('voice', 'female');
$('voiceSel').onchange = event => {
  lsSet('voice', event.target.value);
  speak('학교');
};

function openSettings() {
  renderSettings();
  renderGoals();
  renderDownloads();
  $('settings').showModal();
  $('setClose').focus({ focusVisible: false });
}
document.addEventListener('click', event => {
  if (event.target.closest('[data-settings]')) openSettings();
});
$('setClose').onclick = () => $('settings').close();

// ? anywhere (except while typing) shows every keyboard shortcut
const openKeys = () => {
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  $('keysSheet').showModal();
  $('keysClose').focus({ focusVisible: false });
};
$('keysClose').onclick = () => $('keysSheet').close();
$('keysOpen').onclick = openKeys;
document.addEventListener('keydown', event => {
  if (event.key !== '?' || event.ctrlKey || event.altKey || event.metaKey || $('keysSheet').open) return;
  const focused = document.activeElement;
  if (focused?.matches('input,textarea,select,[contenteditable],.type-box')) return;
  if (view === 'write' && wTab !== 'trace') return;
  if (L && !$('lesson').hidden) return; // not during a lesson: its keys stay its own
  event.preventDefault();
  openKeys();
});
// a click on the backdrop (outside the sheet) closes it
$('settings').addEventListener('click', event => {
  if (event.target === $('settings')) $('settings').close();
});

// Fills the switches and fields from what is saved. Start-up and shortcut rows only exist in the desktop app.
function renderSettings() {
  renderSfx();
  renderTray();
  for (const id of ['autoSw', 'keySw']) $(id).closest('.set-row').hidden = !tauri;
  swSet('keySw', lsGet('shortcuts', true));
  const savedReminder = reminder();
  swSet('remSw', savedReminder.on);
  $('remTime').value = savedReminder.time;
  tauri?.core.invoke('autostart', { on: null }).then(isOn => swSet('autoSw', isOn)).catch(() => {});
}

// ---- Start with Windows ----
$('autoSw').onclick = () => {
  return tauri?.core.invoke('autostart', { on: !swOn('autoSw') })
    .then(isOn => swSet('autoSw', isOn))
    .catch(error => toast('sync', 'Could not change start-up', String(error), 'gear'));
};

// ---- Global shortcuts (registered by the Rust app) ----
function applyShortcuts() {
  const on = lsGet('shortcuts', true);
  return tauri?.core.invoke('set_shortcuts', { on }).then(
    () => setMsg('keyMsg', ''),
    error => setMsg('keyMsg', String(error) + '. The other shortcuts still work.', true),
  );
}
$('keySw').onclick = () => {
  const turnOn = !swOn('keySw');
  lsSet('shortcuts', turnOn);
  swSet('keySw', turnOn);
  applyShortcuts();
};
applyShortcuts();

// ---- Daily reminder: once a day at/after the chosen time, if today's goal isn't reached (runs while in the tray) ----
// Saved as { on, time: 'HH:MM', last: day of the last reminder }.
const reminder = () => ({ on: false, time: '19:00', last: '', ...lsGet('reminder', {}) });
const saveReminder = settings => lsSet('reminder', settings);
$('remSw').onclick = () => {
  const settings = reminder();
  settings.on = !settings.on;
  saveReminder(settings);
  swSet('remSw', settings.on);
};
$('remTime').onchange = event => {
  const settings = reminder();
  settings.time = event.target.value || '19:00';
  saveReminder(settings); // keeps settings.last: one reminder a day
};

// The reminder's title and line: words due for review and XP still missing for today's goal.
function reminderText() {
  const xpLeft = Math.max(0, DAILY_GOAL - (P.days[dayKey()] || 0));
  const due = dueKeys(P).length;
  const dueText = due ? `${due} word${due === 1 ? '' : 's'} to review` : '';
  const goalText = xpLeft ? `${xpLeft} XP to today’s goal` : '';
  const body = [dueText, goalText].filter(Boolean).join(' · ') || 'A few minutes keeps your streak going';
  return { title: 'Time for Korean', body, due };
}

// Shows the reminder if it is on, not shown yet today, the time has come and today's goal isn't reached.
// In the desktop app it appears in the mini window. Returns whether it was shown.
async function checkReminder(now = new Date()) {
  const settings = reminder();
  const day = dayKey(now);
  if (!settings.on || settings.last === day || (P.days[day] || 0) >= DAILY_GOAL) return false;
  const [hour, minute] = settings.time.split(':').map(Number);
  if (now.getHours() * 60 + now.getMinutes() < hour * 60 + minute) return false;
  settings.last = day;
  saveReminder(settings);
  const message = reminderText();
  if (tauri) {
    if (!await tauri.core.invoke('mini_visible')) await tauri.core.invoke('toggle_mini');
    tauri.event.emit('reminder', message).catch(() => {});
  } else {
    toast('sync', message.title, message.body, 'bell');
  }
  return true;
}
setInterval(() => {
  if (loaded) checkReminder();
}, 30000);

// the mini window's "Start" button: open the app and begin with what is due
tauri?.event.listen('player-cmd', event => {
  if (event.payload !== 'study') return;
  tauri.core.invoke('show_main');
  show('learn');
  if (dueKeys(P).length && !L) startLesson(() => buildSmart(P), { step: null, smart: true });
});

// ---- Downloads: offline podcast episodes ----
$('dlGroup').hidden = !tauri;
async function renderDownloads() {
  if (!tauri) return;
  const [episodeCount, bytes] = await tauri.core.invoke('episodes_size').catch(() => [0, 0]);
  if (episodeCount) {
    const megabytes = (bytes / 1048576).toFixed(0);
    const plural = episodeCount === 1 ? '' : 's';
    $('dlInfo').textContent = `${episodeCount} episode${plural} kept for offline listening · ${megabytes} MB`;
  } else {
    $('dlInfo').textContent = 'Tap ↓ next to an episode on the Listen page to keep it for listening without internet.';
  }
  $('dlClear').disabled = !episodeCount;
}
$('dlClear').onclick = async () => {
  const confirmed = await ask({
    title: 'Delete all downloaded episodes?',
    text: 'They will stream from the internet again.',
    ok: 'Delete all',
    danger: true,
    sealText: '×',
  });
  if (!confirmed) return;
  await tauri.core.invoke('delete_episodes', { path: '' }).catch(() => {});
  DL = {};
  DLM = {};
  lsSet('dl', DL);
  lsSet('dlMeta', DLM);
  renderDownloads();
  if (view === 'listen') renderListen();
};

// ---- Goals: daily XP goal and TOPIK exam date (both in progress, so they sync) ----
function renderGoals() {
  $('goalSel').value = String(GOALS.includes(+P.goal) ? +P.goal : 30);
  $('examDate').value = P.exam?.date || '';
  $('examLevel').value = String(P.exam?.level || 2);
}
$('goalSel').onchange = event => {
  P.goal = +event.target.value;
  P.goalLog ??= {};
  P.goalLog[dayKey()] = P.goal; // the goal that was set on each day, so past days keep the goal they had
  save();
};
const setExam = () => {
  const date = $('examDate').value;
  P.exam = date ? { date, level: +$('examLevel').value } : null;
  save();
};
$('examDate').onchange = setExam;
$('examLevel').onchange = setExam;

// ---- Korean text size: a zoom on Korean text only (CSS --ko-size); per device ----
$('koSize').value = String(lsGet('koSize', 1));
$('koSize').onchange = event => {
  const size = +event.target.value || 1;
  lsSet('koSize', size);
  document.documentElement.style.setProperty('--ko-size', size);
};

// ---- Updates: Tauri's updater reads latest.json from the public releases page; installers are signed and checked ----
const upd = tauri?.updater;
$('updGroup').hidden = !upd;
tauri?.app.getVersion().then(version => $('appVer').textContent = version);
let updFound = null; // the update found by the last check, or null

// manual = the learner pressed the button: report every outcome. Automatic checks only toast a new version, once.
async function checkUpdate(manual) {
  if (!upd) return;
  if (manual) setMsg('updMsg', 'Checking…');
  try {
    updFound = await upd.check();
    lsSet('updChecked', dayKey());
    if (!updFound) {
      if (manual) setMsg('updMsg', 'You have the newest version.');
      return;
    }
    setMsg('updMsg', `Version ${updFound.version} is available.`);
    $('updBtn').innerHTML = icon('download') + 'Install ' + esc(updFound.version);
    if (!manual && lsGet('updToasted', '') !== updFound.version) {
      lsSet('updToasted', updFound.version);
      toast('sync', `Update ${updFound.version} available`, 'Open Settings › Updates to install it.', 'download');
    }
  } catch (error) {
    if (manual) setMsg('updMsg', 'Could not check for updates: ' + error, true);
  }
}

async function installUpdate() {
  const confirmed = await ask({
    title: `Install version ${updFound.version}?`,
    text: 'The app downloads the update, closes and opens again. Your progress is kept.',
    ok: 'Install and restart',
    sealText: '↑',
  });
  if (!confirmed) return;
  let downloadedBytes = 0;
  let totalBytes = 0;
  $('updBtn').disabled = true;
  const notes = { v: updFound.version, body: String(updFound.body || '').slice(0, 2000) };
  lsSet('updNotes', notes); // shown once after the restart

  function onDownloadEvent(downloadEvent) {
    if (downloadEvent.event === 'Started') {
      totalBytes = downloadEvent.data.contentLength || 0;
    } else if (downloadEvent.event === 'Progress') {
      downloadedBytes += downloadEvent.data.chunkLength;
      if (totalBytes) setMsg('updMsg', `Downloading… ${Math.round(downloadedBytes / totalBytes * 100)}%`);
      else setMsg('updMsg', 'Downloading…');
    } else if (downloadEvent.event === 'Finished') {
      setMsg('updMsg', 'Installing…');
    }
  }

  try {
    await updFound.downloadAndInstall(onDownloadEvent);
    await tauri.process.relaunch();
  } catch (error) {
    setMsg('updMsg', 'Update failed: ' + error, true);
    $('updBtn').disabled = false;
  }
}

$('logBtn').onclick = () => {
  const changelogUrl = 'https://github.com/dimasekaadinandra25/hangul-learner/blob/main/CHANGELOG.md';
  if (tauri) {
    tauri.core.invoke('open_external', { url: changelogUrl });
  } else {
    open(changelogUrl);
  }
};
$('updBtn').onclick = () => {
  if (updFound) installUpdate();
  else checkUpdate(true);
};
// a little after start-up, then every 6 hours while the app runs (it often sits in the tray for days)
setTimeout(() => checkUpdate(false), 15000);
setInterval(() => checkUpdate(false), 6 * 3600e3);

// What's new: after an update installed from Settings, show its notes once
tauri?.app.getVersion().then(version => {
  const notes = lsGet('updNotes', null);
  if (notes?.v !== version) return;
  lsSet('updNotes', null);
  ask({
    title: `Updated to ${version}`,
    text: notes.body || 'Hangul Learner is up to date.',
    ok: 'Got it',
    cancel: '',
    sealText: '新',
  });
});

// ---- Backup ----
// Backup file format: { app: 'hangul-learner', version: 1, exported: ISO date, (saved: savedAt, sync file only),
// progress: P, settings: { the localStorage keys below, as stored strings } }.
const stamp = () => new Date().toLocaleString('sv').replace(/[: ]/g, '-').slice(0, 16); // 2026-11-11-08-30
// The device settings that travel with a backup or sync file (the rest stay on each PC).
const SETTINGS_IN_BACKUP = ['theme', 'tray', 'rate', 'shortcuts', 'reminder', 'wotd', 'focusLen'];

function backupJson(extra) {
  const settings = Object.fromEntries(
    SETTINGS_IN_BACKUP.map(key => [key, localStorage.getItem(key)]).filter(([, value]) => value != null),
  );
  return JSON.stringify({
    app: 'hangul-learner',
    version: 1,
    exported: new Date().toISOString(),
    ...extra,
    progress: P,
    settings,
  });
}

let lastExport = ''; // path of the last backup saved from Settings
$('exportBtn').onclick = async () => {
  const name = `hangul-learner-backup-${stamp()}.json`;
  const data = backupJson();
  if (!tauri) {
    // in a browser: download the file
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    link.download = name;
    link.click();
    return setMsg('backupMsg', 'Downloaded ' + name);
  }
  try {
    lastExport = await tauri.core.invoke('export_backup', { name, data });
    const showButton = '<button class="link" id="showBackup">Show in folder</button>';
    $('backupMsg').innerHTML = `Saved to ${esc(lastExport)} · ${showButton}`;
    $('backupMsg').classList.remove('bad');
    $('showBackup').onclick = () => {
      tauri.core.invoke('show_in_folder', { path: lastExport })
        .catch(error => setMsg('backupMsg', String(error), true));
    };
  } catch (error) {
    setMsg('backupMsg', 'Could not save the backup: ' + error, true);
  }
};

// ---- Automatic backup: once a week to Documents\Hangul Learner; the newest 4 are kept ----
// Returns whether a backup was written.
async function autoBackup() {
  if (!tauri || !loaded || !lsGet('autoBackup', true)) return false;
  if (!P.xp) return false; // nothing learned yet: nothing to keep
  if (lsGet('autoBackupWeek', '') === weekKey()) return false;
  try {
    await tauri.core.invoke('export_backup', { name: `auto-backup-${stamp()}.json`, data: backupJson() });
    lsSet('autoBackupWeek', weekKey());
    await tauri.core.invoke('prune_backups', { prefix: 'auto-backup-', keep: 4 });
    return true;
  } catch (error) {
    console.error('automatic backup failed', error);
    return false;
  }
}
setTimeout(autoBackup, 30000);
setInterval(autoBackup, 6 * 3600e3);
swSet('autoBkSw', lsGet('autoBackup', true));
$('autoBkSw').closest('.set-row').hidden = !tauri;
$('autoBkSw').onclick = () => {
  lsSet('autoBackup', !lsGet('autoBackup', true));
  swSet('autoBkSw', lsGet('autoBackup', true));
};

// A backup file comes from outside the app: check its shape and keep only plain data before using it.
// Returns the cleaned progress, or null when the file is not a Hangul Learner backup.
function cleanBackup(obj) {
  const progress = obj?.progress;
  if (obj?.app !== 'hangul-learner') return null;
  if (!progress || typeof progress !== 'object' || !Number.isFinite(progress.xp)) return null;
  if (!progress.stats || typeof progress.stats !== 'object' || Array.isArray(progress.stats)) return null;

  // a backup or sync file is not fully trusted: every field is rebuilt from plain values
  const text = (value, maxLength) => String(value ?? '').slice(0, maxLength);
  const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const isDay = key => /^\d{4}-\d\d-\d\d$/.test(key);
  const numbers = value => {
    const entries = Object.entries(record(value)).filter(([, v]) => Number.isFinite(+v));
    return Object.fromEntries(entries.map(([key, v]) => [key, +v]));
  };

  // per word: how often it was heard, answered right, tried and written
  function cleanStats(stats) {
    const entries = Object.entries(stats).filter(([, wordStats]) => wordStats && typeof wordStats === 'object');
    return Object.fromEntries(entries.map(([key, wordStats]) => [key, {
      heard: +wordStats.heard || 0,
      right: +wordStats.right || 0,
      tries: +wordStats.tries || 0,
      written: +wordStats.written || 0,
    }]));
  }

  // Smart review cards: unit, interval, ease (kept within 1.3..2.8), due day, and optional lapse count and time
  function cleanCard(card) {
    const clean = {
      u: card.u,
      iv: Math.max(0, +card.iv || 0),
      ease: Math.min(2.8, Math.max(1.3, +card.ease || 2.3)),
      due: card.due,
    };
    if (Number.isFinite(+card.lapse) && card.lapse) clean.lapse = +card.lapse;
    if (Number.isFinite(+card.at) && card.at) clean.at = +card.at;
    return clean;
  }
  function cleanSrs(srs) {
    const isCard = card => card && typeof card.u === 'string' && typeof card.due === 'string' && isDay(card.due);
    const entries = Object.entries(record(srs)).filter(([, card]) => isCard(card));
    return Object.fromEntries(entries.map(([key, card]) => [key, cleanCard(card)]));
  }

  function cleanGoalLog(goalLog) {
    const entries = Object.entries(record(goalLog)).filter(([day, goal]) => isDay(day) && GOALS.includes(+goal));
    return Object.fromEntries(entries.map(([day, goal]) => [day, +goal]));
  }

  function cleanExam(exam) {
    const valid = exam && isDay(String(exam.date)) && +exam.level >= 1 && +exam.level <= 6;
    return valid ? { date: exam.date, level: +exam.level } : null;
  }

  function cleanNotebook(notebook) {
    const words = (Array.isArray(notebook) ? notebook : []).slice(0, 2000);
    return words
      .map(word => ({ ch: text(word?.ch, 120), meaning: text(word?.meaning, 200), added: +word?.added || 0 }))
      .filter(word => word.ch && word.meaning);
  }

  function cleanTests(tests) {
    const isScored = test => Number.isFinite(test?.score) && Number.isFinite(test?.total) && test.total > 0;
    return (Array.isArray(tests) ? tests : []).slice(-50).filter(isScored);
  }

  function cleanDrills(drills) {
    const kinds = ['num', 'verb', 'part', 'sound', 'read', 'tricky', 'reply', 'pair', 'casual'];
    return Object.fromEntries(kinds.map(kind => [kind, {
      right: Math.max(0, +drills?.[kind]?.right || 0),
      tries: Math.max(0, +drills?.[kind]?.tries || 0),
    }]));
  }

  // only stories that exist in this version; best score is capped at the story's question count
  function cleanStories(stories) {
    const played = STORIES.filter(story => stories?.[story.id]);
    return Object.fromEntries(played.map(story => [story.id, {
      best: Math.max(0, Math.min(story.qs.length, +stories[story.id].best || 0)),
      at: +stories[story.id].at || 0,
    }]));
  }

  function cleanDays(days) {
    const entries = Object.entries(days && typeof days === 'object' ? days : {});
    const valid = entries.filter(([day, xp]) => isDay(day) && Number.isFinite(+xp));
    return Object.fromEntries(valid.map(([day, xp]) => [day, +xp]));
  }

  // the last 60 missed items of each drill (short strings only)
  function cleanDrillMiss(drillMiss) {
    const kinds = ['num', 'verb', 'part', 'sound', 'tricky', 'reply', 'pair', 'casual'];
    return Object.fromEntries(kinds.map(kind => {
      const missed = Array.isArray(drillMiss?.[kind]) ? drillMiss[kind] : [];
      return [kind, missed.filter(item => typeof item === 'string' && item.length < 60).slice(-60)];
    }));
  }

  function cleanTalks(talks) {
    const done = DIALOGUES.filter(dialogue => talks?.[dialogue.id]);
    return Object.fromEntries(done.map(dialogue => [dialogue.id, Math.max(0, +talks[dialogue.id] || 0)]));
  }

  return {
    ...progress,
    inbox: [],
    inboxSeen: Date.now(),
    stats: cleanStats(progress.stats),
    units: numbers(progress.units),
    steps: numbers(progress.steps),
    totals: numbers(progress.totals),
    srs: cleanSrs(progress.srs),
    goal: GOALS.includes(+progress.goal) ? +progress.goal : undefined,
    goalLog: cleanGoalLog(progress.goalLog),
    exam: cleanExam(progress.exam),
    notebook: cleanNotebook(progress.notebook),
    tests: cleanTests(progress.tests),
    drills: cleanDrills(progress.drills),
    stories: cleanStories(progress.stories),
    section: Math.max(0, Math.min(SECTIONS.length - 1, +progress.section || 0)),
    days: cleanDays(progress.days),
    drillMiss: cleanDrillMiss(progress.drillMiss),
    talks: cleanTalks(progress.talks),
  };
}

// Replaces progress (and the shared settings) with a cleaned backup. savedAt: keep the copy's save time (sync).
function applyBackup(obj, cleanProgress, savedAt) {
  const fresh = freshProgress();
  P = { ...fresh, ...cleanProgress, totals: { ...fresh.totals, ...cleanProgress.totals } };
  for (const [key, value] of Object.entries(obj.settings || {})) {
    if (SETTINGS_IN_BACKUP.includes(key) && typeof value === 'string') localStorage.setItem(key, value.slice(0, 200));
  }
  setTheme(getTheme());
  renderTray();
  renderWotd();
  $('focusLen').value = lsGet('focusLen', '25-5');
  tauri?.core.invoke('close_to_tray', { on: trayOn() });
  applyShortcuts();
  if (savedAt) {
    P.savedAt = savedAt;
    keepStamp = true; // save() keeps P.savedAt instead of stamping it with now
  }
  try {
    save();
  } finally {
    keepStamp = false;
  }
  renderSettings();
}

$('importFile').onchange = async event => {
  const file = event.target.files[0];
  event.target.value = ''; // so choosing the same file again fires change again
  if (!file) return;
  let obj;
  try {
    obj = JSON.parse(await file.text());
  } catch {
    return setMsg('backupMsg', 'That file is not a Hangul Learner backup.', true);
  }
  const cleanProgress = cleanBackup(obj);
  if (!cleanProgress) return setMsg('backupMsg', 'That file is not a Hangul Learner backup.', true);
  const passedUnits = Object.values(cleanProgress.units || {}).filter(passes => passes > 0).length;
  const savedWhen = obj.exported ? new Date(obj.exported).toLocaleDateString() : 'an unknown date';
  const summary = [
    `It has ${cleanProgress.xp.toLocaleString()} XP and ${passedUnits} passed unit${passedUnits === 1 ? '' : 's'}, `,
    `saved ${savedWhen}. Your current progress on this computer will be replaced.`,
  ].join('');
  const confirmed = await ask({
    title: 'Import this backup?',
    text: summary,
    ok: 'Import',
    danger: true,
    sealText: '!',
  });
  if (!confirmed) return;
  applyBackup(obj, cleanProgress);
  setMsg('backupMsg', 'Backup imported.');
  toast('sync', 'Backup imported', `${P.xp.toLocaleString()} XP restored`, 'download');
};

// ---- Sync between PCs: progress is also kept in <folder>\Hangul Learner\progress.json, inside a folder that
// OneDrive or Google Drive already syncs. No account or server. Each PC turns it on once.
// When both PCs studied since they last agreed, the two copies are merged (mergeProgress in lesson.js) using the
// last agreed copy, which each PC keeps in localStorage (syncSnap). Only the very first sync on a PC that already
// has progress asks.
//
// localStorage keys: syncOn, syncPath (the chosen folder), syncBase (savedAt of the last agreed copy;
// 0 = never synced), syncSnap (the last agreed copy itself), syncAt (when this PC last agreed with the folder).
// The sync file is a backup file (see backupJson) with an extra "saved" field: the copy's savedAt.

// the sync folder, or '' when sync is off
const syncDir = () => lsGet('syncOn', false) ? lsGet('syncPath', '') : '';
let syncBusy = false;
let syncTimer = 0;
// Before one copy replaces the other, the copy that loses is saved as a backup file (the newest 5 are kept).
const keepAside = async data => {
  await tauri.core.invoke('export_backup', { name: `before-sync-${stamp()}.json`, data });
  await tauri.core.invoke('prune_backups', { prefix: 'before-sync-', keep: 5 }).catch(() => {});
};

// this PC and the sync folder now hold the same progress
function agreed() {
  lsSet('syncBase', P.savedAt || 1); // 1 = synced, even before the first save
  lsSet('syncSnap', P);
  lsSet('syncAt', Date.now());
  syncStatus();
}

async function syncWrite() {
  await tauri.core.invoke('sync_write', { dir: syncDir(), data: backupJson({ saved: P.savedAt }) });
  agreed();
}

// after every save, a few seconds later
function syncPush() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    if (!syncDir() || !loaded) return;
    const savedSinceSync = (+P.savedAt || 0) > +lsGet('syncBase', 0);
    if (!savedSinceSync) return;
    if (syncBusy) syncPush(); // a sync is running: try again a little later
    else syncPull();
  }, 3000);
}

// Reads the sync folder's copy and brings this PC and the folder to the same progress:
// equal save times = nothing to do; both changed since they last agreed = merge; otherwise the newer copy wins
// (the very first sync on a PC that already has progress asks which one to keep).
async function syncPull() {
  if (!tauri || !syncDir() || !loaded || syncBusy) return;
  syncBusy = true;
  try {
    const remoteText = await tauri.core.invoke('sync_read', { dir: syncDir() });
    if (!remoteText) {
      await syncWrite(); // the folder has no copy yet
      return;
    }
    let remote;
    try {
      remote = JSON.parse(remoteText);
    } catch {
      throw Error('the sync file is damaged');
    }
    const remoteProgress = cleanBackup(remote);
    const remoteSaved = +remote.saved || 0;
    const localSaved = +P.savedAt || 0;
    const baseSaved = +lsGet('syncBase', 0);
    if (!remoteProgress) throw Error('the sync file is damaged');
    if (remoteSaved === localSaved) return agreed();

    const baseSnapshot = lsGet('syncSnap', null);
    if (baseSaved && baseSnapshot && remoteSaved > baseSaved && localSaved > baseSaved) {
      // both PCs studied since they last agreed: add the two together
      applyBackup({}, mergeProgress(baseSnapshot, P, remoteProgress, localSaved > remoteSaved));
      await syncWrite();
      const mergedText = `This PC and your other PC combined · ${P.xp.toLocaleString()} XP`;
      return toast('sync', 'Progress merged', mergedText, 'download');
    }

    let useRemote = remoteSaved > localSaved;
    if (!baseSaved && P.xp > 0 && localSaved) {
      // first sync on this PC and it already has progress: let the learner choose
      useRemote = await askWhichCopy(remoteProgress, remoteSaved);
    }
    if (useRemote) {
      if (localSaved > baseSaved) await keepAside(backupJson());
      applyBackup(remote, remoteProgress, remoteSaved);
      agreed();
      toast('sync', 'Progress synced', `Continued from your other PC · ${P.xp.toLocaleString()} XP`, 'download');
    } else {
      if (remoteSaved > baseSaved) await keepAside(remoteText);
      await syncWrite();
    }
    syncStatus();
  } catch (error) {
    syncStatus(error);
  } finally {
    syncBusy = false;
  }

  // true = use the sync folder's copy
  function askWhichCopy(remoteProgress, remoteSaved) {
    const remoteSavedWhen = new Date(remoteSaved).toLocaleString();
    const text = [
      `The sync folder has ${remoteProgress.xp.toLocaleString()} XP (saved ${remoteSavedWhen}). `,
      `This PC has ${P.xp.toLocaleString()} XP. `,
      'The other copy is kept as a backup file in Documents\\Hangul Learner.',
    ].join('');
    return ask({
      title: 'Which progress should this PC use?',
      text,
      ok: 'Use the sync folder’s',
      cancel: 'Keep this PC’s',
      sealText: '⇄',
    });
  }
}

// Shows when this PC last synced, or the error (an Error or a string) when the last sync failed.
function syncStatus(err) {
  if (err instanceof Error || typeof err === 'string') {
    return setMsg('syncMsg', 'Could not sync: ' + (err.message || err), true);
  }
  const syncedAt = lsGet('syncAt', 0);
  let text = '';
  if (syncDir()) text = syncedAt ? `Synced ${new Date(syncedAt).toLocaleString()}` : 'Not synced yet';
  setMsg('syncMsg', text);
}

function renderSync() {
  swSet('syncSw', lsGet('syncOn', false));
  $('syncPath').value = lsGet('syncPath', '');
  syncStatus();
}

$('syncGroup').hidden = !tauri;
// Turning sync on (or changing the folder) starts over as a first sync: syncBase 0, no last agreed copy.
$('syncSw').onclick = async () => {
  const turnOn = !lsGet('syncOn', false);
  if (turnOn && !lsGet('syncPath', '')) lsSet('syncPath', await tauri.core.invoke('sync_default'));
  if (turnOn && !lsGet('syncPath', '')) {
    const hint = 'Type the path of your OneDrive, Google Drive, iCloud Drive or Dropbox folder below first.';
    return setMsg('syncMsg', hint, true);
  }
  lsSet('syncOn', turnOn);
  lsSet('syncBase', 0);
  lsSet('syncSnap', null);
  renderSync();
  syncPull();
};
$('syncPath').onchange = event => {
  lsSet('syncPath', event.target.value.trim());
  lsSet('syncBase', 0);
  lsSet('syncSnap', null);
  renderSync();
  syncPull();
};
$('syncNow').onclick = () => syncPull();
renderSync();
setInterval(syncPull, 120000);
addEventListener('focus', () => syncPull());
// first sync as soon as progress has loaded
(function syncWhenLoaded() {
  if (loaded) syncPull();
  else setTimeout(syncWhenLoaded, 500);
})();
