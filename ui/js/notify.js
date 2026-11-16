// ---- Notifications ----
const KINDS={
  quest:{label:'Daily quest complete',seal:'gold',icon:'check'},
  weekly:{label:'Weekly quest complete',seal:'gold',icon:'star'},
  task:{label:'Task complete',seal:'jade',icon:'check'},
  stamp:{label:'New stamp',seal:'',icon:'award'},
  unlock:{label:'Unlocked',seal:'jade',icon:'arrow'},
  sync:{label:'Welcome back',seal:'gold',icon:'gift'},
};
function pushInbox(kind,title,body,ic){P.inbox.unshift({kind,title,body,ic,at:Date.now()});P.inbox.length=Math.min(P.inbox.length,40)}
function toast(kind,title,body,ic){
  const k=KINDS[kind],box=$('toasts');
  while(box.children.length>=4)box.firstChild.remove();
  const t=document.createElement('div');t.className=`toast k-${kind}`;t.setAttribute('role','status');
  t.innerHTML=`${seal(icon(ic||k.icon),'m',k.seal)}<div class="t-body"><small>${k.label}</small><b>${title}</b>${body?`<span>${body}</span>`:''}</div>
    <button class="t-x" aria-label="Dismiss">${icon('x')}</button><i class="t-timer"></i>`;
  const close=()=>{if(t.classList.contains('out'))return;t.classList.add('out');setTimeout(()=>t.remove(),250)};
  t.querySelector('.t-x').onclick=close;t.querySelector('.t-timer').onanimationend=close; // hover pauses the timer
  box.append(t);
}
// Inbox: last 40 rewards; items newer than the last time it was opened are highlighted
const timeAgo=t=>{const s=(Date.now()-t)/1000;return s<60?'just now':s<3600?`${Math.floor(s/60)} min ago`:s<86400?`${Math.floor(s/3600)} h ago`:`${Math.floor(s/86400)} d ago`};
let seenBefore=0;
function renderInbox(){
  $('inboxList').innerHTML=P.inbox.length?P.inbox.map(n=>{const k=KINDS[n.kind]||KINDS.task;
    return`<div class="inote${n.at>seenBefore?' new':''}">${seal(icon(n.ic||k.icon),'s',k.seal)}<div><small>${k.label} · ${timeAgo(n.at)}</small><b>${n.title}</b>${n.body?`<small>${n.body}</small>`:''}</div></div>`}).join('')
    :'<p class="empty">Nothing yet. Finish lessons, quests and tasks and your rewards will show up here.</p>';
}
function openInbox(){seenBefore=P.inboxSeen||0;$('inbox').hidden=false;renderInbox();P.inboxSeen=Date.now();save();$('inboxClose').focus({preventScroll:true})}
const closeInbox=()=>{$('inbox').hidden=true};
$('inboxClose').onclick=closeInbox;
document.addEventListener('click',e=>{
  if(e.target.closest('[data-inbox]'))return $('inbox').hidden?openInbox():closeInbox();
  if(!$('inbox').hidden&&!e.target.closest('#inbox'))closeInbox();
},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('inbox').hidden){closeInbox();e.stopImmediatePropagation()}},true);
