// ---- Letters ----
function renderLetters(){
  $('letterGrid').innerHTML=GROUPS.map(([t,items])=>`<h2 class="section-title">${t}</h2><div class="grid">${items.map(l=>
    `<button class="card${P.stats[l.ch]?.heard?' seen':''}" data-say="${l.say}" data-letter="${l.ch}">${mastered(l.ch)?seal('완'):''}<b>${l.ch}</b><small>${l.rom}</small></button>`).join('')}</div>`).join('');
}
$('sTotal').textContent=ALL.length;
const fill=(sel,list)=>sel.innerHTML=list.map((x,i)=>`<option value="${i}">${x||'(none)'}</option>`).join('');
fill($('bInit'),INIT);fill($('bVow'),VOW);fill($('bFin'),FIN);
$('bInit').value=18;$('bVow').value=0;$('bFin').value=4; // 한
const built=()=>compose(+$('bInit').value,+$('bVow').value,+$('bFin').value);
const showBuilt=()=>{const s=built();$('bOut').textContent=s};
['bInit','bVow','bFin'].forEach(id=>$(id).onchange=showBuilt);showBuilt();
$('bSay').onclick=()=>{speak(built());P.totals.built++;save()};
