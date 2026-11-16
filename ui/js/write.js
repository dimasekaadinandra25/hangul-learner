// ---- Write ----
const cv=$('wCanvas'),ctx=cv.getContext('2d');
// Sharp at 125-200% display scaling: both pads keep 340 drawing units, with devicePixelRatio pixels behind each unit
const PAD=340;
function sharpPads(){const d=devicePixelRatio||1;let changed=false;
  for(const c of[cv,$('wGuideCv')]){if(c.width===Math.round(PAD*d))continue;c.width=c.height=Math.round(PAD*d);c.getContext('2d').setTransform(d,0,0,d,0,0);changed=true}
  if(changed&&typeof drawGuide==='function')drawGuide()}
sharpPads();addEventListener('resize',sharpPads); // moving to another screen changes devicePixelRatio and fires resize
$('wSel').innerHTML=ALL.map((l,i)=>`<option value="${i}">${l.ch}  ${l.rom}</option>`).join('');
const cur=()=>ALL[+$('wSel').value];
let drawing=false,counted=false; // counted: this attempt already added to "written"
const clearPad=()=>{ctx.clearRect(0,0,PAD,PAD);counted=false};
const showLetter=()=>{$('wGhost').textContent=cur().ch;clearPad();render()};
$('wSel').onchange=showLetter;
$('wClear').onclick=clearPad;
$('wSay').onclick=()=>speak(cur().say);
$('wNext').onclick=()=>{$('wSel').value=(+$('wSel').value+1)%ALL.length;showLetter()};
$('wGuide').onclick=e=>{const g=$('wGhost');g.hidden=!g.hidden;e.currentTarget.textContent='Guide '+(g.hidden?'off':'on');e.currentTarget.setAttribute('aria-pressed',!g.hidden)};
const pos=e=>{const r=cv.getBoundingClientRect();return[(e.clientX-r.left)*PAD/r.width,(e.clientY-r.top)*PAD/r.height]};
cv.onpointerdown=e=>{
  drawing=true;cv.setPointerCapture(e.pointerId);
  Object.assign(ctx,{lineWidth:13,lineCap:'round',lineJoin:'round',strokeStyle:getComputedStyle(document.body).getPropertyValue('--ink').trim()});
  ctx.beginPath();ctx.moveTo(...pos(e));ctx.lineTo(...pos(e));ctx.stroke();
  if(!counted){counted=true;stat(cur().ch).written++;todayStats(P).written++;save()}
};
cv.onpointermove=e=>{if(!drawing)return;ctx.lineTo(...pos(e));ctx.stroke()};
cv.onpointerup=cv.onpointercancel=()=>drawing=false;
