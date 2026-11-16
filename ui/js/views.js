// ---- Views ----
// Page switching (the nav bar and the More panel), the shared render() that redraws the current page,
// and the header stats plus the quest/task rows that several pages reuse.
// Needs from earlier scripts: $, icon, seal (icons.js); P, mastered (save.js); renderSfx (sound.js);
// renderTheme (theme.js); dayKey, todayStats, streak, activeDays, wordsMastered, dailyQuests, weeklyQuests,
// questProgress, weekProgress, TASKS, ACHIEVEMENTS, GOALS, QUEST_XP, WEEKLY_XP (lesson.js); ALL (data.js).
// Provides: view, show, render, setStat, qRow, dailyRows, weeklyRows, taskRows, nextTask, renderStats.
// render() also calls page renderers from later scripts (renderPath, renderQuests, renderVocab, cur, ...).

let view = 'learn';

// Switch to a page: mark its nav item, show its <section> and draw it.
function show(page) {
  view = page;
  document.querySelectorAll('.nav-item[data-tab]').forEach(item => {
    if (item.dataset.tab === page) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
  $('navMore').classList.toggle('cur', ['quests', 'letters', 'write', 'test', 'stats'].includes(page));
  document.querySelectorAll('main>section').forEach(section => {
    section.hidden = section.id !== page;
  });
  render();
  scrollTo(0, 0);
}

document.querySelectorAll('.nav-item[data-tab]').forEach(button => {
  button.onclick = () => {
    moreOpen(false);
    show(button.dataset.tab);
  };
});

// More (narrow windows): the pages that don't fit in the bottom bar
const moreOpen = on => {
  $('morePanel').hidden = !on;
  $('navMore').setAttribute('aria-expanded', on);
  if (on) $('morePanel').querySelector('button').focus({focusVisible: false});
};
$('navMore').onclick = () => moreOpen($('morePanel').hidden);
document.addEventListener('click', e => {
  if (!$('morePanel').hidden && !e.target.closest('#morePanel,#navMore')) moreOpen(false);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('morePanel').hidden) {
    moreOpen(false);
    $('navMore').focus();
  }
});

// Redraw the header stats and the current page. Pages from later scripts are checked with typeof.
function render() {
  DAILY_GOAL = GOALS.includes(+P.goal) ? +P.goal : 30;
  renderStats();
  renderSfx();
  renderTheme();
  if (view === 'learn') renderPath();
  if (view === 'quests') renderQuests();
  if (view === 'vocab') renderVocab();
  if (view === 'letters') renderLetters();
  if (view === 'listen' && typeof renderListen === 'function') renderListen();
  if (view === 'test' && typeof renderTest === 'function') renderTest();
  if (view === 'stats' && typeof renderStatsPage === 'function') renderStatsPage();
  if (view === 'practice' && typeof renderPractice === 'function') renderPractice();
  if (view === 'vocab' && typeof renderMineCount === 'function') renderMineCount();
  if (view === 'write') $('wCount').textContent = `Practised ${P.stats[cur().ch]?.written || 0} times`;
}

// Fill every element marked data-stat="<name>" with a value
const setStat = (name, value) => {
  document.querySelectorAll(`[data-stat="${name}"]`).forEach(el => {
    el.textContent = value;
  });
};

// One quest/task row: checkbox, text, progress line, reward
const qRow = (quest, count, done, reward, compact) => {
  const rowClass = `quest${done ? ' done' : ''}${compact ? ' compact' : ''}`;
  const checkBox = `<span class="check">${done ? icon('check') : ''}</span>`;
  // A finished one-step quest needs no progress line
  let progressLine = '';
  if (!(done && quest.target === 1)) {
    progressLine = [
      '<div class="qline">',
      `<div class="line" role="progressbar" aria-valuenow="${count}" aria-valuemax="${quest.target}"`,
      ` aria-label="${quest.text}"><i style="width:${count / quest.target * 100}%"></i></div>`,
      `<span>${count}/${quest.target}</span></div>`,
    ].join('');
  }
  const rewardHtml = compact ? '' : `<span class="reward">+${reward} XP</span>`;
  return [
    `<div class="${rowClass}">${checkBox}`,
    `\n  <div class="qbody"><b>${quest.text}</b>${progressLine}</div>`,
    `\n  ${rewardHtml}</div>`,
  ].join('');
};

// Today's daily quests as rows
function dailyRows(compact) {
  const day = dayKey();
  const dayStats = todayStats(P, day);
  return dailyQuests(day)
    .map(quest => qRow(quest, questProgress(P, quest, day), dayStats.claimed.includes(quest.id), QUEST_XP, compact))
    .join('');
}

// This week's weekly quests as rows
function weeklyRows(compact) {
  const week = weekKey();
  const claimed = P.weekClaims[week] || [];
  return weeklyQuests(week)
    .map(quest => qRow(quest, weekProgress(P, quest, week), claimed.includes(quest.id), WEEKLY_XP, compact))
    .join('');
}

// All one-time tasks as rows, with a heading where a new group starts
function taskRows() {
  let group = '';
  return TASKS.map(task => {
    const [count, target] = task.get(P);
    let head = '';
    if (task.group !== group) {
      group = task.group;
      head = `<div class="task-group">${group}</div>`;
    }
    return head + qRow({text: task.text, target}, Math.min(count, target), P.tasks.includes(task.id), task.xp);
  }).join('');
}

// The first task not done yet (undefined when all are done)
const nextTask = () => TASKS.find(task => !P.tasks.includes(task.id));

// Header and side rail: streak, XP, goal ring, quests, unread count, latest stamps
function renderStats() {
  const day = dayKey();
  const today = P.days[day] || 0;
  const streakDays = streak(activeDays(P));
  setStat('streak', streakDays);
  setStat('xp', P.xp.toLocaleString());
  setStat('words', wordsMastered(P));
  setStat('today', `${Math.min(today, DAILY_GOAL)}/${DAILY_GOAL}`);
  document.querySelectorAll('.ring-fg').forEach(ring => {
    ring.style.strokeDashoffset = 100 - Math.min(1, today / DAILY_GOAL) * 100;
  });

  let hint;
  if (today >= DAILY_GOAL) hint = 'Goal reached. Well done.';
  else if (streakDays > 0 && !today) hint = 'Study today to keep your streak.';
  else hint = `${DAILY_GOAL - today} XP to go today`;
  setStat('hint', hint);

  setStat('badges', `${P.badges.length} of ${ACHIEVEMENTS.length} collected`);
  setStat('letters', ALL.filter(letter => mastered(letter.ch)).length);
  const weeklyDone = (P.weekClaims[weekKey()] || []).length;
  $('railQuests').innerHTML = dailyRows(true)
    + `<p class="rail-note">This week: ${weeklyDone}/3 weekly · Tasks: ${P.tasks.length}/${TASKS.length}</p>`;

  const unread = P.inbox.filter(note => note.at > (P.inboxSeen || 0)).length;
  setStat('unread', unread > 9 ? '9+' : unread || '');

  const latestStamps = P.badges.slice(-6).map(id => {
    const achievement = ACHIEVEMENTS.find(x => x.id === id);
    if (!achievement) return '';
    return `<span title="${achievement.name}">${seal(icon(achievement.icon), 'm')}</span>`;
  }).join('');
  $('railBadges').innerHTML = latestStamps || '<span class="muted">Finish a lesson to earn your first stamp.</span>';
}
