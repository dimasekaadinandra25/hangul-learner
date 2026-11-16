// ---- Words ----
let vSec=-1,vTab='all'; // vSec -1 = all levels; vTab all | mine (My words)
function renderVocab(){
  const mine=vTab==='mine',saved=new Set((P.notebook||[]).map(w=>w.ch));
  $('vTabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.vtab===vTab));
  $('addWord').hidden=$('importRow').hidden=!mine;$('vLevels').hidden=mine;
  if(vTab==='gram')return renderGrammarRef();
  if(!mine)levelTabs($('vLevels'),'data-vsec',vSec,i=>`${i<0?VOCAB.length:VOCAB.filter(w=>w.section===i).length} words`,true);
  const q=$('vSearch').value.trim().toLowerCase(),qr=/^[a-z' -]{2,}$/.test(q)?q.replace(/[^a-z]/g,''):''; // romanized: saranghae, hakgyo
  const src=mine?(P.notebook||[]).map(w=>({ch:w.ch,meaning:w.meaning,section:-1,unit:'My words'})):VOCAB;
  const hits=src.filter(w=>(mine||vSec<0||w.section===vSec)&&(!q||w.ch.includes(q)||w.meaning.toLowerCase().includes(q)||qr&&romanize(w.ch).replace(/[^a-z]/g,'').startsWith(qr)));
  $('vCount').textContent=`${hits.length} word${hits.length===1?'':'s'}`;
  const groups={};for(const w of hits)(groups[mine?'':`${SECTIONS[w.section].title} · ${w.unit}`]??=[]).push(w);
  $('vList').innerHTML=Object.entries(groups).map(([g,ws])=>`${g?`<h2 class="section-title">${g}</h2>`:''}<div class="grid wide">${ws.map(w=>
    `<button class="card" data-word="${esc(w.ch)}">${saved.has(w.ch)&&!mine?`<span class="saved" title="In My words">${icon('star')}</span>`:''}${mastered(w.ch)?seal('완'):''}<b class="${long(w.ch)?'sm':''}">${esc(w.ch)}</b><small>${esc(w.meaning)}</small></button>`).join('')}</div>`).join('')
    ||(mine&&!q?'<p class="muted">No saved words yet. Add your own above, or open any word and tap “Save to My words”.</p>':'<p class="muted">No words match.</p>');
}
$('vSearch').oninput=renderVocab;
// Grammar reference (Words › Grammar): every pattern with meaning, how it attaches and examples you can hear.
// Uses the same search box and level tabs as the word list; searches pattern, meaning, notes and examples.
function renderGrammarRef(){
  levelTabs($('vLevels'),'data-vsec',vSec,i=>`${i<0?GRAMMAR_ITEMS.length:GRAMMAR_ITEMS.filter(g=>g.section===i).length} patterns`,true);
  const q=$('vSearch').value.trim().toLowerCase();
  const hits=GRAMMAR_ITEMS.filter(g=>(vSec<0||g.section===vSec)&&(!q||[g.ch,g.meaning,g.note,...g.ex.flat()].some(t=>t.toLowerCase().includes(q))));
  $('vCount').textContent=`${hits.length} pattern${hits.length===1?'':'s'}`;
  const groups={};for(const g of hits)(groups[`${SECTIONS[g.section].title} · ${g.unit}`]??=[]).push(g);
  $('vList').innerHTML=Object.entries(groups).map(([t,gs])=>`<h2 class="section-title">${t}</h2><div class="gref">${gs.map(g=>`<div class="panel gref-item"><div class="gref-head"><b class="ko" lang="ko">${esc(g.ch)}</b><span>${esc(g.meaning)}</span></div><small class="muted">${esc(g.note)}</small>
    ${g.ex.map(([ko,en])=>`<button class="gref-ex" data-say="${esc(ko)}" title="Hear it">${icon('volume')}<span><span class="ko" lang="ko">${esc(ko)}</span><small>${esc(en)}</small></span></button>`).join('')}</div>`).join('')}</div>`).join('')
    ||'<p class="muted">No patterns match.</p>';
}
$('vSearch').onchange=()=>{if($('vSearch').value.trim()){P.totals.searches++;save()}};
$('vTabs').onclick=e=>{const b=e.target.closest('[data-vtab]');if(b){vTab=b.dataset.vtab;renderVocab()}};
$('vLevels').onclick=e=>{const c=e.target.closest('[data-vsec]');if(c){vSec=+c.dataset.vsec;renderVocab()}};
