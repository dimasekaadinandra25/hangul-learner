// ---- Write ----
// The Write page's free drawing pad: pick a letter, show its guide, draw it with the mouse, pen or finger.
// (Stroke-order tracing on the same page lives in practice.js, which also uses cv and PAD.)
// Needs from earlier scripts: $ (icons.js); P, save, stat (save.js); speak (sound.js); todayStats (lesson.js);
// ALL (data.js); render (views.js). At call time: drawGuide (practice.js).
// Provides: cv, ctx, PAD, sharpPads, cur, drawing, counted, clearPad, showLetter, pos.

const cv = $('wCanvas');
const ctx = cv.getContext('2d');
// Sharp at 125-200% display scaling: both pads keep 340 drawing units, with devicePixelRatio pixels behind each unit
const PAD = 340;
function sharpPads() {
  const pixelRatio = devicePixelRatio || 1;
  let changed = false;
  for (const canvas of [cv, $('wGuideCv')]) {
    if (canvas.width === Math.round(PAD * pixelRatio)) continue;
    canvas.width = canvas.height = Math.round(PAD * pixelRatio);
    canvas.getContext('2d').setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    changed = true;
  }
  if (changed && typeof drawGuide === 'function') drawGuide();
}
sharpPads();
addEventListener('resize', sharpPads); // moving to another screen changes devicePixelRatio and fires resize

$('wSel').innerHTML = ALL.map((letter, index) => `<option value="${index}">${letter.ch}  ${letter.rom}</option>`).join('');
// The letter picked in the Write page's select
const cur = () => ALL[+$('wSel').value];
let drawing = false;
let counted = false; // counted: this attempt already added to "written"
const clearPad = () => {
  ctx.clearRect(0, 0, PAD, PAD);
  counted = false;
};
const showLetter = () => {
  $('wGhost').textContent = cur().ch;
  clearPad();
  render();
};
$('wSel').onchange = showLetter;
$('wClear').onclick = clearPad;
$('wSay').onclick = () => speak(cur().say);
$('wNext').onclick = () => {
  $('wSel').value = (+$('wSel').value + 1) % ALL.length;
  showLetter();
};
$('wGuide').onclick = e => {
  const ghost = $('wGhost');
  ghost.hidden = !ghost.hidden;
  e.currentTarget.textContent = 'Guide ' + (ghost.hidden ? 'off' : 'on');
  e.currentTarget.setAttribute('aria-pressed', !ghost.hidden);
};

// Pointer position in pad drawing units (0..PAD), whatever size the canvas is shown at
const pos = e => {
  const rect = cv.getBoundingClientRect();
  return [(e.clientX - rect.left) * PAD / rect.width, (e.clientY - rect.top) * PAD / rect.height];
};
cv.onpointerdown = e => {
  drawing = true;
  cv.setPointerCapture(e.pointerId);
  Object.assign(ctx, {
    lineWidth: 13,
    lineCap: 'round',
    lineJoin: 'round',
    strokeStyle: getComputedStyle(document.body).getPropertyValue('--ink').trim(),
  });
  // a dot right away, so a tap shows up too
  ctx.beginPath();
  ctx.moveTo(...pos(e));
  ctx.lineTo(...pos(e));
  ctx.stroke();
  if (!counted) {
    counted = true;
    stat(cur().ch).written++;
    todayStats(P).written++;
    save();
  }
};
cv.onpointermove = e => {
  if (!drawing) return;
  ctx.lineTo(...pos(e));
  ctx.stroke();
};
cv.onpointerup = cv.onpointercancel = () => (drawing = false);
