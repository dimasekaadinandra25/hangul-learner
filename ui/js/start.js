// ---- Start ----
// Start-up: draw the page once with empty progress, then read the saved progress file, upgrade older save
// formats, and draw again. Runs last of the main scripts, so everything above is ready.
// Needs from earlier scripts: $, render, show, cur, P, loaded, store, save, checkRewards, restCheck, ask, toast,
// freshProgress, emptyDaily, dayKey, seedSrs, migrateKeys. At call time: lsGet, lsSet (listen.js),
// startPlacement (progress.js).
// Provides no names.

$('wGhost').textContent = cur().ch;
render();
store.load().then(json => {
  try {
    const saved = JSON.parse(json);
    const fresh = freshProgress();
    // Built on the side and only used once every step worked: if one fails, the learner really starts fresh
    // (as the message below says) instead of carrying on with a half-upgraded save.
    // `letters` = older save format
    const upgraded = {...fresh, ...saved, totals: {...fresh.totals, ...saved.totals}, stats: saved.stats || saved.letters || {}};
    if (saved.daily && !saved.log) { // older saves kept only today
      upgraded.log = {[saved.daily.date]: {...emptyDaily(saved.daily.date), ...saved.daily}};
    }
    upgraded.log ||= {};
    // keep 70 days of daily stats
    const cutoff = dayKey(new Date(Date.now() - 70 * 864e5));
    for (const day of Object.keys(upgraded.log)) {
      if (day < cutoff) delete upgraded.log[day];
    }
    delete upgraded.letters;
    delete upgraded.quiz;
    delete upgraded.daily;
    seedSrs(upgraded); // learners from before Smart review: what they know joins the schedule
    migrateKeys(upgraded);
    P = upgraded;
  } catch (e) {
    // keep the unreadable file (in Documents, or localStorage in a browser) so a learner can recover it
    console.error('progress file unreadable, starting fresh', e);
    const name = `progress-unreadable-${dayKey()}-${Date.now()}.json`;
    let keepCopy;
    if (window.__TAURI__) keepCopy = __TAURI__.core.invoke('export_backup', {name, data: json});
    else keepCopy = Promise.resolve(lsSet('progressUnreadable', json));
    const where = window.__TAURI__ ? 'in Documents › Hangul Learner as ' + name : 'in this browser';
    const message = `A copy is kept ${where}. You start fresh; Settings › Backup › Import brings back a backup.`;
    keepCopy
      .then(() => toast('sync', 'Your progress file could not be read', message, 'bell'))
      .catch(err => console.error('could not keep the unreadable file', err));
  }
  const rewards = checkRewards(false);
  loaded = true;
  render();
  // a missed day is covered by a rest day (also when the app stays open overnight)
  restCheck();
  setInterval(restCheck, 1800000);

  // first launch: offer the placement test to learners who already know some Korean
  const offerPlacement = async () => {
    if (lsGet('placeAsked', false)) return;
    lsSet('placeAsked', true);
    const wantsTest = await ask({
      title: 'Know some Korean already?',
      text: 'A short placement test finds your level, so you don’t start from the alphabet.'
        + ' You can also take it later on the Test page.',
      ok: 'Find my level',
      cancel: 'Start from Hangul',
      sealText: '?',
    });
    if (wantsTest) {
      show('test');
      startPlacement();
    }
  };
  if (!P.xp && !Object.keys(P.units).length && !lsGet('placeAsked', false)) setTimeout(offerPlacement, 1500);

  if (rewards.length) {
    const title = `${rewards.length} reward${rewards.length === 1 ? '' : 's'} from your progress`;
    toast('sync', title, 'Open the bell to see them all.');
  }
}).catch(e => {
  console.error('load failed', e);
  const message = 'Nothing will be saved until you restart the app, so your file stays as it is. '
    + String(e).slice(0, 100);
  toast('sync', 'Could not open your progress', message, 'bell');
});
