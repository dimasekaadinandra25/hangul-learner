// In-app notifications: the toast cards that pop up in the corner and the inbox of the last 40 rewards.
// Needs: icons.js ($, icon, seal), save.js (P, save).
// Provides: KINDS, pushInbox, toast, timeAgo, renderInbox, openInbox, closeInbox.

// ---- Notifications ----
// Each kind of card: its small label, the seal color and the default icon
const KINDS = {
  quest: {label: 'Daily quest complete', seal: 'gold', icon: 'check'},
  weekly: {label: 'Weekly quest complete', seal: 'gold', icon: 'star'},
  task: {label: 'Task complete', seal: 'jade', icon: 'check'},
  stamp: {label: 'New stamp', seal: '', icon: 'award'},
  unlock: {label: 'Unlocked', seal: 'jade', icon: 'arrow'},
  sync: {label: 'Welcome back', seal: 'gold', icon: 'gift'},
};

// Titles and bodies are plain text (error messages and word meanings can contain < or &).
// Own helper: this file loads before listen.js, which has esc().
const escapeNoteText = text => String(text).replace(/[&<>"]/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[char]);

// Adds a reward to the top of the inbox (saved in P.inbox), which keeps the newest 40
function pushInbox(kind, title, body, ic) {
  P.inbox.unshift({kind, title, body, ic, at: Date.now()});
  P.inbox.length = Math.min(P.inbox.length, 40);
}

// Pops a notification card (at most 4 at once; the oldest goes first). ic = icon name, else the kind's icon.
// The card closes itself when its timer bar's animation ends; hover pauses the timer.
function toast(kind, title, body, ic) {
  const kindInfo = KINDS[kind] || KINDS.task;
  const box = $('toasts');
  while (box.children.length >= 4) box.firstChild.remove();
  const card = document.createElement('div');
  card.className = `toast k-${kind}`;
  card.setAttribute('role', 'status');
  const bodyHtml = body ? `<span>${escapeNoteText(body)}</span>` : '';
  card.innerHTML = [
    seal(icon(ic || kindInfo.icon), 'm', kindInfo.seal),
    `<div class="t-body"><small>${kindInfo.label}</small><b>${escapeNoteText(title)}</b>${bodyHtml}</div>`,
    '\n    ', // the whitespace that has always sat between the text and the close button
    `<button class="t-x" aria-label="Dismiss">${icon('x')}</button>`,
    '<i class="t-timer"></i>',
  ].join('');
  const close = () => {
    if (card.classList.contains('out')) return;
    card.classList.add('out');
    setTimeout(() => card.remove(), 250);
  };
  card.querySelector('.t-x').onclick = close;
  card.querySelector('.t-timer').onanimationend = close;
  box.append(card);
}

// Inbox: last 40 rewards; items newer than the last time it was opened are highlighted
const timeAgo = time => {
  const seconds = (Date.now() - time) / 1000;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return `${Math.floor(seconds / 86400)} d ago`;
};
let seenBefore = 0; // when the inbox was opened before this time: newer items get "new"

function renderInbox() {
  if (!P.inbox.length) {
    $('inboxList').innerHTML =
      '<p class="empty">Nothing yet. Finish lessons, quests and tasks and your rewards will show up here.</p>';
    return;
  }
  $('inboxList').innerHTML = P.inbox.map(note => {
    const kindInfo = KINDS[note.kind] || KINDS.task;
    const newClass = note.at > seenBefore ? ' new' : '';
    const bodyHtml = note.body ? `<small>${escapeNoteText(note.body)}</small>` : '';
    return [
      `<div class="inote${newClass}">`,
      seal(icon(note.ic || kindInfo.icon), 's', kindInfo.seal),
      `<div><small>${kindInfo.label} · ${timeAgo(note.at)}</small><b>${escapeNoteText(note.title)}</b>${bodyHtml}</div>`,
      '</div>',
    ].join('');
  }).join('');
}

function openInbox() {
  seenBefore = P.inboxSeen || 0;
  $('inbox').hidden = false;
  renderInbox();
  P.inboxSeen = Date.now();
  save();
  $('inboxClose').focus({preventScroll: true});
}
const closeInbox = () => {
  $('inbox').hidden = true;
};
$('inboxClose').onclick = closeInbox;

// Any [data-inbox] button opens or closes the inbox; a click anywhere else closes it
document.addEventListener('click', event => {
  if (event.target.closest('[data-inbox]')) {
    if ($('inbox').hidden) openInbox();
    else closeInbox();
    return;
  }
  if (!$('inbox').hidden && !event.target.closest('#inbox')) closeInbox();
}, true);

// Esc closes the inbox first, before anything else that listens for Esc
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || $('inbox').hidden) return;
  closeInbox();
  event.stopImmediatePropagation();
}, true);
