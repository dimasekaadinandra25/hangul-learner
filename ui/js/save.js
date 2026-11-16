// Loading and saving the learner's progress, rewards (quests, tasks, stamps), the confirm dialog and Reset progress.
// Progress is saved by the Rust app to %APPDATA%, or to localStorage when the page is opened in a plain browser.
// Needs: lesson.js (freshProgress, isMastered, todayStats, dayKey, weekKey, quests, TASKS, ACHIEVEMENTS, streak, ...),
// icons.js ($, seal). Uses later files at run time: toast/pushInbox (notify.js), render (views.js), L, syncPush.
// Provides: OS, micHelp, store, P (the learner's progress), stat, mastered, loaded, keepStamp, save, held, shown,
// checkRewards, restCheck, ask.

// ---- Progress (saved by the Rust app to %APPDATA%; localStorage when opened in a plain browser) ----
const OS = /Mac/.test(navigator.userAgent) ? 'mac'
  : /Windows/.test(navigator.userAgent) ? 'win'
  : 'linux';
const OS_NAME = {mac: 'macOS', win: 'Windows', linux: 'Linux'}[OS];

// Where to allow the microphone on this system
const micHelp = () => ({
  win: 'Check Windows Settings › Privacy › Microphone.',
  mac: 'Check System Settings › Privacy & Security › Microphone.',
  linux: 'Check that a microphone is connected and allowed in your sound settings.',
}[OS]);

// Texts in index.html that name Windows: elsewhere, data-os holds the words to say instead ("login" is a whole label)
document.querySelectorAll('[data-os]').forEach(element => {
  if (OS === 'win') return;
  if (element.dataset.os === 'login') element.textContent = 'Open when you sign in';
  else element.textContent = element.textContent.replace('Windows', element.dataset.os);
});

// The saved progress file as a JSON string: load() resolves to it, save(data) writes it
const store = window.__TAURI__
  ? {
    load: () => __TAURI__.core.invoke('load_progress'),
    save: data => __TAURI__.core.invoke('save_progress', {data}),
  }
  : {
    load: async () => localStorage.getItem('hangul') || '{}',
    save: async data => localStorage.setItem('hangul', data),
  };

let P = freshProgress();

// Stats of one item (heard / right / tries / written), created on first use
const stat = key => (P.stats[key] ??= {heard: 0, right: 0, tries: 0, written: 0});
const mastered = key => isMastered(P, key);
let loaded = false; // never save before the saved file is read, or an early click would wipe it
let keepStamp = false; // sync sets this while loading another PC's copy, so its save time is kept

// Saves the progress (once it is loaded), claims new rewards and redraws the screen.
function save() {
  if (loaded) {
    checkRewards(true);
    if (!keepStamp) P.savedAt = Date.now();
    store.save(JSON.stringify(P)).catch(saveFailed);
    if (typeof syncPush === 'function') syncPush();
  }
  const focused = document.activeElement;
  const say = focused?.dataset?.say;
  const letter = focused?.dataset?.letter;
  render();
  // The grid was rebuilt: keep your place by focusing the new button for the same item
  if (say != null && !focused.isConnected) {
    const letterSelector = letter ? `[data-letter="${CSS.escape(letter)}"]` : '';
    document.querySelector(`[data-say="${CSS.escape(say)}"]${letterSelector}`)?.focus({focusVisible: true});
  }
}

let saveWarned = false;
// Logs every failed save, but tells the learner only once
function saveFailed(error) {
  console.error('save failed', error);
  if (saveWarned) return;
  saveWarned = true;
  toast('sync', 'Progress could not be saved', String(error).slice(0, 120), 'bell');
}

