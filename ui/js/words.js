// ---- Words ----
// The Words page: every word by level (with search, also by romanization), the learner's own list (My words)
// and the grammar reference.
// Needs from earlier scripts: $, icon, seal, long (icons.js); P, save, mastered (save.js); levelTabs (path.js);
// VOCAB, GRAMMAR_ITEMS (content); SECTIONS (lesson.js); romanize (data.js). At call time: esc (listen.js).
// Provides: vSec, vTab, renderVocab, renderGrammarRef.

let vSec = -1; // -1 = all levels
let vTab = 'all'; // all | mine (My words) | gram (grammar reference)

// Draw the word list for the current tab, level and search
function renderVocab() {
  const mine = vTab === 'mine';
  const saved = new Set((P.notebook || []).map(word => word.ch));
  $('vTabs').querySelectorAll('button').forEach(button => {
    button.setAttribute('aria-pressed', button.dataset.vtab === vTab);
  });
  $('addWord').hidden = $('importRow').hidden = !mine;
  $('vLevels').hidden = mine;
  if (vTab === 'gram') return renderGrammarRef();
  if (!mine) {
    levelTabs($('vLevels'), 'data-vsec', vSec, levelIndex => {
      const count = levelIndex < 0 ? VOCAB.length : VOCAB.filter(word => word.section === levelIndex).length;
      return `${count} words`;
    }, true);
  }

  const query = $('vSearch').value.trim().toLowerCase();
  // romanized: saranghae, hakgyo
  const romanQuery = /^[a-z' -]{2,}$/.test(query) ? query.replace(/[^a-z]/g, '') : '';
  let source = VOCAB;
  if (mine) source = (P.notebook || []).map(word => ({ch: word.ch, meaning: word.meaning, section: -1, unit: 'My words'}));
  const matchesSearch = word => !query
    || word.ch.includes(query)
    || word.meaning.toLowerCase().includes(query)
    || romanQuery && romanize(word.ch).replace(/[^a-z]/g, '').startsWith(romanQuery);
  const hits = source.filter(word => (mine || vSec < 0 || word.section === vSec) && matchesSearch(word));
  $('vCount').textContent = `${hits.length} word${hits.length === 1 ? '' : 's'}`;

  // group by level and unit (My words is one group without a heading)
  const groups = {};
  for (const word of hits) {
    const groupName = mine ? '' : `${SECTIONS[word.section].title} · ${word.unit}`;
    (groups[groupName] ??= []).push(word);
  }
  const cardHtml = word => {
    const savedStar = saved.has(word.ch) && !mine ? `<span class="saved" title="In My words">${icon('star')}</span>` : '';
    return [
      `<button class="card" data-word="${esc(word.ch)}">${savedStar}${mastered(word.ch) ? seal('완') : ''}`,
      `<b class="${long(word.ch) ? 'sm' : ''}">${esc(word.ch)}</b><small>${esc(word.meaning)}</small></button>`,
    ].join('');
  };
  const listHtml = Object.entries(groups).map(([groupName, words]) => {
    const heading = groupName ? `<h2 class="section-title">${groupName}</h2>` : '';
    return `${heading}<div class="grid wide">${words.map(cardHtml).join('')}</div>`;
  }).join('');
  let emptyHtml = '<p class="muted">No words match.</p>';
  if (mine && !query) {
    emptyHtml = '<p class="muted">No saved words yet. Add your own above, or open any word and tap “Save to My words”.</p>';
  }
  $('vList').innerHTML = listHtml || emptyHtml;
}
$('vSearch').oninput = renderVocab;

// Grammar reference (Words › Grammar): every pattern with meaning, how it attaches and examples you can hear.
// Uses the same search box and level tabs as the word list; searches pattern, meaning, notes and examples.
function renderGrammarRef() {
  levelTabs($('vLevels'), 'data-vsec', vSec, levelIndex => {
    const count = levelIndex < 0 ? GRAMMAR_ITEMS.length : GRAMMAR_ITEMS.filter(g => g.section === levelIndex).length;
    return `${count} patterns`;
  }, true);
  const query = $('vSearch').value.trim().toLowerCase();
  const matchesSearch = g => !query
    || [g.ch, g.meaning, g.note, ...g.ex.flat()].some(text => text.toLowerCase().includes(query));
  const hits = GRAMMAR_ITEMS.filter(g => (vSec < 0 || g.section === vSec) && matchesSearch(g));
  $('vCount').textContent = `${hits.length} pattern${hits.length === 1 ? '' : 's'}`;

  const groups = {};
  for (const g of hits) (groups[`${SECTIONS[g.section].title} · ${g.unit}`] ??= []).push(g);
  const exampleHtml = ([ko, en]) => [
    `<button class="gref-ex" data-say="${esc(ko)}" title="Hear it">${icon('volume')}`,
    `<span><span class="ko" lang="ko">${esc(ko)}</span><small>${esc(en)}</small></span></button>`,
  ].join('');
  const patternHtml = g => [
    '<div class="panel gref-item">',
    `<div class="gref-head"><b class="ko" lang="ko">${esc(g.ch)}</b><span>${esc(g.meaning)}</span></div>`,
    `<small class="muted">${esc(g.note)}</small>`,
    `\n    ${g.ex.map(exampleHtml).join('')}</div>`,
  ].join('');
  const listHtml = Object.entries(groups).map(([groupName, patterns]) => {
    return `<h2 class="section-title">${groupName}</h2><div class="gref">${patterns.map(patternHtml).join('')}</div>`;
  }).join('');
  $('vList').innerHTML = listHtml || '<p class="muted">No patterns match.</p>';
}

// count a search once it is done (on change), not on every key
$('vSearch').onchange = () => {
  if ($('vSearch').value.trim()) {
    P.totals.searches++;
    save();
  }
};
$('vTabs').onclick = e => {
  const tab = e.target.closest('[data-vtab]');
  if (tab) {
    vTab = tab.dataset.vtab;
    renderVocab();
  }
};
$('vLevels').onclick = e => {
  const levelTab = e.target.closest('[data-vsec]');
  if (levelTab) {
    vSec = +levelTab.dataset.vsec;
    renderVocab();
  }
};
