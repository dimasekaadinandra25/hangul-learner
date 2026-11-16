// ---- Letters ----
// The Letters page: the grid of all 40 letters, and the syllable builder (pick initial, vowel and final).
// Needs from earlier scripts: $, seal (icons.js); P, save, mastered (save.js); speak (sound.js);
// GROUPS, ALL, INIT, VOW, FIN, compose (data.js).
// Provides: renderLetters, fill, built, showBuilt.

function renderLetters() {
  const letterCard = letter => [
    `<button class="card${P.stats[letter.ch]?.heard ? ' seen' : ''}" data-say="${letter.say}" data-letter="${letter.ch}">`,
    `${mastered(letter.ch) ? seal('완') : ''}<b>${letter.ch}</b><small>${letter.rom}</small></button>`,
  ].join('');
  $('letterGrid').innerHTML = GROUPS.map(([title, letters]) => {
    return `<h2 class="section-title">${title}</h2><div class="grid">${letters.map(letterCard).join('')}</div>`;
  }).join('');
}
$('sTotal').textContent = ALL.length;

// Syllable builder: one <select> each for the initial consonant, the vowel and the final
const fill = (select, list) => {
  select.innerHTML = list.map((jamo, index) => `<option value="${index}">${jamo || '(none)'}</option>`).join('');
};
fill($('bInit'), INIT);
fill($('bVow'), VOW);
fill($('bFin'), FIN);
// start on 한
$('bInit').value = 18;
$('bVow').value = 0;
$('bFin').value = 4;
const built = () => compose(+$('bInit').value, +$('bVow').value, +$('bFin').value);
const showBuilt = () => {
  $('bOut').textContent = built();
};
['bInit', 'bVow', 'bFin'].forEach(id => {
  $(id).onchange = showBuilt;
});
showBuilt();
$('bSay').onclick = () => {
  speak(built());
  P.totals.built++;
  save();
};
