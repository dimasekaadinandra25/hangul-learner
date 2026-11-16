// ---- Quests & stamp collection ----
// The Quests page: daily and weekly quests with their reset countdowns, one-time tasks and the stamp collection.
// Needs from earlier scripts: $, icon, seal (icons.js); P (save.js); dailyRows, weeklyRows, taskRows (views.js);
// dayKey, weekKey, todayStats, TASKS, ACHIEVEMENTS (lesson.js).
// Provides: renderQuests.

function renderQuests() {
  const day = dayKey();
  const dayStats = todayStats(P, day);
  const now = new Date();
  const week = weekKey();
  const weekClaimed = P.weekClaims[week] || [];
  const msToMidnight = new Date(new Date().setHours(24, 0, 0, 0)) - now;
  // next Monday 00:00
  const nextMonday = new Date(now);
  nextMonday.setHours(0, 0, 0, 0);
  nextMonday.setDate(nextMonday.getDate() + ((8 - nextMonday.getDay()) % 7 || 7));
  const msToMonday = nextMonday - now;

  $('qSummary').innerHTML = [
    `<div><b>${dayStats.claimed.length}/4</b><small>daily quests</small></div>`,
    `<div><b>${weekClaimed.length}/3</b><small>weekly quests</small></div>`,
    `<div><b>${P.tasks.length}/${TASKS.length}</b><small>tasks done</small></div>`,
  ].join('');
  $('qReset').textContent = `New in ${Math.floor(msToMidnight / 3.6e6)}h ${Math.floor(msToMidnight / 6e4) % 60}m`;
  $('wReset').textContent = `New in ${Math.floor(msToMonday / 864e5)}d ${Math.floor(msToMonday / 3.6e6) % 24}h`;
  $('questList').innerHTML = dailyRows(false);
  $('weeklyList').innerHTML = weeklyRows(false);
  $('restNote').textContent = 'Finish all 3 to earn a rest day: it covers a missed day so your streak continues'
    + ` (up to 2). You have ${P.freezes || 0}.`;
  $('tCount').textContent = `${P.tasks.length} of ${TASKS.length} done`;
  $('taskList').innerHTML = taskRows();
  $('bCount').textContent = `${P.badges.length} of ${ACHIEVEMENTS.length} collected`;
  $('badgeList').innerHTML = ACHIEVEMENTS.map(achievement => {
    const got = P.badges.includes(achievement.id);
    const [count, target] = achievement.get(P);
    let progress = '';
    if (!got) {
      progress = [
        `<div class="line" role="progressbar" aria-valuenow="${Math.min(count, target)}" aria-valuemax="${target}"`,
        ` aria-label="${achievement.name}"><i style="width:${Math.min(1, count / target) * 100}%"></i></div>`,
        `<small>${Math.min(count, target)} / ${target}</small>`,
      ].join('');
    }
    return [
      `<div class="stamp-card">${seal(icon(achievement.icon), 'm', got ? '' : 'ghost')}`,
      `<b>${achievement.name}</b><small>${achievement.desc}</small>`,
      `\n      ${progress}</div>`,
    ].join('');
  }).join('');
}