// Claims finished daily/weekly quests and tasks (+XP), unlocks stamps. Every reward goes to the inbox;
// notify=true also pops a notification card. Returns the rewards found.
// held: reward cards waiting for the lesson to end; shown: cards to pop now.
const held = [];
const shown = [];
function checkRewards(notify) {
  const day = dayKey();
  const today = todayStats(P, day);
  const week = weekKey();
  const weekClaimed = (P.weekClaims[week] ??= []);
  const events = []; // [kind, title, body, icon] for pushInbox / toast

  const give = (xp, kind, title, iconName) => {
    P.xp += xp;
    P.days[day] = (P.days[day] || 0) + xp;
    events.push([kind, title, `+${xp} XP`, iconName]);
  };

  // Each claim helper returns true when it gave something
  const claimDailyQuests = () => {
    let gave = false;
    for (const quest of dailyQuests(day)) {
      if (!today.claimed.includes(quest.id) && questProgress(P, quest, day) >= quest.target) {
        today.claimed.push(quest.id);
        P.totals.quests++;
        if (today.claimed.length === 4) P.totals.fullDays++;
        give(QUEST_XP, 'quest', quest.text, quest.icon);
        gave = true;
      }
    }
    return gave;
  };

  const claimWeeklyQuests = () => {
    let gave = false;
    for (const quest of weeklyQuests(week)) {
      if (!weekClaimed.includes(quest.id) && weekProgress(P, quest, week) >= quest.target) {
        weekClaimed.push(quest.id);
        P.totals.weekly++;
        give(WEEKLY_XP, 'weekly', quest.text, quest.icon);
        gave = true;
        // All 3 weekly quests done: a rest day (keeps the streak over a missed day), up to 2 saved
        if (weekClaimed.length === 3 && (P.freezes || 0) < 2) {
          P.freezes = (P.freezes || 0) + 1;
          events.push(['stamp', 'Rest day earned', 'A missed day won’t break your streak', 'flame']);
        }
      }
    }
    return gave;
  };

  const claimTasks = () => {
    let gave = false;
    for (const task of TASKS) {
      if (P.tasks.includes(task.id)) continue;
      const [current, needed] = task.get(P);
      if (current >= needed) {
        P.tasks.push(task.id);
        give(task.xp, 'task', task.text, 'check');
        gave = true;
      }
    }
    return gave;
  };

  const unlockStamps = () => {
    let gave = false;
    for (const achievement of ACHIEVEMENTS) {
      if (P.badges.includes(achievement.id)) continue;
      const [current, needed] = achievement.get(P);
      if (current >= needed) {
        P.badges.push(achievement.id);
        events.push(['stamp', achievement.name, achievement.desc, achievement.icon]);
        gave = true;
      }
    }
    return gave;
  };

  // Rewards can unlock more rewards (XP quests, tasks about quests): repeat until a pass gives nothing
  let again = true;
  while (again) {
    again = false;
    if (claimDailyQuests()) again = true;
    if (claimWeeklyQuests()) again = true;
    P.bestStreak = Math.max(P.bestStreak || 0, streak(activeDays(P)));
    if (claimTasks()) again = true;
    if (unlockStamps()) again = true;
  }

  for (const event of events) pushInbox(...event);
  if (notify) {
    for (const event of events) {
      // don't cover a question: hold until the lesson ends
      if (L && !L.finished) held.push(event);
      else shown.push(event);
    }
  }
  if (shown.length) shown.splice(0).slice(0, 4).forEach(event => toast(...event));
  return events;
}

// Uses saved rest days for missed days so the streak survives, and says so
function restCheck() {
  const restDaysUsed = useRestDays(P);
  if (!restDaysUsed.length) return;
  save();
  const body = restDaysUsed.length === 1
    ? 'A rest day covered the day you missed.'
    : 'Rest days covered the 2 days you missed.';
  toast('sync', 'Streak saved', body, 'flame');
}

// In-app confirm dialog. Resolves true when the main action is chosen; Esc, Cancel or the backdrop = false.
// text keeps its line breaks (What's new lists). cancel = '' shows a plain notice with one button.
function ask({title, text, ok, cancel = 'Cancel', danger = false, sealText = '?'}) {
  const dialog = $('ask');
  $('askTitle').textContent = title;
  $('askText').textContent = text;
  $('askSeal').innerHTML = seal(sealText, 'm', danger ? '' : 'jade');
  $('askOk').textContent = ok;
  $('askOk').className = 'btn ' + (danger ? 'btn-red' : 'btn-ink');
  $('askCancel').textContent = cancel;
  $('askCancel').hidden = !cancel;
  dialog.returnValue = 'cancel';
  dialog.showModal();
  // safe choice focused first; ring only for keyboard users
  const firstButton = cancel ? $('askCancel') : $('askOk');
  firstButton.focus({focusVisible: false});
  return new Promise(resolve => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'ok'), {once: true});
  });
}

// A click on the backdrop (outside the card) cancels
$('ask').addEventListener('click', event => {
  if (event.target === $('ask')) $('ask').close('cancel');
});

$('reset').onclick = async () => {
  const confirmed = await ask({
    title: 'Erase all progress?',
    text: 'Your XP, streak, stamps, quests and every passed lesson will be deleted. This cannot be undone.',
    ok: 'Erase everything',
    danger: true,
    sealText: '!',
  });
  if (!confirmed) return;
  P = freshProgress();
  save();
  toast('sync', 'Progress erased', 'You are starting fresh.', 'rotate');
};
