// End-to-end test of the real desktop app (release build), run with:  npm run e2e
// Starts hangul-learner.exe with WebView2's debugging port, drives the main window and the mini window
// through the Chrome DevTools Protocol, and checks windows/tray through Windows messages (win.ps1).
// No mouse or keyboard input is used. Your progress file and app settings are backed up first and put
// back at the end, even when a test fails. Podcasts/YouTube need internet. Audio is muted while testing.
const {execFileSync, spawn} = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const EXE = path.join(ROOT, 'src-tauri', 'target', 'release', 'hangul-learner.exe');
const DATA = path.join(process.env.APPDATA, 'com.hangul.learner', 'progress.json');
const BACKUP = path.join(os.tmpdir(), 'hangul-e2e-backup.json');
const PORT = 9223;
const MAIN = 'Hangul Learner', MINI = 'Hangul Learner mini player';
const exported = []; // backup files written by the test, deleted at the end
let autoWas = null; // Start with Windows before the test, put back at the end
let clipSaved = false; // the clipboard was saved and must be put back
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- Windows side ----
const win = (...a) => {
  const out = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'win.ps1'), ...a.map(String)], {encoding: 'utf8'}).trim();
  try { return JSON.parse(out) } catch { return out }
};
const appPid = () => +win('pid');
async function waitFor(fn, ms = 10000, what = 'condition') {
  const t = Date.now();
  while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(150) }
  throw new Error('timed out waiting for ' + what);
}

// ---- DevTools protocol ----
class Page {
  constructor(ws) { this.ws = ws; this.id = 0; this.cbs = new Map(); ws.onmessage = e => { const m = JSON.parse(e.data); this.cbs.get(m.id)?.(m); this.cbs.delete(m.id) } }
  static async open(kind) {
    const p = await waitFor(async () => { // the list changes while the app starts, so ask again each time
      try { return (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(p => p.type === 'page' && p.url.startsWith('http') && (kind === 'mini') === p.url.includes('mini.html')) } catch { return null }
    }, 25000, kind + ' page');
    const ws = new WebSocket(p.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej });
    return new Page(ws);
  }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({id, method, params})); return new Promise(r => this.cbs.set(id, r)) }
  // Runs an async function body in the page and returns its JSON result. Throws page errors here.
  async run(body) {
    const m = await this.send('Runtime.evaluate', {expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true});
    if (m.result?.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description?.split('\n')[0] || 'page error');
    return m.result?.result?.value;
  }
  close() { try { this.ws.close() } catch {} }
}

// Helpers installed in the main page: waiting, clicking, and answering lesson exercises like a learner would.
const HELPERS = `
// Windows notifications are recorded, not shown, so testing doesn't pop banners on your screen
if(window.__TAURI__?.notification){window.sentNotes=[];__TAURI__.notification.sendNotification=o=>{sentNotes.push(o)}}
try{localStorage.setItem('placeAsked','true')}catch(e){} // no first-launch placement offer while testing
window.T={
  sleep:ms=>new Promise(r=>setTimeout(r,ms)),
  async until(f,ms=10000,what='condition'){const t=Date.now();while(Date.now()-t<ms){const v=f();if(v)return v;await T.sleep(60)}throw Error('timed out: '+what)},
  click(x){const e=typeof x==='string'?document.querySelector(x):x;if(!e)throw Error('missing element '+x);if(e.disabled)throw Error('disabled: '+x);e.click()},
  key(k){document.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true}))},
  answer(right){
    const ex=L.ex;
    if(ex.type==='intro'){T.click('#action');return}
    if(ex.type==='choice'){
      const o=ex.options.find(o=>right?o.value===ex.answer:o.value!==ex.answer);
      T.click([...document.querySelectorAll('.opt')].find(b=>b.dataset.v===o.value));
    }else if(right){
      let rest=ex.answer;const used=[];
      while(rest.length){const i=ex.tiles.findIndex((t,i)=>!used.includes(i)&&rest.startsWith(t));if(i<0)throw Error('cannot build '+ex.answer);used.push(i);rest=rest.slice(ex.tiles[i].length);T.click('#bank [data-i="'+i+'"]')}
    }else T.click('#bank [data-i="'+ex.tiles.findIndex(t=>t!==ex.answer)+'"]');
    T.click('#action');            // Check
    if(!L.finished)T.click('#action'); // Continue / Got it
  },
  async lesson(wrongs=0){
    let n=0;
    while(!L.finished){if(++n>300)throw Error('lesson never ended');T.answer(!(L.ex.type!=='intro'&&wrongs>0&&wrongs--));await T.sleep(2)}
    return{passed:L.passed,hearts:L.hearts,right:L.right,wrong:L.wrong};
  },
  start(unit,step){P.section=UNITS[unit].section;show('learn');T.click('#path [data-unit="'+unit+'"][data-step="'+step+'"]');if($('lesson').hidden)throw Error('lesson did not open')},
  mute(){player.muted=true;pod.muted=true;sAudio.muted=true;yt?.mute?.()},
};
T.mute();true;`;

// ---- test bookkeeping ----
const results = [];
let section = '';
async function test(name, fn) {
  process.stdout.write(`  ${name} ... `);
  try { await fn(); results.push({section, name, ok: true}); console.log('PASS') }
  catch (e) {
    if (String(e.message).startsWith('SKIP')) { results.push({section, name, ok: true, skip: e.message}); console.log(e.message); return }
    results.push({section, name, ok: false, err: e.message}); console.log('FAIL: ' + e.message);
  }
}
const group = s => { section = s; console.log('\n' + s) };
// every group starts clean: nothing playing, no lesson or test, no dialog, mini window closed
async function fresh() {
  await main.run(`stopAll();document.querySelectorAll('dialog[open]').forEach(d=>d.close());if(L)closeLesson();TS=null;return true`).catch(() => {});
  if (visible(MINI)) { await mini.run(`document.getElementById('close').click();return true`); await waitFor(() => !visible(MINI), 4000, 'mini hidden').catch(() => {}) }
}
const ok = (c, msg) => { if (!c) throw new Error(msg) };
const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`) };

let main, mini, child;
// fake microphone so 'Say it' recording can be tested without a real one
async function launch(args = []) {
  child = spawn(EXE, args, {env: {...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT} --use-fake-device-for-media-stream --use-fake-ui-for-media-stream`}, detached: true, stdio: 'ignore'});
  child.unref();
  main = await Page.open('main'); mini = await Page.open('mini');
  await main.run(`await new Promise(r=>{const c=()=>typeof loaded!=='undefined'&&loaded&&typeof PL!=='undefined'?r():setTimeout(c,50);c()});return true`);
  await main.run(HELPERS);
}
async function waitExit(ms = 8000) { await waitFor(() => !appPid(), ms, 'app to exit'); main?.close(); mini?.close(); await sleep(2500) } // let WebView2 shut down
const menu = () => { const m = win('traymenu'); if (m.error) throw new Error(m.error); return m.items };
const menuCmd = text => { const it = menu().find(i => i.text === text); ok(it, 'menu item missing: ' + text); win('traycmd', it.id) };
const visible = t => win('state', t).visible;

(async () => {
  if (!fs.existsSync(EXE)) throw new Error('Build the app first: npx tauri build');
  if (appPid()) throw new Error('Hangul Learner is running. Close it (tray > Quit) and run the test again.');
  win('build');
  const hadData = fs.existsSync(DATA);
  if (hadData) fs.copyFileSync(DATA, BACKUP);
  let savedStorage = null;
  try {
    if (hadData) fs.unlinkSync(DATA); // first launch on a fresh profile
    await launch();
    savedStorage = await main.run(`return JSON.stringify(Object.fromEntries(Object.entries(localStorage)))`);
    fs.writeFileSync(BACKUP + '.storage', savedStorage);
    await main.run(`localStorage.clear();localStorage.setItem('placeAsked','true');setTheme('auto');return true`);

    group('Start-up');
    await test('main window opens, mini window starts hidden', async () => {
      ok(visible(MAIN), 'main window not visible'); ok(win('state', MINI).found, 'mini window missing'); ok(!visible(MINI), 'mini window should start hidden');
    });
    await test('first launch: fresh progress, Learn page, Hangul basics', async () => {
      const r = await main.run(`return {xp:P.xp,view,hero:document.querySelector('.hero h2').textContent,units:document.querySelectorAll('#path details.unit').length,locked:document.querySelectorAll('#path details.unit.locked').length,words:VOCAB.length}`);
      eq(r.xp, 0, 'xp'); eq(r.view, 'learn', 'view'); eq(r.hero, 'Hangul basics', 'hero'); eq(r.units, 10, 'units'); eq(r.locked, 9, 'locked units'); eq(r.words, 1020, 'words');
    });
    await test('every nav item opens its page', async () => {
      const r = await main.run(`const out={};for(const b of document.querySelectorAll('.nav-item')){b.click();out[b.dataset.tab]=!$(b.dataset.tab).hidden&&b.getAttribute('aria-current')==='page'&&[...document.querySelectorAll('main>section')].filter(s=>!s.hidden).length===1}show('learn');return out`);
      eq(r, {learn: true, quests: true, vocab: true, letters: true, write: true, practice: true, listen: true, test: true, stats: true}, 'pages');
    });

    group('Lessons');
    await test('Learn 1: intro cards + questions, all right, XP and first rewards', async () => {
      const r = await main.run(`T.start(0,0);const intro=L.ex.type;const res=await T.lesson();const xp=P.xp;T.click('#action');await T.sleep(300);
        return {...res,intro,xp,done:stepDone(P,UNITS[0],0),open:!$('lesson').hidden,tasks:P.tasks,badges:P.badges,toasts:$('toasts').children.length}`);
      eq(r.intro, 'intro', 'first card'); ok(r.passed, 'not passed'); ok(r.xp > 0, 'no XP'); ok(r.done, 'step not saved'); ok(!r.open, 'lesson still open after Continue');
      ok(r.tasks.includes('t-first'), 'task "Finish your first lesson" not claimed'); ok(r.badges.includes('first'), 'stamp "First steps" missing'); ok(r.toasts > 0, 'no notification after the lesson');
    });
    await test('Learn 2 and Practice pass the unit and unlock the next one', async () => {
      const r = await main.run(`T.start(0,1);await T.lesson();T.click('#action');T.start(0,2);await T.lesson();const unlock=document.querySelector('.unlock')?.textContent||'';T.click('#action');
        return {passed:P.units.vowels,unlock,next:!document.querySelectorAll('#path details.unit')[1].classList.contains('locked'),inbox:P.inbox.some(n=>n.kind==='unlock')}`);
      ok(r.passed > 0, 'unit not passed'); ok(r.unlock.includes('Consonants 1'), 'no unlock message'); ok(r.next, 'next unit still locked'); ok(r.inbox, 'unlock not in inbox');
    });
    await test('a wrong answer costs a heart, comes back at the end, and is saved for review', async () => {
      const r = await main.run(`T.start(1,0);while(L.ex.type==='intro')T.answer(true);const ex=L.ex,h=L.hearts;T.answer(false);
        const r={heartLost:h-L.hearts,requeued:L.queue[L.queue.length-1]===ex,mistake:P.mistakes[ex.key]==='cons1'};const res=await T.lesson();T.click('#action');return {...r,...res}`);
      eq(r.heartLost, 1, 'hearts lost'); ok(r.requeued, 'missed question not re-queued'); ok(r.mistake, 'mistake not saved'); ok(r.passed, 'lesson should still pass'); eq(r.wrong, 1, 'wrong count');
    });
    await test('Challenge: running out of hearts fails, Try again restarts with full hearts', async () => {
      const r = await main.run(`T.start(0,3);const res=await T.lesson(3);const title=document.querySelector('.finish h2').textContent,btn=$('action').textContent;T.click('#action');
        return {...res,title,btn,restarted:!L.finished&&L.hearts===3}`);
      ok(!r.passed, 'should fail'); eq(r.hearts, 0, 'hearts'); eq(r.title, 'Out of hearts', 'title'); eq(r.btn, 'Try again', 'button'); ok(r.restarted, 'Try again did not restart');
    });
    await test('Challenge: perfect run passes with a gold stamp', async () => {
      const r = await main.run(`const res=await T.lesson();T.click('#action');return {...res,ch:P.totals.challenges,perfect:P.totals.perfect>0,gold:!!document.querySelector('#path details.unit [data-unit="0"][data-step="3"] .seal.gold')}`);
      ok(r.passed, 'not passed'); eq(r.wrong, 0, 'wrong'); eq(r.ch, 1, 'challenges'); ok(r.perfect, 'perfect not counted'); ok(r.gold, 'no gold 완 stamp');
    });
    await test('keyboard: number keys pick an answer, Enter checks and continues', async () => {
      const r = await main.run(`T.start(0,2);while(L.ex.type!=='choice')T.answer(true);const ex=L.ex,n=ex.options.findIndex(o=>o.value===ex.answer)+1;
        T.key(String(n));const sel=L.sel===ex.answer;T.key('Enter');const checked=L.answered;T.key('Enter');const moved=L.ex!==ex||L.finished;return {sel,checked,moved}`);
      eq(r, {sel: true, checked: true, moved: true}, 'keyboard flow');
    });
    await test('Leave lesson: Cancel keeps it, Esc asks, Leave closes without XP', async () => {
      const r = await main.run(`const xp=P.xp;T.click('#quit');await T.sleep(50);const asked=$('ask').open;T.click('#askCancel');await T.sleep(50);const kept=!$('lesson').hidden&&!$('ask').open;
        T.key('Escape');await T.sleep(50);const escAsk=$('ask').open;$('ask').close('ok');await T.sleep(100);return {asked,kept,escAsk,closed:$('lesson').hidden,xp:P.xp===xp}`);
      eq(r, {asked: true, kept: true, escAsk: true, closed: true, xp: true}, 'leave flow');
    });
    await test('Review mistakes clears the mistakes list', async () => {
      const r = await main.run(`show('learn');const before=Object.keys(P.mistakes).length;T.click('[data-review]');const isReview=L.meta.step==null;const res=await T.lesson();T.click('#action');
        return {before,isReview,passed:res.passed,after:Object.keys(P.mistakes).length,reviews:P.totals.reviews,slip:!!document.querySelector('[data-review]')}`);
      ok(r.before > 0, 'no mistakes to review'); ok(r.isReview, 'not a review lesson'); ok(r.passed, 'review failed'); eq(r.after, 0, 'mistakes left'); eq(r.reviews, 1, 'reviews'); ok(!r.slip, 'review slip still shown');
    });
    await test('level tabs switch to TOPIK 3 (8 word + 4 grammar units, first open) and back', async () => {
      const r = await main.run(`T.click('#levels [data-sec="3"]');const a={hero:document.querySelector('.hero h2').textContent,units:document.querySelectorAll('#path details.unit').length,firstOpen:!document.querySelector('#path details.unit').classList.contains('locked')};T.click('#levels [data-sec="0"]');return {...a,back:document.querySelector('.hero h2').textContent}`);
      eq(r, {hero: 'TOPIK 3', units: 12, firstOpen: true, back: 'Hangul basics'}, 'tabs');
    });
    await test('units fold and unfold, and stay open after the page redraws', async () => {
      const r = await main.run(`const d=()=>document.querySelectorAll('#path details.unit')[4];const was=d().open;T.click(d().querySelector('summary'));await T.sleep(50);save();await T.sleep(50);const kept=d().open;T.click(d().querySelector('summary'));await T.sleep(50);save();return {was,kept,closed:!d().open}`);
      eq(r, {was: false, kept: true, closed: true}, 'fold');
    });
    await test('Hero "Continue" button starts the next step', async () => {
      const r = await main.run(`const b=document.querySelector('.hero [data-step]');const want=[+b.dataset.unit,+b.dataset.step];b.click();const got=[L.meta.unitIdx,L.meta.step];$('ask').close();closeLesson();return {want,got}`);
      eq(r.got, r.want, 'step started');
    });

    group('Quests, tasks, stamps, notifications');
    await test('Quests page lists 4 daily, 3 weekly, all tasks and stamps', async () => {
      const r = await main.run(`show('quests');return {daily:$('questList').querySelectorAll('.quest').length,weekly:$('weeklyList').querySelectorAll('.quest').length,tasks:$('taskList').querySelectorAll('.quest').length,nTasks:TASKS.length,stamps:$('badgeList').children.length,nStamps:ACHIEVEMENTS.length}`);
      eq(r.daily, 4, 'daily'); eq(r.weekly, 3, 'weekly'); eq(r.tasks, r.nTasks, 'tasks'); eq(r.stamps, r.nStamps, 'stamps');
    });
    await test('a finished daily quest is claimed automatically (+10 XP, notification, inbox)', async () => {
      const r = await main.run(`const day=dayKey(),d=todayStats(P),q=dailyQuests(day).find(q=>q.metric!=='xp'&&!d.claimed.includes(q.id));if(!q)return {skip:true};
        const xp=P.xp;if(q.metric==='minutes')d.seconds+=q.target*60;else if(q.metric==='podcast')d.podcastSec+=q.target*60;else d[q.metric]=(d[q.metric]||0)+q.target;save();
        return {claimed:d.claimed.includes(q.id),gain:P.xp-xp,inbox:P.inbox[0]?.kind,toast:[...$('toasts').children].some(t=>t.textContent.includes(q.text))}`);
      if (r.skip) return; ok(r.claimed, 'not claimed'); ok(r.gain >= 10, 'no +10 XP'); ok(r.toast, 'no notification card');
    });
    await test('a finished weekly quest is claimed automatically (+40 XP)', async () => {
      const r = await main.run(`const wk=weekKey(),day=dayKey(),d=todayStats(P),wc=P.weekClaims[wk]||[];const q=weeklyQuests(wk).find(q=>!['days','goal'].includes(q.metric)&&!wc.includes(q.id));if(!q)return {skip:true};
        const xp=P.xp;if(q.metric==='xp')P.days[day]=(P.days[day]||0)+q.target;else if(q.metric==='minutes')d.seconds+=q.target*60;else if(q.metric==='podcast')d.podcastSec+=q.target*60;else d[q.metric]=(d[q.metric]||0)+q.target;save();
        return {claimed:(P.weekClaims[wk]||[]).includes(q.id),gain:P.xp-xp}`);
      if (r.skip) return; ok(r.claimed, 'not claimed'); ok(r.gain >= 40, 'no +40 XP');
    });
    await test('bell opens the inbox, marks items read, Esc closes it', async () => {
      const r = await main.run(`save();const unread=document.querySelector('.rail [data-stat=unread]')?.textContent||document.querySelector('[data-stat=unread]').textContent;T.click('[data-inbox]');const open=!$('inbox').hidden,items=$('inboxList').children.length;
        T.key('Escape');return {unread,open,items,closed:$('inbox').hidden,after:document.querySelector('[data-stat=unread]').textContent}`);
      ok(r.unread !== '', 'no unread badge'); ok(r.open, 'inbox did not open'); ok(r.items > 0, 'inbox empty'); ok(r.closed, 'Esc did not close'); eq(r.after, '', 'unread badge after reading');
    });
    await test('notification cards can be dismissed', async () => {
      const r = await main.run(`toast('task','Test card','+1 XP');const t=$('toasts').lastElementChild;T.click(t.querySelector('.t-x'));await T.sleep(400);return !t.isConnected`);
      ok(r, 'card not removed');
    });

    group('Words, Letters, Write');
    await test('Words: search English and Korean, level filter, empty result', async () => {
      const r = await main.run(`show('vocab');const s=$('vSearch'),q=v=>{s.value=v;s.dispatchEvent(new Event('input'));return $('vCount').textContent};
        const en=q('love'),hasKo=$('vList').textContent.includes('사랑'),ko=q('사랑'),none=q('zzzz-no-word'),empty=$('vList').textContent.trim();q('');
        T.click('#vLevels [data-vsec="6"]');const t6=$('vCount').textContent;T.click('#vLevels [data-vsec="-1"]');return {en,hasKo,ko,none,empty,t6,all:$('vCount').textContent}`);
      ok(parseInt(r.en) >= 1 && r.hasKo, 'English search'); ok(parseInt(r.ko) >= 1, 'Korean search'); eq(r.none, '0 words', 'no match'); eq(r.empty, 'No words match.', 'empty text'); eq(r.t6, '160 words', 'TOPIK 6'); eq(r.all, '1020 words', 'all');
    });
    await test('Words: a search counts toward the "Search the word list" task', async () => {
      const r = await main.run(`const s=$('vSearch');s.value='water';s.dispatchEvent(new Event('change'));s.value='';s.dispatchEvent(new Event('input'));return {n:P.totals.searches,task:P.tasks.includes('t-search')}`);
      ok(r.n >= 1, 'search not counted'); ok(r.task, 'task not claimed');
    });
    await test('Letters: tapping a letter counts as heard', async () => {
      const r = await main.run(`show('letters');T.click('#letterGrid [data-letter="ㄱ"]');return {heard:P.stats['ㄱ'].heard,task:P.tasks.includes('t-hear')}`);
      ok(r.heard >= 1, 'not heard'); ok(r.task, 'task not claimed');
    });
    await test('Letters: syllable builder composes 가 and flags unrecorded syllables', async () => {
      const r = await main.run(`const set=(id,v)=>{$(id).value=v;$(id).dispatchEvent(new Event('change'))};set('bInit',0);set('bVow',0);set('bFin',0);const ga=$('bOut').textContent,gaNote=$('bNote').textContent;
        set('bInit',7);set('bVow',16);set('bFin',8);const odd=$('bOut').textContent,note=$('bNote').textContent;const b=P.totals.built;T.click('#bSay');return {ga,gaNote,odd,note,built:P.totals.built-b,task:P.tasks.includes('t-build')}`);
      eq(r.ga, '가', 'compose'); eq(r.gaNote, '', 'recorded note'); ok(r.note.includes('Not pre-recorded'), 'unrecorded note'); eq(r.built, 1, 'built counter'); ok(r.task, 'task not claimed');
    });
    await test('Write: drawing on the pad counts once per attempt; Next, Guide and Clear work', async () => {
      const r = await main.run(`show('write');$('wCanvas').setPointerCapture=()=>{};const cv=$('wCanvas'),b=cv.getBoundingClientRect(),ev=(t,x,y)=>cv.dispatchEvent(new PointerEvent(t,{pointerId:1,clientX:b.left+x,clientY:b.top+y,bubbles:true}));
        const ch=cur().ch,w0=P.stats[ch]?.written||0;ev('pointerdown',40,40);ev('pointermove',120,140);ev('pointerup',120,140);ev('pointerdown',60,60);ev('pointerup',60,60);const w1=P.stats[ch].written;
        T.click('#wNext');const next=cur().ch;T.click('[data-wtab=trace]');T.click('#wGuide');const guideOff=$('wGuideCv').hidden;T.click('#wGuide');T.click('#wClear');return {once:w1-w0,next:next!==ch,guideOff,task:P.tasks.includes('t-write')}`);
      eq(r, {once: 1, next: true, guideOff: true, task: true}, 'write');
    });

    group('Settings');
    await test('theme: Light, Dark, Auto buttons and the cycle button; mini window follows', async () => {
      const r = await main.run(`const h=document.documentElement,bg=()=>getComputedStyle(document.body).backgroundColor;T.click('[data-set-theme=dark]');const dark=[h.dataset.theme,localStorage.getItem('theme'),bg()];
        T.click('[data-set-theme=light]');const light=[h.dataset.theme,bg()];T.click('[data-set-theme=auto]');const auto=[h.dataset.theme??null,localStorage.getItem('theme')];
        T.click('[data-theme-btn]');const c1=getTheme();T.click('[data-theme-btn]');const c2=getTheme();return {dark,light,auto,c1,c2}`);
      eq(r.dark.slice(0, 2), ['dark', 'dark'], 'dark'); eq(r.dark[2], 'rgb(23, 20, 15)', 'dark background'); eq(r.light, ['light', 'rgb(244, 238, 226)'], 'light'); eq(r.auto, [null, null], 'auto'); eq([r.c1, r.c2], ['light', 'dark'], 'cycle');
      const m = await waitFor(() => mini.run(`return document.documentElement.dataset.theme==='dark'`), 3000, 'mini to turn dark'); ok(m, 'mini theme');
      await main.run(`setTheme('auto');return true`);
    });
    await test('sound effects switch turns off and on', async () => {
      const r = await main.run(`const a=$('sfxToggle').textContent;T.click('#sfxToggle');const b=[$('sfxToggle').textContent,P.sfx];T.click('#sfxToggle');return {a,b,c:P.sfx!==false}`);
      eq(r, {a: 'Sound effects: on', b: ['Sound effects: off', false], c: true}, 'sfx');
    });

    group('Grammar'); await fresh();
    await test('TOPIK 1 has a Grammar track whose first unit is open on its own', async () => {
      const r = await main.run(`show('learn');T.click('#levels [data-sec="1"]');const g=[...document.querySelectorAll('#path details.unit.grammar')];
        return {track:[...document.querySelectorAll('#path .track')].map(t=>t.textContent),n:g.length,firstOpen:!g[0].classList.contains('locked'),secondLocked:g[1].classList.contains('locked'),units:document.querySelectorAll('#path details.unit').length}`);
      eq(r.track, ['단어Words', '문법Grammar'], 'track headings'); eq(r.n, 4, 'grammar units'); ok(r.firstOpen, 'first grammar unit locked'); ok(r.secondLocked, 'second grammar unit should wait'); eq(r.units, 13, 'units in TOPIK 1');
    });
    await test('grammar Learn 1: pattern cards with an example, then questions; all pass', async () => {
      const r = await main.run(`const gi=UNITS.findIndex(u=>u.id==='g1-0');T.start(gi,0);const intro={kicker:document.querySelector('.intro-card .kicker').textContent,ex:!!document.querySelector('.intro-ex')};
        const g0=todayStats(P).grammar||0;const res=await T.lesson();T.click('#action');return {...res,intro,grammar:(todayStats(P).grammar||0)-g0,srs:Object.keys(P.srs).some(k=>P.srs[k].u==='g1-0')}`);
      ok(r.intro.kicker.includes('New grammar') && r.intro.ex, 'pattern card'); ok(r.passed, 'not passed'); ok(r.grammar > 0, 'grammar answers not counted'); ok(r.srs, 'patterns not scheduled for review');
    });
    await test('grammar Challenge (fill in, word order, listening) can be passed and unlocks the next unit', async () => {
      const r = await main.run(`const gi=UNITS.findIndex(u=>u.id==='g1-0');for(const s of [1,2,3]){T.start(gi,s);const res=await T.lesson();if(!res.passed)return {fail:s};T.click('#action')}
        T.click('#levels [data-sec="1"]');return {passed:P.units['g1-0']>0,next:!document.querySelectorAll('#path details.unit.grammar')[1].classList.contains('locked'),task:P.tasks.includes('t-grammar')}`);
      eq(r, {passed: true, next: true, task: true}, 'grammar unit');
    });

    group('Smart review'); await fresh();
    await test('due items show a Smart review card; finishing it pushes them to later days', async () => {
      const r = await main.run(`show('learn');T.click('#levels [data-sec="0"]');const day=dayKey();for(const k of Object.keys(P.srs).slice(0,6))P.srs[k].due=day;render();const due=dueKeys(P).length;
        const slip=!!document.querySelector('[data-smart]');T.click('[data-smart]');const smart=L.meta.smart,n=L.total;const res=await T.lesson();T.click('#action');
        return {due,slip,smart,n,passed:res.passed,after:dueKeys(P).length,smartDone:P.totals.smart,task:P.tasks.includes('t-smart'),later:Object.values(P.srs).every(s=>s.due>day||s.iv===0)}`);
      ok(r.due >= 6 && r.slip, 'no Smart review card'); ok(r.smart, 'not a Smart review'); ok(r.n === Math.min(15, r.due), 'questions: ' + r.n); ok(r.passed, 'not passed');
      ok(r.after < r.due, `still due: ${r.after} of ${r.due}`); eq(r.smartDone, 1, 'smart reviews'); ok(r.task, 'task not claimed');
    });

    group('Words: sheet, speaking, My words'); await fresh();
    await test('tapping a word opens its sheet and plays it; Save adds it to My words and to review', async () => {
      const r = await main.run(`show('vocab');const h=P.stats['사랑']?.heard||0;T.click('#vList [data-word="사랑"]');const open=$('wordSheet').open,word=$('wsWord').textContent;
        T.click('#wsSave');const saved=inNotebook('사랑'),srs=!!P.srs['사랑'];const heard=(P.stats['사랑']?.heard||0)-h;return {open,word,saved,srs,heard}`);
      eq(r, {open: true, word: '사랑', saved: true, srs: true, heard: 1}, 'word sheet');
    });
    await test('Say it: records from the microphone and draws both sound shapes', async () => {
      const r = await main.run(`await T.until(()=>nativeBuf,8000,'native audio');const n=P.totals.recordings||0;T.click('#wsRec');await T.until(()=>!$('wsMine').disabled,12000,'recording to finish');
        await T.until(()=>mineBuf,4000,'decoded');return {count:(P.totals.recordings||0)-n,both:!$('wsBoth').disabled,len:$('wsLen').textContent,task:P.tasks.includes('t-speak')}`);
      eq(r.count, 1, 'recordings'); ok(r.both, 'compare button'); ok(/Native .* s · You .* s/.test(r.len), 'lengths: ' + r.len); ok(r.task, 'task not claimed');
      await main.run(`T.click('#wsClose');return true`);
    });
    await test('My words: add your own word, it is listed, searchable and due for review; remove works', async () => {
      const r = await main.run(`T.click('[data-vtab=mine]');$('awKo').value='고구마';$('awEn').value='sweet potato';$('addWord').requestSubmit();
        const listed=$('vList').textContent.includes('고구마'),due=dueKeys(P).includes('고구마'),bad=(()=>{$('awKo').value='abc';$('awEn').value='x';$('addWord').requestSubmit();return !inNotebook('abc')})();
        T.click('#vList [data-word="고구마"]');const kicker=$('wsKicker').textContent;T.click('#wsSave');const gone=!inNotebook('고구마')&&!P.srs['고구마'];T.click('[data-vtab=all]');
        return {listed,due,bad,kicker,gone,closed:!$('wordSheet').open}`);
      eq(r, {listed: true, due: true, bad: true, kicker: 'My words', gone: true, closed: true}, 'my words');
    });

    group('Write: stroke order and typing'); await fresh();
    await test('stroke order: tracing the template scores 100%, a wrong shape scores low', async () => {
      const r = await main.run(`show('write');T.click('[data-wtab=trace]');$('wSel').value=0;$('wSel').dispatchEvent(new Event('change'));myStrokes=STROKES['ㄱ'].map(s=>s.map(p=>[...p]));T.click('#wCheck');const good=$('wScore').textContent;
        myStrokes=STROKES['ㅡ'].map(s=>s.map(p=>[...p]));T.click('#wCheck');const bad=$('wScore').textContent;T.click('#wOrder');await T.sleep(900);return {good,bad,best:P.bestStroke,task:P.tasks.includes('t-stroke')}`);
      ok(r.good.startsWith('100%'), 'trace: ' + r.good); ok(parseInt(r.bad) < 50, 'wrong shape: ' + r.bad); eq(r.best, 100, 'best score'); ok(r.task, 'task not claimed');
    });
    await test('typing: real key presses (2-beolsik) build the word; the next key is highlighted', async () => {
      const r = await main.run(`T.click('[data-wtab=type]');TY.word={ch:'한국어',meaning:'Korean',say:'한국어'};TY.keys=[];tRender();
        const code=j=>Object.keys(KEY_JAMO).find(c=>KEY_JAMO[c]===j);const hint=document.querySelector('#tKb .key.next')?.dataset.code;const d0=TY.done;
        for(const j of keysFor('한국어'))document.dispatchEvent(new KeyboardEvent('keydown',{code:code(j),bubbles:true}));
        return {hint,box:composeJamo(TY.keys),done:TY.done-d0,acc:$('tAcc').textContent}`);
      eq(r, {hint: 'KeyG', box: '한국어', done: 1, acc: '100%'}, 'typing');
    });

    group('Practice test and stats'); await fresh();
    await test('TOPIK 1 practice test: 20 questions, all right = 100%, recorded with areas', async () => {
      const r = await main.run(`show('test');T.click('[data-tlevel="1"]');const n=TS.qs.length;for(let i=0;i<n;i++){const q=TS.qs[i];T.click([...document.querySelectorAll('[data-tv]')].find(b=>b.dataset.tv===q.answer));T.click('#tqNext')}
        const t=P.tests[P.tests.length-1];return {n,score:t.score,areas:Object.keys(t.areas).sort(),big:document.querySelector('.score-big').textContent,task:P.tasks.includes('t-test')&&P.tasks.includes('t-test80')}`);
      eq(r.n, 20, 'questions'); eq(r.score, 20, 'score'); eq(r.areas, ['grammar', 'listening', 'reading', 'vocab'], 'areas'); eq(r.big, '100%', 'result'); ok(r.task, 'test tasks not claimed');
    });
    await test('wrong test answers go to Review mistakes; Stop test asks first', async () => {
      const r = await main.run(`T.click('[data-tagain]');const before=Object.keys(P.mistakes).length;for(let i=0;i<TS.qs.length;i++){const q=TS.qs[i];T.click([...document.querySelectorAll('[data-tv]')].find(b=>b.dataset.tv!==q.answer));T.click('#tqNext')}
        const p=document.querySelector('.score-big').textContent,wrong=document.querySelectorAll('.wrong-list div').length;T.click('[data-tagain]');T.click('#tqQuit');await T.sleep(50);const asked=$('ask').open;T.click('#askOk');await T.sleep(100);
        return {p,wrong,more:Object.keys(P.mistakes).length>before,asked,picker:!!document.querySelector('[data-tlevel]')}`);
      eq(r, {p: '0%', wrong: 20, more: true, asked: true, picker: true}, 'wrong answers');
    });
    await test('Stats page: tiles, 26-week calendar, weekly XP and level bars', async () => {
      const r = await main.run(`show('stats');return {tiles:document.querySelectorAll('#statsBody .tiles div').length,heat:document.querySelectorAll('.heat i').length,weeks:document.querySelector('.bars').children.length,levels:document.querySelectorAll('.hbars div').length,today:document.querySelector('.heat i:not(.future):last-of-type')?.title||''}`);
      ok(r.tiles >= 8, 'tiles'); eq(r.heat, 182, 'calendar days'); eq(r.weeks, 12, 'weeks'); ok(r.levels >= 7, 'levels');
    });

    group('Practice page'); await fresh();
    await test('Numbers: a right answer is +1 XP and counted; a wrong one shows the answer; Listen mode plays it', async () => {
      const r = await main.run(`show('practice');T.click('[data-ptab=num]');T.click('[data-chip=numType][data-v=time]');const kick=DQ.kicker;
        const xp=P.xp,d0=todayStats(P).drill||0,r0=P.drills?.num?.right||0;T.click('[data-dopt="'+DQ.answer+'"]');
        const good={xp:P.xp-xp,drill:(todayStats(P).drill||0)-d0,right:P.drills.num.right-r0,fb:document.querySelector('.drill-fb').textContent.startsWith('Right')};
        T.click('[data-dnext]');const ans=DQ.opts[DQ.answer];T.click('[data-dopt="'+((DQ.answer+1)%DQ.opts.length)+'"]');const bad=document.querySelector('.drill-fb').textContent.includes(ans);
        T.click('[data-chip=numMode][data-v=listen]');const listen={digits:DQ.opts.every(o=>/^\\d+:\\d\\d$/.test(o)),hear:!!document.querySelector('[data-dsay]'),said:/[가-힣]/.test(DQ.say)};
        T.click('[data-chip=numMode][data-v=read]');T.click('[data-chip=numType][data-v=all]');return {kick,good,bad,listen,n:DQ.opts.length}`);
      eq(r, {kick: 'Time', good: {xp: 1, drill: 1, right: 1, fb: true}, bad: true, listen: {digits: true, hear: true, said: true}, n: 4}, 'numbers');
    });
    await test('Verbs: the options include the right ending; keys 1-4 answer and Enter goes on', async () => {
      const r = await main.run(`T.click('[data-ptab=verb]');T.click('[data-chip=verbForm][data-v=past]');const q=DQ,right=q.opts[q.answer]===conj(q.big,'past');
        T.key(String(q.answer+1));const answered=q.picked===q.answer;T.key('Enter');return {right,answered,next:DQ!==q&&DQ.picked==null,form:DQ.kicker.startsWith('Past'),distinct:new Set(DQ.opts).size===DQ.opts.length}`);
      eq(r, {right: true, answered: true, next: true, form: true, distinct: true}, 'verbs');
    });
    await test('Sounds: rule cards with examples; Quiz asks how a word is said', async () => {
      const r = await main.run(`T.click('[data-ptab=sound]');const rules=document.querySelectorAll('.rule').length,ex=document.querySelectorAll('.rx[data-say]').length;
        T.click('[data-squiz=tense]');const q=DQ,ok=q.opts.every(o=>/^\\[.+\\]$/.test(o))&&q.kicker.includes('경음화');T.click('[data-dopt="'+q.answer+'"]');const right=P.drills.sound.right>0;T.click('[data-squiz=""]');
        return {rules,ex:ex>=35,ok,right,back:!!document.querySelector('.rule')}`);
      eq(r, {rules: 7, ex: true, ok: true, right: true, back: true}, 'sounds');
    });
    await test('Reading: a story shows its lines, words and glossary; all answers right marks it read (+5 XP, task)', async () => {
      const r = await main.run(`T.click('[data-ptab=read]');const cards=document.querySelectorAll('[data-story]').length;T.click('[data-story=family]');
        T.click('[data-sline="0"]');const one=document.querySelectorAll('.sent.open').length;T.click('[data-sen]');const all=document.querySelectorAll('.sent.open').length;
        const words=[...document.querySelectorAll('.wc[data-word]')].map(b=>b.dataset.word),gloss=document.querySelectorAll('.wc[data-gloss]').length;
        T.click('[data-sall]');await T.until(()=>sQueue.on&&sAudio.src.includes('audio/'),3000,'Hear all');T.click('[data-sall]');
        const s=STORIES.find(x=>x.id==='family');s.qs.forEach(([,,a],i)=>T.click('[data-sq="'+i+'"][data-so="'+a+'"]'));const xp=P.xp;T.click('[data-scheck]');
        const g=document.querySelector('.wc[data-gloss]').dataset.gloss;T.click('.wc[data-gloss]');const saved=inNotebook(g);removeFromNotebook(g);save();T.click('[data-story=""]');
        return {cards,one,all,yes:words.includes('네'),family:words.includes('가족'),gloss:gloss>=3,best:P.stories.family.best,xp:P.xp-xp===5+(TASKS.find(t=>t.id==='t-story').xp),task:P.tasks.includes('t-story'),saved,done:!!document.querySelector('[data-story=family] .story-done')}`);
      eq(r, {cards: 14, one: 1, all: 6, yes: false, family: true, gloss: true, best: 2, xp: true, task: true, saved: true, done: true}, 'story');
    });
    await test('Particles: the right form for the noun; a wrong answer goes to Mistakes and leaves when answered right', async () => {
      const r = await main.run(`show('practice');T.click('[data-ptab=part]');const q=DQ,[noun,k]=q.ref.split('|');const right=q.opts[q.answer]===withParticle(noun,k)&&q.opts.includes(wrongParticle(noun,k));
        T.click('[data-dopt="'+((q.answer+1)%q.opts.length)+'"]');const saved=missList('part').includes(q.ref),chip=!!document.querySelector('[data-miss]');T.click('[data-miss]');
        const again=DQ.ref===q.ref&&PX.miss,c0=P.totals.missCleared||0;T.click('[data-dopt="'+DQ.answer+'"]');const gone=!missList('part').includes(q.ref);
        return {right,saved,chip,again,gone,cleared:(P.totals.missCleared||0)-c0>=(missList('part').length?0:1)}`);
      eq(r, {right: true, saved: true, chip: true, again: true, gone: true, cleared: true}, 'particles');
    });
    await test('Verbs: casual and honorific endings; Slowly plays at 0.7×', async () => {
      const r = await main.run(`T.click('[data-ptab=verb]');T.click('[data-chip=verbForm][data-v=honor]');const h=DQ.opts[DQ.answer]===conj(DQ.big,'honor')&&DQ.kicker.startsWith('Honorific');
        T.click('[data-chip=verbForm][data-v=casual]');const c=DQ.opts[DQ.answer]===conj(DQ.big,'casual');T.click('[data-dopt="'+DQ.answer+'"]');T.click('[data-dslow]');const slow=player.playbackRate;
        T.click('[data-slow]');const chip=PX.slow;T.click('[data-slow]');T.click('[data-chip=verbForm][data-v=all]');return {h,c,slow,chip}`);
      eq(r, {h: true, c: true, slow: 0.7, chip: true}, 'verb endings');
    });
    await test('Talk: role-play a conversation; the app speaks the other part, you record yours; finishing counts', async () => {
      const r = await main.run(`T.click('[data-ptab=talk]');const cards=document.querySelectorAll('[data-talk]').length;T.click('[data-talk=order]');T.click('[data-role=B]');T.click('[data-tstart]');
        const d=DIALOGUES.find(x=>x.id==='order'),xp=P.xp,rec0=P.totals.recordings||0;let recorded=false;
        while(TK.i<d.lines.length){
          await T.until(()=>TK.i>=d.lines.length||d.lines[TK.i][0]==='B',15000,'your turn');if(TK.i>=d.lines.length)break;
          if(!recorded){T.click('[data-trec]');await T.until(()=>TK.urls[TK.i]&&!TK.rec,15000,'recording');recorded=true}
          T.click('[data-tnext]');await T.sleep(50);
        }
        await T.sleep(100);return {cards,done:P.talks.order>=1,recs:(P.totals.recordings||0)-rec0,xp:P.xp-xp>=5,task:P.tasks.includes('t-talk'),end:document.querySelector('.talk-bar').textContent.includes('done')}`);
      eq(r, {cards: 8, done: true, recs: 1, xp: true, task: true, end: true}, 'talk');
      await main.run(`T.click('[data-talk=""]');return true`);
    });
    await test('My words: import a CSV / Anki word list (HTML stripped, duplicates skipped)', async () => {
      const file = path.join(os.tmpdir(), 'hangul-e2e-words.csv'); fs.writeFileSync(file, '#separator:tab\n고구마\tsweet potato\n"<b>참외</b>","Korean melon"\nno hangul,here\n고구마,again\n');
      await main.run(`show('vocab');T.click('[data-vtab=mine]');return true`);
      const objectId = (await main.send('Runtime.evaluate', {expression: `document.getElementById('importWords')`})).result.result.objectId;
      await main.send('DOM.setFileInputFiles', {files: [file], objectId}); fs.rmSync(file, {force: true});
      const r = await waitFor(() => main.run(`return inNotebook('참외')&&{a:P.notebook.find(w=>w.ch==='고구마')?.meaning,b:P.notebook.find(w=>w.ch==='참외')?.meaning,row:!$('importRow').hidden}`), 4000, 'imported');
      await main.run(`removeFromNotebook('고구마');removeFromNotebook('참외');save();T.click('[data-vtab=all]');return true`);
      eq(r, {a: 'sweet potato', b: 'Korean melon', row: true}, 'imported words');
    });
    await test('Stats shows the Practice card; a backup with broken stats/days is refused or cleaned', async () => {
      const r = await main.run(`show('stats');const card=[...document.querySelectorAll('.chart-card h3')].some(h=>h.textContent.startsWith('Practice page'));
        const base={app:'hangul-learner',progress:{...P,stats:null}},bad=cleanBackup(base)===null,clean=cleanBackup({app:'hangul-learner',progress:{...P,days:{'2026-01-01':'5','x':1,'2026-01-02':'abc'}}});
        return {card,bad,days:clean.days}`);
      eq(r, {card: true, bad: true, days: {'2026-01-01': 5}}, 'stats and backup');
    });
    await test('every practice answer and story line has a recorded clip', async () => {
      const d = require(path.join(ROOT, 'ui', 'data.js')); require(path.join(ROOT, 'ui', 'practice-data.js'));
      const missing = d.RECORDED.filter(t => !fs.existsSync(path.join(ROOT, 'ui', 'audio', d.audioName(t))));
      eq(missing.slice(0, 5), [], missing.length + ' clips missing');
    });
    await test('Write › Listen: type the word you hear; it is revealed and counted', async () => {
      const r = await main.run(`show('write');T.click('[data-wtab=dict]');const hidden=$('tWord').textContent==='？'&&TY.dict&&!$('wType').hidden;
        const w=TY.word.ch,n=P.totals.dictation||0,code=j=>Object.keys(KEY_JAMO).find(c=>KEY_JAMO[c]===j)||Object.keys(SHIFT_JAMO).find(c=>SHIFT_JAMO[c]===j);
        const glow=document.querySelectorAll('#tKb .key.next').length;
        for(const j of keysFor(w))document.dispatchEvent(new KeyboardEvent('keydown',{code:j===' '?'Space':code(j),shiftKey:!KEY_JAMO[code(j)]||KEY_JAMO[code(j)]!==j,bubbles:true}));
        return {hidden,glow,shown:$('tWord').textContent===w,counted:P.totals.dictation-n}`);
      eq(r, {hidden: true, glow: 0, shown: true, counted: 1}, 'dictation');
      await main.run(`T.click('[data-wtab=trace]');return true`);
    });

    group('Settings and desktop'); await fresh();
    await test('gear button opens Settings; Esc closes it', async () => {
      const r = await main.run(`T.click('[data-settings]');const open=$('settings').open;$('settings').close();return {open,closed:!$('settings').open}`);
      eq(r, {open: true, closed: true}, 'settings');
    });
    await test('Start with Windows adds and removes the sign-in entry (with --minimized)', async () => {
      autoWas = await main.run(`return __TAURI__.core.invoke('autostart',{on:null})`);
      await main.run(`T.click('[data-settings]');await T.sleep(300);if($('autoSw').getAttribute('aria-checked')==='true'){T.click('#autoSw');await T.sleep(400)}T.click('#autoSw');await T.sleep(500);return true`);
      const on = win('runkey'); ok(on && /--minimized/.test(on.value), 'registry entry: ' + JSON.stringify(on));
      ok(await main.run(`return $('autoSw').getAttribute('aria-checked')==='true'`), 'switch not on');
      await main.run(`T.click('#autoSw');await T.sleep(500);$('settings').close();return true`);
      eq(win('runkey'), null, 'entry removed');
    });
    await test('global shortcuts: Ctrl+Alt+P toggles the mini player, Ctrl+Alt+K opens the app', async () => {
      ok(await main.run(`return $('keyMsg').textContent===''`), 'shortcut registration failed: ' + await main.run(`return $('keyMsg').textContent`));
      win('hotkey', 'p'); await waitFor(() => visible(MINI), 4000, 'mini after Ctrl+Alt+P');
      win('hotkey', 'p'); await waitFor(() => !visible(MINI), 4000, 'mini hidden after Ctrl+Alt+P');
      win('close', MAIN); await waitFor(() => !visible(MAIN), 4000, 'hidden');
      win('hotkey', 'k'); await waitFor(() => visible(MAIN), 4000, 'main after Ctrl+Alt+K');
    });
    await test('daily reminder: opens the mini player with a reminder; Start begins the review', async () => {
      await main.run(`P.days[dayKey()]=0;const r=reminder();r.on=true;r.time='00:00';r.last='';saveReminder(r);for(const k of Object.keys(P.srs).slice(0,3))P.srs[k].due=dayKey();return checkReminder()`);
      await waitFor(() => visible(MINI), 5000, 'mini window');
      const b = await waitFor(() => mini.run(`return !document.getElementById('remind').hidden&&document.getElementById('rmBody').textContent`), 4000, 'reminder banner');
      ok(/to review|goal/.test(b), 'banner: ' + b);
      ok(!(await main.run(`return checkReminder()`)), 'reminded twice in one day');
      await mini.run(`document.getElementById('rmGo').click();return true`);
      await waitFor(() => main.run(`return !!L&&L.meta.smart`), 4000, 'Smart review started');
      await main.run(`$('ask').close();closeLesson();const r=reminder();r.on=false;saveReminder(r);return true`);
      await mini.run(`document.getElementById('close').click();return true`);
    });
    await test('word of the day: "Show one now" sends a Windows notification; the daily check runs once a day', async () => {
      const r = await main.run(`T.click('[data-settings]');T.click('#wotdTry');await T.until(()=>$('wotdMsg').textContent,5000,'sent');const msg=$('wotdMsg').textContent;
        lsSet('wotd',{on:true,time:'00:00',last:''});const first=await checkWotd(),second=await checkWotd();lsSet('wotd',null);renderWotd();$('settings').close();return {msg,first,second,note:sentNotes[0]?.title||''}`);
      ok(r.msg.startsWith('Sent: '), 'notification: ' + r.msg); eq([r.first, r.second], [true, false], 'once a day'); ok(r.note.startsWith('오늘의 단어'), 'notification title: ' + r.note);
    });
    await test('backup: Export writes a file, Import restores it after asking', async () => {
      const r = await main.run(`T.click('[data-settings]');T.click('#exportBtn');await T.until(()=>lastExport,5000,'export');return {path:lastExport,xp:P.xp}`);
      ok(fs.existsSync(r.path), 'no file at ' + r.path); exported.push(r.path);
      const saved = JSON.parse(fs.readFileSync(r.path, 'utf8')); eq(saved.app, 'hangul-learner', 'file format'); eq(saved.progress.xp, r.xp, 'xp in file');
      await main.run(`P.xp=1;save();return true`);
      const objectId = (await main.send('Runtime.evaluate', {expression: `document.getElementById('importFile')`})).result.result.objectId;
      const set = await main.send('DOM.setFileInputFiles', {files: [r.path], objectId}); ok(!set.error, 'file chooser: ' + JSON.stringify(set.error));
      await waitFor(() => main.run(`return $('ask').open`), 4000, 'import confirmation').catch(async e => { throw new Error(e.message + ' · ' + await main.run(`return $('backupMsg').textContent`)) });
      await main.run(`T.click('#askOk');return true`);
      await waitFor(() => main.run(`return P.xp===${r.xp}`), 4000, 'progress restored');
      await main.run(`$('settings').close();return true`);
    });

    group('Listen: feeds');
    await test('Podcasts and YouTube tabs switch', async () => {
      const r = await main.run(`show('listen');T.click('[data-ltab=yt]');const yt=document.querySelectorAll('#lBody .show').length;T.click('[data-ltab=pod]');return {yt,pod:document.querySelectorAll('#lBody .show').length}`);
      eq(r, {yt: 5, pod: 6}, 'show cards');
    });
    for (const kind of ['pod', 'yt']) {
      const list = await main.run(`return ${kind === 'pod' ? 'PODCASTS' : 'CHANNELS'}.map(s=>[s.id,s.name])`);
      for (const [id, name] of list) await test(`${kind === 'pod' ? 'podcast' : 'YouTube'} "${name}" loads and lists episodes`, async () => {
        const r = await main.run(`LV={tab:'${kind}',open:'${id}',err:'',loading:false};renderListen();await T.until(()=>feeds['${id}']||LV.err,40000,'feed');
          renderListen();const it=feeds['${id}']?.items||[];return {err:LV.err,n:it.length,rows:document.querySelectorAll('#lBody .ep,#lBody .vid').length,sorted:it.every((e,i)=>!i||it[i-1].date>=e.date),newest:it[0]?.date}`);
        if (kind === 'yt' && /video list is down/.test(r.err)) throw new Error('SKIP: YouTube feed and its player list are both down right now');
        ok(!r.err, r.err); ok(r.n > 0, 'no episodes'); eq(r.rows, r.n, 'rows shown'); ok(r.sorted, 'not newest first');
      });
    }
    await test('opening a show always downloads the newest list, even when a saved copy exists', async () => {
      // the real list is put back if the download fails, so a slow feed server cannot break the player tests after this one
      const r = await main.run(`const old={at:Date.now()-86400e3,about:'old copy',items:[{title:'OLD SAVED EPISODE',date:1,url:'https://example.com/old.mp3',dur:''}]};
        window.__real=feeds.ttmik;feeds.ttmik=old;localStorage.setItem('feed:ttmik',JSON.stringify(old));LV={tab:'pod',open:null,err:'',loading:false,fetched:null};renderListen();T.click('#lBody [data-show=ttmik]');
        const instant=$('lBody').textContent.includes('OLD SAVED EPISODE'),checking=$('lBody').textContent.includes('Checking for new episodes');
        await T.until(()=>!LV.loading,70000,'download').catch(e=>{if(feeds.ttmik===old){feeds.ttmik=__real;localStorage.setItem('feed:ttmik',JSON.stringify(__real))}throw e});const f=feeds.ttmik;
        return {instant,checking,fresh:Date.now()-f.at<60000,replaced:f.items[0].title!=='OLD SAVED EPISODE',shown:!$('lBody').textContent.includes('OLD SAVED EPISODE'),status:document.querySelector('.feed-status').textContent,saved:JSON.parse(localStorage.getItem('feed:ttmik')).at===f.at}`);
      ok(r.instant, 'saved list not shown while checking'); ok(r.checking, 'no "Checking for new episodes"'); ok(r.fresh && r.replaced && r.shown, 'old list was not replaced by the downloaded one');
      ok(r.status.startsWith('Updated just now'), 'status: ' + r.status); ok(r.saved, 'new list not saved');
    });
    await test('Refresh and returning to the Listen page check again', async () => {
      const r = await main.run(`const a=feeds.ttmik.at;await T.sleep(1100);T.click('#lBody [data-refresh]');const busy=!!LV.loading;await T.until(()=>!LV.loading,70000);const b=feeds.ttmik.at;
        show('learn');await T.sleep(1100);T.click('.nav-item[data-tab=listen]');const busy2=!!LV.loading;await T.until(()=>!LV.loading,70000);return {busy,refreshed:b>a,busy2,again:feeds.ttmik.at>b}`);
      eq(r, {busy: true, refreshed: true, busy2: true, again: true}, 'refresh');
    });
    await test('offline: the saved list stays, with "Couldn’t check" and Try again', async () => {
      const r = await main.run(`const url=PODCASTS[0].feed;PODCASTS[0].feed='https://invalid.example.invalid/rss';T.click('#lBody [data-refresh]');await T.until(()=>!LV.loading,30000);
        const t=$('lBody').textContent,eps=document.querySelectorAll('#lBody .ep').length;PODCASTS[0].feed=url;const retry=!!document.querySelector('#lBody [data-refresh]');
        T.click('#lBody [data-refresh]');await T.until(()=>!LV.loading,70000);return {t,eps,retry,ok:!LV.err}`);
      ok(r.t.includes('Couldn’t check for new episodes') && r.t.includes('Showing the last saved list'), 'message: ' + r.t.slice(0, 200)); ok(r.eps > 0, 'saved episodes not shown'); ok(r.retry, 'no Try again'); ok(r.ok, 'Try again did not recover');
    });
    await test('a broken feed shows "Couldn’t load" with Try again', async () => {
      const r = await main.run(`PODCASTS.push({id:'broken',name:'Broken',level:'',seal:'?',color:'',feed:'https://invalid.example.invalid/rss'});LV={tab:'pod',open:'broken',err:'',loading:false};renderListen();
        await T.until(()=>LV.err,30000,'error');const t=$('lBody').textContent,retry=!!document.querySelector('#lBody [data-refresh]');PODCASTS.pop();LV={tab:'pod',open:null,err:'',loading:false};renderListen();return {t,retry}`);
      ok(r.t.includes('Couldn’t load'), 'no error text'); ok(r.retry, 'no Try again');
    });
    await test('app refuses non-https links (fetch and open)', async () => {
      const r = await main.run(`const f=await __TAURI__.core.invoke('fetch_text',{url:'http://example.com'}).then(()=>'allowed',e=>String(e));const o=await __TAURI__.core.invoke('open_external',{url:'file:///C:/Windows'}).then(()=>'allowed',e=>String(e));return {f,o}`);
      ok(r.f.includes('only https'), 'fetch: ' + r.f); ok(r.o.includes('only https'), 'open: ' + r.o);
    });

    // video tests use a channel whose feed loads right now (prefer one with full-length videos)
    const YT = await main.run(`for(const c of CHANNELS)if(feeds[c.id]?.items.filter(v=>!v.short).length>=2)return c.id;for(const c of CHANNELS)if(feeds[c.id]?.items.length>=2)return c.id;return null`);
    const needYT = () => { if (!YT) throw new Error('SKIP: no YouTube channel feed loads right now (YouTube service problem)') };
    group('Listen: player'); await fresh();
    await test('podcast episode plays; dock shows it; media keys get the title', async () => {
      const r = await main.run(`LV={tab:'pod',open:'ttmik',err:'',loading:false};renderListen();await T.until(()=>feeds.ttmik,30000);renderListen();T.click('#lBody [data-ep="0"]');T.mute();
        await T.until(()=>PL.playing()&&pod.currentTime>0.5,30000,'playback');return {dock:!$('dock').hidden,title:$('dTitle').textContent,ep:feeds.ttmik.items[0].title,ms:navigator.mediaSession?.metadata?.title,btn:$('dPlay').getAttribute('aria-label')}`);
      ok(r.dock, 'dock hidden'); eq(r.title, r.ep, 'dock title'); ok(r.ms == null || r.ms === r.ep, 'media session title: ' + r.ms); eq(r.btn, 'Pause', 'play button');
    });
    await test('dock: pause/play, back 15 s, forward 30 s, speed, seek', async () => {
      const r = await main.run(`T.click('#dPlay');await T.sleep(200);const paused=pod.paused;T.click('#dPlay');await T.until(()=>!pod.paused,5000);
        pod.currentTime=100;await T.sleep(300);T.click('#dBack');const back=pod.currentTime;T.click('#dFwd');const fwd=pod.currentTime;
        const rates=[];for(let i=0;i<4;i++){T.click('#dRate');rates.push(pod.playbackRate)}
        const s=$('dSeek');s.value=500;s.dispatchEvent(new Event('input'));s.dispatchEvent(new Event('change'));await T.sleep(300);const half=pod.currentTime/pod.duration;return {paused,back,fwd,rates,half}`);
      ok(r.paused, 'pause'); ok(r.back > 83 && r.back < 88, 'back 15 s: ' + r.back); ok(r.fwd - r.back > 29 && r.fwd - r.back < 31, 'forward 30 s'); eq(r.rates, [1.25, 1.5, 0.75, 1], 'speeds'); ok(r.half > 0.45 && r.half < 0.55, 'seek to middle: ' + r.half);
    });
    await test('listening time counts toward quests and the listening task', async () => {
      const r = await main.run(`const d=todayStats(P),a=d.podcastSec,b=P.totals.listenSec;P.totals.listenSec=Math.max(b,299);await T.sleep(2500);save();return {day:d.podcastSec-a,task:P.tasks.includes('t-podcast')}`);
      ok(r.day >= 2, 'daily listening not counted'); ok(r.task, 'task "Listen for 5 minutes" not claimed');
    });
    await test('starting a lesson pauses the podcast', async () => {
      const r = await main.run(`const was=PL.playing();T.start(0,0);const now=pod.paused;$('ask').close();closeLesson();show('listen');T.click('#dPlay');await T.until(()=>!pod.paused,5000);return {was,now}`);
      eq(r, {was: true, now: true}, 'pause on lesson');
    });
    await test('YouTube video plays inside the app and replaces the podcast', async () => {
      needYT();
      const r = await main.run(`LV={tab:'yt',open:'${YT}',err:'',loading:false};renderListen();await T.until(()=>feeds['${YT}'],30000);renderListen();T.click('#lBody [data-vid="0"]');
        await T.until(()=>yt?.getPlayerState?.()===1,30000,'video to play');T.mute();return {podPaused:pod.paused,box:!$('ytWrap').hidden,blocked:!$('ytNote').hidden,dock:$('dTitle').textContent===NP.title&&NP.kind==='yt'}`);
      eq(r, {podPaused: true, box: true, blocked: false, dock: true}, 'youtube');
    });
    await test('YouTube: dock pause/play and +30 s control the video', async () => {
      needYT();
      const r = await main.run(`T.click('#dPlay');await T.until(()=>yt.getPlayerState()===2,5000,'pause');T.click('#dPlay');await T.until(()=>yt.getPlayerState()===1,8000,'play');const t=yt.getCurrentTime();T.click('#dFwd');await T.sleep(800);return yt.getCurrentTime()-t`);
      ok(r > 25, 'forward did not move the video: ' + r);
    });
    await test('switching back to a podcast stops the video', async () => {
      needYT();
      const r = await main.run(`LV={tab:'pod',open:'ttmik',err:'',loading:false};renderListen();T.click('#lBody [data-ep="1"]');T.mute();await T.until(()=>PL.playing(),30000,'podcast');
        await T.until(()=>yt.getPlayerState()!==1,5000,'video to stop').catch(()=>{});const a=yt.getCurrentTime();await T.sleep(1500);return {yt:yt.getPlayerState(),moved:yt.getCurrentTime()-a,kind:NP.kind}`);
      ok(r.yt !== 1 && r.moved < 0.5, `video still playing (state ${r.yt}, moved ${r.moved.toFixed(2)} s)`); eq(r.kind, 'pod', 'now playing kind');
    });

    group('Mini player'); await fresh();
    await main.run(`LV={tab:'pod',open:'ttmik',err:'',loading:false};renderListen();await T.until(()=>feeds.ttmik,30000);renderListen();T.click('#lBody [data-ep="0"]');T.mute();await T.until(()=>PL.playing(),30000,'podcast');return true`);
    await test('dock button opens the mini window at the bottom-right', async () => {
      await main.run(`T.click('#dMini');return true`); await waitFor(() => visible(MINI), 5000, 'mini window');
      const s = win('state', MINI), wa = win('workarea');
      ok(s.rect[2] <= wa[2] && s.rect[3] <= wa[3] && s.rect[0] > wa[2] / 2 && s.rect[1] > wa[3] / 2, 'not bottom-right: ' + s.rect);
    });
    await test('mini window shows what is playing and the time, in sync', async () => {
      const want = await main.run(`return NP.title`);
      const r = await waitFor(() => mini.run(`return document.getElementById('title').textContent===${JSON.stringify(want)}&&!document.getElementById('np').hidden&&document.getElementById('time').textContent`), 5000, 'mini now playing');
      ok(/\d+:\d\d/.test(r), 'no time shown');
    });
    await test('mini controls: pause, play, back, forward', async () => {
      const c = id => mini.run(`document.getElementById('${id}').click();return true`);
      await c('play'); await waitFor(() => main.run(`return pod.paused`), 4000, 'pause from mini');
      await c('play'); await waitFor(() => main.run(`return !pod.paused`), 4000, 'play from mini');
      await main.run(`pod.currentTime=200;return true`); await sleep(300);
      await c('back'); const b = await waitFor(() => main.run(`return pod.currentTime<195&&pod.currentTime`), 4000, 'back 15 s').catch(() => -1);
      await c('fwd'); const f = await waitFor(() => main.run(`return pod.currentTime>${b + 25}&&pod.currentTime`), 4000, 'forward 30 s').catch(() => -1);
      ok(b > 183 && b < 189, 'back: ' + b); ok(f - b > 28, 'forward: ' + (f - b));
    });
    await test('word card: tap reveals the meaning, Next shows another word from your level', async () => {
      await main.run(`window.__srs=P.srs;P.srs={};P.section=4;epKey=NP?(NP.url||NP.id):'';epList=[];update();return true`); await sleep(600); // no episode or due words: level words
      const r = await mini.run(`const ko=document.getElementById('wKo').textContent,hidden=!document.getElementById('wMean').classList.contains('show');document.getElementById('face').click();
        const shown=document.getElementById('wMean').classList.contains('show');document.getElementById('next').click();const ko2=document.getElementById('wKo').textContent;
        const lvl=VOCAB.find(w=>w.ch===ko2)?.section;return {hidden,shown,changed:ko!==ko2,lvl,again:!document.getElementById('wMean').classList.contains('show')}`);
      eq(r, {hidden: true, shown: true, changed: true, lvl: 4, again: true}, 'word card');
      await main.run(`P.srs={...__srs,'사과':{u:'words2',iv:1,ease:2.3,due:dayKey()}};epKey=NP?(NP.url||NP.id):'';epList=[];update();return true`);
      const due = await waitFor(() => mini.run(`return document.getElementById('kick').textContent.includes('due')&&document.getElementById('wKo').textContent`), 3000, 'due words in the word card');
      ok(await main.run(`return dueKeys(P).includes(${JSON.stringify(due)})`), 'word card shows a word that is not due: ' + due);
    });
    await test('word card shows words from the playing episode first; episode lists count them', async () => {
      const want = await main.run(`const it=feeds[NP.src].items.find(i=>i.url===NP.url);it.desc='오늘은 학교에서 친구를 만났어요.';epKey='';update();
        LV={tab:'pod',open:NP.src,err:'',loading:false,fetched:NP.src};renderListen();return {words:itemWords(it).map(w=>w.ch),chip:!!document.querySelector('#lBody .ep.now .wchip')}`);
      ok(want.words.includes('학교') && want.words.includes('친구'), 'words found: ' + want.words); ok(want.chip, 'no word count on the playing episode');
      const w = await waitFor(() => mini.run(`return document.getElementById('kick').textContent.includes('this episode')&&document.getElementById('wKo').textContent`), 3000, 'episode words in the word card');
      ok(want.words.includes(w), `word card shows ${w}, not an episode word`);
    });
    await test('hearing a word quietly ducks the podcast, then restores it', async () => {
      await mini.run(`document.getElementById('say').click();return true`);
      const d = await waitFor(() => main.run(`return pod.volume<0.5&&pod.volume`), 3000, 'duck'); await sleep(2300);
      const back = await main.run(`return pod.volume`); ok(d < 0.5, 'not ducked'); eq(back, 1, 'volume restored');
    });
    await test('mini "open app" shows the main window; × hides the mini window', async () => {
      await main.run(`return __TAURI__.core.invoke('toggle_mini').then(()=>__TAURI__.core.invoke('toggle_mini')).then(()=>true)`);
      win('close', MAIN); await waitFor(() => !visible(MAIN), 4000, 'main hidden');
      await mini.run(`document.getElementById('open').click();return true`); await waitFor(() => visible(MAIN), 4000, 'main shown');
      await mini.run(`document.getElementById('close').click();return true`); await waitFor(() => !visible(MINI), 4000, 'mini hidden');
    });
    await test('closing the mini window (Alt+F4 / WM_CLOSE) only hides it', async () => {
      await main.run(`T.click('#dMini');return true`); await waitFor(() => visible(MINI), 4000, 'mini shown');
      win('close', MINI); await waitFor(() => !visible(MINI), 4000, 'mini hidden'); ok(appPid(), 'app quit');
    });
    await test('mini idle state; "Choose a podcast" opens Listen in the app', async () => {
      await main.run(`stopAll();show('learn');return true`); await main.run(`T.click('#lMini');return true`);
      await waitFor(() => mini.run(`return !document.getElementById('idle').hidden`), 4000, 'idle');
      await mini.run(`document.getElementById('pick').click();return true`);
      await waitFor(() => main.run(`return view==='listen'`), 4000, 'Listen page'); ok(visible(MAIN), 'main hidden');
      await mini.run(`document.getElementById('close').click();return true`);
    });

    group('Focus timer, shadowing, copied Korean'); await fresh();
    await test('focus timer: start from the mini player; it shows the time; work ends in a break with a banner; Skip break; stop', async () => {
      await main.run(`T.click('#lMini');return true`); await waitFor(() => visible(MINI), 4000, 'mini');
      await mini.run(`document.getElementById('focus').click();return true`);
      await waitFor(() => main.run(`return FO?.phase==='work'`), 4000, 'focus started');
      const lbl = await waitFor(() => mini.run(`const t=document.getElementById('hlabel').textContent;return t.includes('집중')&&t`), 4000, 'timer in the mini player');
      ok(/\d+:\d\d/.test(lbl), 'no time: ' + lbl); ok(await main.run(`return $('lFocus').textContent.includes('Stop')`), 'Listen page button');
      const n = await main.run(`const n=P.totals.focus||0;FO.end=Date.now()-1;return n`);
      await waitFor(() => main.run(`return FO?.phase==='break'`), 4000, 'break');
      const b = await waitFor(() => mini.run(`return !document.getElementById('remind').hidden&&document.getElementById('rmTitle').textContent+'|'+document.getElementById('rmGo').textContent`), 4000, 'break banner');
      eq(b, 'Break time|Skip break', 'banner'); eq(await main.run(`return P.totals.focus`), n + 1, 'sessions');
      await mini.run(`document.getElementById('rmGo').click();return true`); await waitFor(() => main.run(`return FO?.phase==='work'`), 4000, 'back to work');
      await mini.run(`document.getElementById('focus').click();return true`); await waitFor(() => main.run(`return FO===null`), 4000, 'stopped');
      await waitFor(() => mini.run(`return document.getElementById('hlabel').textContent==='mini player'`), 4000, 'label back');
    });
    await test('☆ on the mini word card saves the word to My words; again removes it', async () => {
      const w = await mini.run(`return cur.ch`), was = await main.run(`return inNotebook(${JSON.stringify(w)})`); // an earlier test may have saved it
      await mini.run(`document.getElementById('star').click();return true`);
      await waitFor(() => main.run(`return inNotebook(${JSON.stringify(w)})!==${was}`), 4000, was ? 'removed' : 'saved');
      await mini.run(`document.getElementById('star').click();return true`);
      await waitFor(() => main.run(`return inNotebook(${JSON.stringify(w)})===${was}`), 4000, 'toggled back');
      await mini.run(`document.getElementById('close').click();return true`);
    });
    await test('shadowing: replays the last 5 s and pauses; Next moves on; Record me records you (fake mic)', async () => {
      const r = await main.run(`show('listen');LV={tab:'pod',open:'ttmik',err:'',loading:false};renderListen();await T.until(()=>feeds.ttmik,30000);renderListen();T.click('#lBody [data-ep="0"]');T.mute();
        await T.until(()=>PL.playing()&&pod.duration>90,30000,'podcast');pod.currentTime=60;await T.sleep(400);T.click('#dShadow');const seg=[SH.a,SH.b];
        await T.until(()=>pod.paused,12000,'pause after the piece');const end=pod.currentTime;T.click('#shNext');const next=SH.a;await T.until(()=>pod.paused&&pod.currentTime>next+3,12000,'next piece');
        const n=P.totals.shadow||0;T.click('#shRec');await T.until(()=>!$('shMine').disabled,15000,'recording');const rec=P.totals.shadow-n;
        T.click('#shClose');return {a:seg[0],b:seg[1],end,next,rec,task:P.tasks.includes('t-shadow'),closed:$('shadow').hidden&&!SH}`);
      ok(r.b - r.a > 4.5 && r.b - r.a < 5.5 && r.b > 59 && r.b < 62, 'piece: ' + r.a + '–' + r.b); ok(Math.abs(r.end - r.b) < 1, 'stopped at ' + r.end);
      ok(Math.abs(r.next - r.b) < 0.1, 'next piece starts at ' + r.next); eq(r.rec, 1, 'recordings'); ok(r.task, 'task'); ok(r.closed, 'closed');
    });
    await test('words in copied Korean: copying Korean in any app shows its words in the mini player (only while on)', async () => {
      clipSaved = win('clipsave') === true;
      await main.run(`stopAll();if(!clipOn())T.click('#clipSw');return true`);
      // a clipboard holding an image or files is left alone: then the copied text is sent the way the Rust watcher sends it
      if (clipSaved) win('clipset', Buffer.from('오늘 학교에서 친구를 만났어요.').toString('base64'));
      else await main.run(`await __TAURI__.event.emitTo('main','clip','오늘 학교에서 친구를 만났어요.');return true`);
      await waitFor(() => visible(MINI), 5000, 'mini opens');
      const w = await waitFor(() => mini.run(`return document.getElementById('kick').textContent.includes('copied')&&document.getElementById('wKo').textContent`), 4000, 'copied words');
      ok(['오늘', '학교', '친구'].includes(w), 'word: ' + w);
      await main.run(`T.click('#clipSw');return true`); await mini.run(`document.getElementById('close').click();return true`); await waitFor(() => !visible(MINI), 4000, 'mini hidden');
      if (clipSaved) win('clipset', Buffer.from('사과를 먹어요').toString('base64')); else await main.run(`await __TAURI__.event.emitTo('main','clip','사과를 먹어요');return true`); await sleep(1500);
      ok(!visible(MINI) && await main.run(`return clipWords().length===0`), 'reacted while off');
      if (clipSaved) { win('cliprestore'); clipSaved = false } else console.log('    (clipboard holds an image: tested without the clipboard watcher)');
    });

    group('Mini player: YouTube video'); await fresh();
    const miniH = () => { const s = win('state', MINI); return s.rect[3] - s.rect[1] };
    await test('opening the mini player moves a playing video into it, at the same second', async () => {
      needYT();
      await main.run(`show('listen');LV={tab:'yt',open:'${YT}',err:'',loading:false};renderListen();await T.until(()=>feeds['${YT}'],30000);renderListen();const long=feeds['${YT}'].items.map((v,i)=>[v,i]).filter(([v])=>!v.short).map(([,i])=>i);window.__long=long.length?long:[0,1]; // full-length videos, not Shorts
        T.click('#lBody [data-vid="'+__long[0]+'"]');await T.until(()=>yt?.getPlayerState?.()===1,30000,'video');T.mute();return true`);
      const t0 = await main.run(`await T.until(()=>yt.getDuration()>0,10000,'duration');yt.seekTo(Math.min(60,yt.getDuration()/2),true);await T.sleep(1500);return {t:yt.getCurrentTime(),d:yt.getDuration()}`);
      await main.run(`T.click('#dMini');return true`); await waitFor(() => visible(MINI), 5000, 'mini window');
      const r = await waitFor(() => mini.run(`if(vp?.getPlayerState?.()===1){vp.mute();return {t:vp.getCurrentTime(),panel:!document.getElementById('video').hidden}}return false`), 30000, 'video playing in the mini player');
      const m = await main.run(`return {local:yt.getPlayerState(),remote:!!remote,playing:PL.playing(),note:!$('ytMini').hidden,wrap:$('ytWrap').hidden}`);
      ok(r.panel, 'video panel hidden'); ok(Math.abs(r.t - t0.t) < 6 && t0.t > 5, `mini started at ${r.t.toFixed(1)} s, main was at ${t0.t.toFixed(1)} s (video ${t0.d.toFixed(0)} s long)`);
      ok(m.local !== 1, 'main window still playing it'); ok(m.remote && m.playing, 'dock not following the mini player'); ok(m.note && m.wrap, 'main page should say "Playing in the mini player"');
      const s = win('state', MINI), wa = win('workarea'); ok(miniH() > 400, 'mini player did not grow: ' + miniH()); ok(s.rect[3] <= wa[3], 'mini player went below the screen');
    });
    await test('mini player buttons and the main dock both control the video in the mini player', async () => {
      needYT();
      await mini.run(`document.getElementById('play').click();return true`);
      await waitFor(() => mini.run(`return vp.getPlayerState()===2`), 5000, 'pause from the mini player');
      await waitFor(() => main.run(`return !PL.playing()`), 4000, 'dock shows paused');
      await main.run(`T.click('#dPlay');return true`);
      await waitFor(() => mini.run(`return vp.getPlayerState()===1`), 8000, 'play from the dock');
      const t = await mini.run(`return vp.getCurrentTime()`);
      await main.run(`T.click('#dFwd');return true`);
      await waitFor(() => mini.run(`return vp.getCurrentTime()>${t + 25}`), 6000, 'forward 30 s from the dock');
    });
    await test('closing the mini player moves the video back to the main window at the same second', async () => {
      needYT();
      const t = await mini.run(`return vp.getCurrentTime()`);
      await mini.run(`document.getElementById('close').click();return true`); await waitFor(() => !visible(MINI), 4000, 'mini hidden');
      const r = await waitFor(() => main.run(`return !remote&&yt.getPlayerState()===1&&{t:yt.getCurrentTime()}`), 15000, 'video playing in the main window again');
      ok(Math.abs(r.t - t) < 6, `resumed at ${r.t.toFixed(1)} s, mini player was at ${t.toFixed(1)} s`);
      const m = await mini.run(`return {gone:document.getElementById('video').hidden,state:vp.getPlayerState()}`);
      ok(m.gone, 'video panel still shown'); ok(m.state !== 1, 'mini player still playing'); ok(miniH() < 400, 'mini player did not shrink: ' + miniH());
    });
    await test('a video started while the mini player is open plays straight in it', async () => {
      needYT();
      await main.run(`T.click('#dMini');return true`); await waitFor(() => visible(MINI), 4000, 'mini window');
      await waitFor(() => mini.run(`return vp.getPlayerState()===1`), 20000, 'hand-over');
      const id = await main.run(`T.click('#lBody [data-vid="'+(__long[1]??(__long[0]===0?1:0))+'"]');return NP.id`);
      await waitFor(() => mini.run(`return vp.getVideoData?.().video_id===${JSON.stringify(id)}&&vp.getPlayerState()===1`), 20000, 'new video in the mini player');
      ok(await main.run(`return yt.getPlayerState()!==1&&!!remote`), 'main window played it too');
    });
    await test('playing a podcast removes the video panel and shrinks the mini player', async () => {
      needYT();
      await main.run(`LV={tab:'pod',open:'ttmik',err:'',loading:false};renderListen();await T.until(()=>feeds.ttmik,30000);renderListen();T.click('#lBody [data-ep="0"]');T.mute();await T.until(()=>PL.playing(),30000);return true`);
      await waitFor(() => mini.run(`return document.getElementById('video').hidden&&vp.getPlayerState()!==1`), 5000, 'video panel removed');
      await sleep(500); ok(miniH() < 400, 'mini player did not shrink: ' + miniH());
      await main.run(`stopAll();return true`); await mini.run(`document.getElementById('close').click();return true`); await waitFor(() => !visible(MINI), 4000, 'mini hidden');
    });

    group('Sync, word families, voices, reading test'); await fresh();
    await test('vocabulary search understands romanization (hakgyo -> 학교)', async () => {
      eq(await main.run(`$('vSearch').value='hakgyo';renderVocab();const a=$('vList').textContent.includes('학교');$('vSearch').value='gamsahamnida';renderVocab();const b=$('vList').textContent.includes('감사합니다');$('vSearch').value='';renderVocab();return [a,b]`), [true, true], 'found');
    });
    await test('word card shows Hanja word families; tapping a relative opens it in the same card', async () => {
      const r = await main.run(`T.mute();openWord('학생');const fam=[...$('wsFam').querySelectorAll('.fam b span')].map(s=>s.textContent).join('');
        $('wsFam').querySelector('[data-word="학교"]').click();await T.sleep(200);const r={fam,now:$('wsWord').textContent,open:$('wordSheet').open,cur:$('wsFam').querySelector('[aria-current]')?.textContent};closeSheet();return r`);
      eq(r, {fam: '學生', now: '학교', open: true, cur: '학교'}, 'families');
    });
    await test('conversations: the second speaker uses the male voice; Konglish words are recorded', async () => {
      const r = await main.run(`T.mute();const ok=await Promise.all(['m-'+audioName('큰 사이즈로 주세요.'),audioName('화이팅'),audioName('리모컨')].map(f=>fetch('audio/'+f).then(r=>r.ok)));
        sayLine(['B','큰 사이즈로 주세요.']);const b=sAudio.src.includes('/m-');sayLine(['A','어서 오세요. 뭐 드릴까요?']);const a=!sAudio.src.includes('/m-');sAudio.pause();return {ok,a,b}`);
      eq(r, {ok: [true, true, true], a: true, b: true}, 'voices');
    });
    await test('practice test: TOPIK levels end with a reading passage; Hangul basics stays plain', async () => {
      eq(await main.run(`const q=withReading(buildTest(1),1),r=q.filter(x=>x.area==='reading');return [q.length,r.length,!!r[0].passage&&q.at(-1).area,withReading(buildTest(5),5).some(x=>x.area==='reading'),withReading(buildTest(0),0).some(x=>x.area==='reading')]`), [20, 2, 'reading', true, false], 'test');
    });
    await test('focus timer alarm comes from the Rust side (not slowed in the tray)', async () => {
      ok(await main.run(`let got=0;const un=await __TAURI__.event.listen('alarm',()=>got++);await __TAURI__.core.invoke('alarm',{ms:300});await T.until(()=>got>0,3000,'alarm');un();return got>0`), 'no alarm');
    });
    await test('weekly report is on by default and sums the week; a notice dialog has no Cancel', async () => {
      const r = await main.run(`const w=weekReport(),p=ask({title:'x',text:'y',ok:'Got it',cancel:''}),h=$('askCancel').hidden;$('ask').close('ok');return {sw:$('weekSw').getAttribute('aria-checked'),t:w.title,h,ok:await p}`);
      eq(r, {sw: 'true', t: '이번 주 · Your week in Korean', h: true, ok: true}, 'weekly');
    });
    await test('sync: writes to the folder; when both PCs studied since the last sync, their progress is added together', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hangul-sync-')), file = path.join(dir, 'Hangul Learner', 'progress.json');
      try {
        await main.run(`lsSet('syncPath',${JSON.stringify(dir)});lsSet('syncOn',true);lsSet('syncBase',0);lsSet('syncSnap',null);renderSync();P.savedAt=0;await syncPull();return true`);
        ok(fs.existsSync(file), 'no sync file');
        const xp = await main.run(`P.xp+=1;save();return P.xp`); // a change on this PC that the other PC does not have
        const other = JSON.parse(fs.readFileSync(file, 'utf8')); other.progress.xp = xp - 1 + 1234; other.saved = Date.now() + 60000;
        fs.writeFileSync(file, JSON.stringify(other));
        const r = await main.run(`await T.until(()=>!syncBusy,5000);await syncPull();return {xp:P.xp,msg:$('syncMsg').textContent}`);
        eq(r.xp, xp + 1234, 'xp from both PCs (1 here + 1234 there)'); ok(r.msg.startsWith('Synced'), 'status: ' + r.msg);
        eq(JSON.parse(fs.readFileSync(file, 'utf8')).progress.xp, xp + 1234, 'merged copy written back');
      } finally {
        await main.run(`lsSet('syncOn',false);renderSync();return true`).catch(() => {});
        fs.rmSync(dir, {recursive: true, force: true});
      }
    });
    await test('voice clips are Opus (.ogg) and decode', async () => {
      ok(await main.run(`const b=await (await fetch('audio/'+audioName('학교'))).arrayBuffer();const a=await new AudioContext().decodeAudioData(b);return audioName('학교').endsWith('.ogg')&&a.duration>0.3`), 'clip did not decode');
    });
    await test('typing race: the clock starts with the first key; at 60 s the score and best are saved; Skip starts a new race', async () => {
      const r = await main.run(`T.mute();show('write');T.click('[data-wtab=race]');const box=!$('tRaceBox').hidden,left0=$('tLeft').textContent;
        for(const k of keysFor(TY.word.ch))tKey(k);await T.sleep(400);const done=TY.done,started=!!TY.start;
        TY.start-=61000;raceTick();const over={over:TY.over,best:P.raceBest>=1,word:$('tWord').textContent,races:P.totals.races>=1};
        T.click('#tSkip');const again=!TY.over&&TY.done===0&&!TY.start;T.click('[data-wtab=type]');const hidden=$('tRaceBox').hidden;return {box,left0,done,started,...over,again,hidden}`);
      eq(r, {box: true, left0: '60', done: 1, started: true, over: true, best: true, word: '1 word', races: true, again: true, hidden: true}, 'race');
    });
    await test('Stats: Smart review forecast shows the next 14 days, today first', async () => {
      const r = await main.run(`const k=dayKey();(P.srs??={})['__e2e']={u:'x',iv:1,ease:2.3,due:k};show('stats');const h=[...document.querySelectorAll('.chart-card h3')].find(h=>h.textContent==='Smart review forecast');
        const bars=h.parentElement.querySelector('.bars'),r={n:bars.children.length,first:bars.children[0].title.startsWith('Today'),x:h.parentElement.querySelector('.bar-x span').textContent};delete P.srs['__e2e'];return r`);
      eq(r, {n: 14, first: true, x: 'Today'}, 'forecast');
    });
    await test('pronunciation check: Windows listens; without the Korean speech pack it explains how to add it', async () => {
      const r = await main.run(`openWord('학교');T.click('#wsCheck');await T.until(()=>!$('wsCheck').disabled,15000,'check finished');const m=$('wsMsg').textContent;closeSheet();return m`);
      ok(/Korean speech pack|Recognised|heard|catch/.test(r), 'message: ' + r);
    });

    group('Rest days, text size, saved sentences, export, shortcuts'); await fresh();
    await test('weekly quests explain rest days', async () => {
      ok(/rest day.*You have \d/.test(await main.run(`show('quests');return $('restNote').textContent`)), 'rest day note');
    });
    await test('Korean text size zooms Korean text only', async () => {
      const r = await main.run(`show('vocab');$('koSize').value='1.3';$('koSize').dispatchEvent(new Event('change'));await T.sleep(100);
        const ko=getComputedStyle(document.querySelector('#vList [lang=ko],#vList .ko')||document.querySelector('[lang=ko]')).zoom,en=getComputedStyle($('vCount')).zoom;
        $('koSize').value='1';$('koSize').dispatchEvent(new Event('change'));return {ko,en,saved:lsGet('koSize',1)}`);
      eq([r.ko, r.en, r.saved], ['1.3', '1', 1], 'zoom');
    });
    await test('☆ next to a story sentence saves it to My words; again removes it', async () => {
      const r = await main.run(`show('practice');T.click('[data-ptab=read]');T.click('[data-story=family]');const s=STORIES.find(x=>x.id==='family').lines[0][0];
        T.click('[data-ssave=s0]');const saved=inNotebook(s),star=document.querySelector('[data-ssave=s0]').classList.contains('on');T.click('[data-ssave=s0]');
        const gone=!inNotebook(s);T.click('[data-story=""]');return {saved,star,gone}`);
      eq(r, {saved: true, star: true, gone: true}, 'sentence');
    });
    await test('Export My words writes a CSV (Korean,English) to Documents › Hangul Learner', async () => {
      const r = await main.run(`addToNotebook('학교','school, place');show('vocab');T.click('[data-vtab=mine]');T.click('#exportWords');await T.until(()=>$('exportMsg').textContent,5000,'export');
        removeFromNotebook('학교');save();return $('exportMsg').textContent`);
      ok(/words saved/.test(r), 'message: ' + r);
      const docs = path.join(os.homedir(), 'Documents', 'Hangul Learner'), f = fs.readdirSync(docs).filter(x => /^hangul-my-words-.*\.csv$/.test(x)).map(x => path.join(docs, x));
      ok(f.length, 'no csv'); ok(fs.readFileSync(f[0], 'utf8').includes('학교,"school, place"'), 'csv content'); f.forEach(x => exported.push(x));
    });
    await test('? opens the keyboard shortcut list; not while typing', async () => {
      const r = await main.run(`show('learn');document.dispatchEvent(new KeyboardEvent('keydown',{key:'?'}));const open=$('keysSheet').open,rows=document.querySelectorAll('#keysSheet .key-row').length;$('keysSheet').close();
        show('write');T.click('[data-wtab=type]');document.dispatchEvent(new KeyboardEvent('keydown',{key:'?'}));const typing=$('keysSheet').open;$('keysSheet').close();show('learn');return {open,rows:rows>=12,typing}`);
      eq(r, {open: true, rows: true, typing: false}, 'shortcuts');
    });
    await test('YouTube: when the feed fails, the list comes from YouTube’s player (ids) and oEmbed (titles)', async () => {
      const r = await main.run(`const items=await uploadsViaPlayer(CHANNELS[0]).catch(e=>String(e));return Array.isArray(items)?{n:items.length,titled:items.every(v=>v.title&&/^[\\w-]{11}$/.test(v.id))}:{err:items}`);
      if (r.err) throw new Error('SKIP: YouTube player list unavailable: ' + r.err);
      ok(r.n >= 5, 'videos: ' + r.n); ok(r.titled, 'titles');
    });

    group('Grammar reference, placement, tricky words, reminders, automatic backup'); await fresh();
    await test('Words › Grammar lists every pattern with examples; search finds by meaning', async () => {
      const r = await main.run(`show('vocab');T.click('[data-vtab=gram]');vSec=-1;$('vSearch').value='';renderVocab();const all=document.querySelectorAll('.gref-item').length,ex=document.querySelectorAll('.gref-ex[data-say]').length;
        $('vSearch').value='topic marker';renderVocab();const hit=$('vList').textContent.includes('은/는');$('vSearch').value='';T.click('[data-vtab=all]');return {all,n:GRAMMAR_ITEMS.length,ex:ex>=all*2,hit}`);
      eq(r.all, r.n, 'patterns shown'); ok(r.n >= 144, 'patterns: ' + r.n); ok(r.ex, 'examples'); ok(r.hit, 'search');
    });
    await test('placement test: passing a level moves to the next; the first level not passed becomes the starting level', async () => {
      const r = await main.run(`const sec=P.section;show('test');T.click('[data-tplace]');const first=TS.si,n=TS.qs.length;TS.picks=TS.qs.map(q=>q.answer);finishTest();const next=TS.si;
        TS.picks=[];finishTest();const r={first,n,next,done:TS.done,level:P.section,head:$('testBody').textContent.includes('TOPIK 1')};T.click('[data-tlevels]');P.section=sec;delete P.placed;save();return r`);
      eq(r, {first: 0, n: 8, next: 1, done: true, level: 1, head: true}, 'placement');
    });
    await test('Tricky words: a word missed 3+ times is drilled with a hint; answering counts for the word', async () => {
      const r = await main.run(`const old=P.stats['학교'];P.stats['학교']={heard:0,right:0,tries:4,written:0};show('practice');T.click('[data-ptab=tricky]');DQ=trickyQ('학교');renderPractice();
        const q={kind:DQ.kind,hint:DQ.sub.startsWith('Hint:')&&DQ.sub.includes('hakgyo'),opts:DQ.opts.length};T.click('[data-dopt="'+DQ.answer+'"]');const right=P.stats['학교'].right;
        if(old)P.stats['학교']=old;else delete P.stats['학교'];T.click('[data-ptab=num]');return {...q,right}`);
      eq(r, {kind: 'tricky', hint: true, opts: 4, right: 1}, 'tricky');
    });
    await test('review reminder: one evening notification when words are due and none reviewed today', async () => {
      const r = await main.run(`const k='__e2e';(P.srs??={})[k]={u:'x',iv:1,ease:2.3,due:'2000-01-01'};const s=todayStats(P).srs;todayStats(P).srs=0;lsSet('reviewSent',null);sentNotes.length=0;
        const ev=new Date();ev.setHours(19,0,0,0);const a=await checkReviewReminder(ev),b=await checkReviewReminder(ev);delete P.srs[k];todayStats(P).srs=s;lsSet('reviewSent',null);return {a,b,t:sentNotes[0]?.title||''}`);
      eq(r, {a: true, b: false, t: '복습 · Review time'}, 'reminder');
    });
    await test('automatic backup: once a week to Documents › Hangul Learner, keeping the last 4', async () => {
      ok(await main.run(`lsSet('autoBackupWeek','');return await autoBackup()&&!(await autoBackup())`), 'weekly backup');
      const docs = path.join(os.homedir(), 'Documents', 'Hangul Learner'), f = fs.readdirSync(docs).filter(x => x.startsWith('auto-backup-'));
      ok(f.length >= 1 && f.length <= 4, 'auto backups: ' + f.length);
      const mine = f.map(x => path.join(docs, x)).filter(p => Date.now() - fs.statSync(p).mtimeMs < 120000); mine.forEach(p => exported.push(p));
    });

    group('Tray and closing'); await fresh();
    await test('closing the main window hides it to the tray; audio keeps playing', async () => {
      await main.run(`LV={tab:'pod',open:'ttmik',err:'',loading:false};renderListen();T.click('#lBody [data-ep="0"]');T.mute();await T.until(()=>PL.playing()&&pod.currentTime>1,30000);return true`);
      win('close', MAIN); await waitFor(() => !visible(MAIN), 4000, 'main hidden'); ok(appPid(), 'app quit');
      const a = await main.run(`return pod.currentTime`); await sleep(3000); const b = await main.run(`return {t:pod.currentTime,paused:pod.paused}`);
      ok(!b.paused && b.t - a > 2, 'playback stopped while hidden');
    });
    await test('left-click on the tray icon shows the window', async () => {
      win('trayclick'); await waitFor(() => visible(MAIN), 4000, 'main shown');
    });
    await test('tray menu has: Open, Mini player, Play / pause, separator, Quit', async () => {
      eq(menu().map(i => i.text), ['Open Hangul Learner', 'Mini player', 'Play / pause', 'Focus timer', '', 'Quit'], 'menu items');
    });
    await test('tray menu "Play / pause" pauses and resumes', async () => {
      menuCmd('Play / pause'); await waitFor(() => main.run(`return pod.paused`), 4000, 'pause');
      menuCmd('Play / pause'); await waitFor(() => main.run(`return !pod.paused`), 4000, 'resume');
    });
    await test('tray menu "Mini player" opens and closes the mini window', async () => {
      menuCmd('Mini player'); await waitFor(() => visible(MINI), 4000, 'mini shown');
      menuCmd('Mini player'); await waitFor(() => !visible(MINI), 4000, 'mini hidden');
    });
    await test('tray menu "Focus timer" starts and stops the timer', async () => {
      menuCmd('Focus timer'); await waitFor(() => main.run(`return FO?.phase==='work'`), 4000, 'started');
      menuCmd('Focus timer'); await waitFor(() => main.run(`return FO===null`), 4000, 'stopped');
    });
    await test('tray menu "Open Hangul Learner" brings the hidden window back', async () => {
      win('close', MAIN); await waitFor(() => !visible(MAIN), 4000, 'hidden');
      menuCmd('Open Hangul Learner'); await waitFor(() => visible(MAIN), 4000, 'shown');
    });

    group('Saving and restart');
    let before;
    await test('tray menu "Quit" exits the app completely', async () => {
      before = await main.run(`setTheme('dark');pod.currentTime=123;pod.pause();await T.sleep(300);remember();save();await T.sleep(500);return {xp:P.xp,steps:Object.keys(P.steps).length,tasks:P.tasks.length,title:NP.title}`);
      menuCmd('Quit'); await waitExit();
    });
    await test('after restart: progress, theme and the paused episode are all back', async () => {
      await launch();
      const r = await main.run(`await T.until(()=>pod.duration>0,20000,'episode metadata');await T.sleep(300);return {xp:P.xp,steps:Object.keys(P.steps).length,tasks:P.tasks.length,theme:document.documentElement.dataset.theme,title:$('dTitle').textContent,dock:!$('dock').hidden,paused:pod.paused,t:pod.currentTime}`);
      eq(r.xp, before.xp, 'xp'); eq(r.steps, before.steps, 'steps'); eq(r.tasks, before.tasks, 'tasks'); eq(r.theme, 'dark', 'theme'); ok(r.dock, 'dock hidden'); eq(r.title, before.title, 'episode'); ok(r.paused, 'should be paused'); ok(Math.abs(r.t - 123) < 3, 'position ' + r.t);
    });
    await test('Reset progress: Cancel keeps everything, Erase starts fresh', async () => {
      const r = await main.run(`const xp=P.xp;T.click('#reset');await T.sleep(50);T.click('#askCancel');await T.sleep(100);const kept=P.xp===xp&&xp>0;T.click('#reset');await T.sleep(50);T.click('#askOk');await T.sleep(200);
        return {kept,xp:P.xp,toast:[...$('toasts').children].some(t=>t.textContent.includes('Progress erased'))}`);
      eq(r, {kept: true, xp: 0, toast: true}, 'reset');
    });
    await test('"Close to tray: off" makes the close button quit the app', async () => {
      const r = await main.run(`T.click('#trayToggle');return $('trayToggle').textContent`); eq(r, 'Close to tray: off', 'label');
      win('close', MAIN); await waitExit();
    });
    await test('the "off" setting is remembered after restart', async () => {
      await launch(); eq(await main.run(`return $('trayToggle').textContent`), 'Close to tray: off', 'label after restart');
    });
    await test('started with Windows (--minimized): runs in the tray without showing the window', async () => {
      await main.run(`T.click('#trayToggle');return true`); // back on, so closing keeps it in the tray
      menuCmd('Quit'); await waitExit();
      await launch(['--minimized']); await sleep(1500);
      ok(appPid(), 'not running'); ok(!visible(MAIN), 'window should stay hidden');
      win('trayclick'); await waitFor(() => visible(MAIN), 4000, 'window from the tray');
    });
  } catch (e) {
    console.log('\nStopped early: ' + e.message);
    results.push({section: 'setup', name: 'test run', ok: false, err: e.message});
  } finally {
    // put the user's settings and progress back
    try {
      if (appPid() && main && autoWas !== null) await main.run(`return __TAURI__.core.invoke('autostart',{on:${autoWas}})`).catch(() => {});
      if (appPid() && main && savedStorage !== null) { // only when the user's settings were captured
        await main.run(`localStorage.clear();for(const[k,v]of Object.entries(${savedStorage || '{}'}))localStorage.setItem(k,v);return true`);
        await sleep(300); win('traycmd', menu().find(i => i.text === 'Quit').id); await waitExit();
      }
    } catch (e) { console.log('cleanup: ' + e.message) }
    if (appPid()) { execFileSync('taskkill', ['/F', '/IM', 'hangul-learner.exe']); await sleep(1000) }
    if (clipSaved) try { win('cliprestore') } catch {}
    if (hadData) fs.copyFileSync(BACKUP, DATA); else fs.rmSync(DATA, {force: true});
    for (const f of exported) fs.rmSync(f, {force: true});
    const failed = results.filter(r => !r.ok), skipped = results.filter(r => r.skip);
    if (skipped.length) console.log(`\nSkipped (outside the app):\n${skipped.map(r => `  [${r.section}] ${r.name}: ${r.skip}`).join('\n')}`);
    console.log(`\n${results.length - failed.length - skipped.length}/${results.length - skipped.length} passed, ${skipped.length} skipped` + (failed.length ? `\nFailed:\n${failed.map(f => `  [${f.section}] ${f.name}: ${f.err}`).join('\n')}` : ''));
    console.log(hadData ? 'Your progress file was restored.' : 'No progress file existed before; none left behind.');
    process.exitCode = failed.length ? 1 : 0;
  }
})();
