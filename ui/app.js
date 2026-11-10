// Sieve template UI. Every post your agent kept is rendered by renderPost().
// Clicking like / repost / quote / reply / bookmark queues an action; your agent
// does it on the real X and the button turns solid when it's done.
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const api = async (method, url, body) => {
  const r = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.status);
  return j;
};
const k = (n) => !n ? '' : n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : String(n);
function ago(t, fallback) {
  if (!t) return fallback || '';
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)}d`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
let toastT;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3200); }

const ICON = {
  reply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg>',
  repost: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 9V7a2 2 0 0 1 2-2h11l-3-3M20 15v2a2 2 0 0 1-2 2H7l3 3"/></svg>',
  like: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h12v18l-6-4-6 4V3Z"/></svg>',
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
};

// ---------- rendering (change freely) ----------
function renderText(segs) {
  return (segs || []).map(s => {
    if (s.t === 'text') return esc(s.v);
    if (s.t === 'user') return `<a class="u" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.v)}</a>`;
    if (s.t === 'tag') return `<a class="h" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.v)}</a>`;
    const d = host(s.url);
    return `<a class="l" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(String(s.v).replace(/…$/, ''))}${d && !String(s.v).includes(d) ? `<small>${esc(d)}</small>` : ''}</a>`;
  }).join('');
}
function renderBody(p) {
  const imgs = p.images || [];
  return `<div class="text">${renderText(p.text)}</div>
    ${p.truncated ? `<a class="readmore" href="${esc(p.url)}" target="_blank" rel="noopener">Read the whole post →</a>` : ''}
    ${p.card ? `<a class="card" href="${esc(p.card.url)}" target="_blank" rel="noopener">${p.card.img ? `<img src="${esc(p.card.img)}" alt="" loading="lazy">` : ''}<div><div class="d">${esc(p.card.domain || host(p.card.url))}</div><div class="t">${esc(p.card.title)}</div></div></a>` : ''}
    ${imgs.length ? `<div class="media n${Math.min(4, imgs.length)}">${imgs.slice(0, 4).map(src => p.video
      ? `<a class="vid" href="${esc(p.url)}" target="_blank" rel="noopener"><img src="${esc(src)}" alt="" loading="lazy"></a>`
      : `<img src="${esc(src)}" alt="" loading="lazy">`).join('')}</div>` : ''}`;
}
function renderPost(p) {
  const pend = p.pending || {};
  const on = (key, state) => `${state ? ' on' : ''}${pend[key] ? ' pending' : ''}`;
  const liked = pend.like ? pend.like === 'like' : p.liked;
  const reposted = pend.repost ? pend.repost === 'repost' : p.reposted;
  const saved = pend.bookmark ? pend.bookmark === 'bookmark' : p.bookmarked;
  return `<article class="post" data-id="${esc(p.id)}">
    <img class="av" src="${esc(p.avatar)}" alt="" loading="lazy">
    <div>
      ${p.repostedBy ? `<div class="ctx">↻ ${esc(p.repostedBy)} reposted</div>` : ''}
      <div class="meta"><b>${esc(p.name)}</b><span>@${esc(p.handle)}</span>·<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(ago(p.time, p.when))}</a>
        ${(p.tags || []).length ? `<span class="tags">${p.tags.slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</span>` : ''}</div>
      ${renderBody(p)}
      ${p.quote ? `<div class="quote"><div class="meta"><b>${esc(p.quote.name)}</b><span>@${esc(p.quote.handle)}</span>·<span>${esc(ago(p.quote.time, p.quote.when))}</span></div>${renderBody(p.quote)}</div>` : ''}
      <div class="acts">
        <button class="act reply${on('reply', p.replied)}" data-act="reply" title="Reply">${ICON.reply}<span>${k(p.replies)}</span></button>
        <button class="act repost${on('repost', reposted)}${pend.quote ? ' pending' : ''}" data-act="repost-menu" title="Repost or quote">${ICON.repost}<span>${k(p.reposts)}</span></button>
        <button class="act like${on('like', liked)}" data-act="like" title="Like">${ICON.like}<span>${k(p.likes)}</span></button>
        <button class="act save${on('bookmark', saved)}" data-act="bookmark" title="Bookmark">${ICON.save}</button>
        <a class="act open" href="${esc(p.url)}" target="_blank" rel="noopener" title="Open on X">${ICON.open}</a>
      </div>
      <div class="slot"></div>
    </div>
  </article>`;
}

// ---------- state ----------
let posts = [];
const byId = new Map();
function setPosts(list) { posts = list; byId.clear(); for (const p of posts) byId.set(p.id, p); draw(); }
function draw() {
  $('#posts').innerHTML = posts.map(renderPost).join('');
  const e = $('#empty');
  e.hidden = posts.length > 0;
  if (!posts.length) e.innerHTML = `Nothing here yet.<br>Start your agent in the Sieve folder and say:<br><code>Use the sieve skill: scroll my X</code>`;
}
function redrawOne(id) {
  const el = document.querySelector(`.post[data-id="${CSS.escape(id)}"]`);
  const p = byId.get(id);
  if (el && p) { const keepSlot = el.querySelector('.slot').innerHTML; el.outerHTML = renderPost(p); if (keepSlot) document.querySelector(`.post[data-id="${CSS.escape(id)}"] .slot`).innerHTML = keepSlot; }
}
async function refresh() { setPosts((await api('GET', '/api/feed?limit=300')).posts); }

// ---------- actions ----------
async function queue(type, p, text) {
  try {
    const r = await api('POST', '/api/actions', { type, postId: p.id, url: p.url, text });
    const key = type.replace(/^un/, '');
    p.pending = { ...(p.pending || {}) };
    if (r.cancelled) delete p.pending[key]; else p.pending[key] = type;
    redrawOne(p.id);
    if (type === 'quote' || type === 'reply') toast(`Queued. Your agent will ${type} on X.`);
  } catch (e) { toast(`Couldn't queue that: ${e.message}`); }
}
function composer(p, kind) {
  const el = document.querySelector(`.post[data-id="${CSS.escape(p.id)}"] .slot`);
  el.innerHTML = `<form class="composer"><textarea maxlength="280" placeholder="${kind === 'quote' ? 'Add your take…' : `Reply to @${esc(p.handle)}…`}"></textarea>
    <div class="row"><span>Your agent posts this on X for you.</span><span><button type="button" class="ghost" data-cancel>Cancel</button> <button class="primary">${kind === 'quote' ? 'Quote' : 'Reply'}</button></span></div></form>`;
  const f = el.querySelector('form');
  f.querySelector('textarea').focus();
  f.querySelector('[data-cancel]').onclick = () => (el.innerHTML = '');
  f.onsubmit = (e) => { e.preventDefault(); const t = f.querySelector('textarea').value.trim(); if (!t) return; el.innerHTML = ''; queue(kind, p, t); };
}
document.addEventListener('click', (e) => {
  document.querySelectorAll('.menu').forEach(m => { if (!m.contains(e.target)) m.remove(); });
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const p = byId.get(b.closest('.post').dataset.id);
  const act = b.dataset.act;
  const pend = p.pending || {};
  if (act === 'like') queue((pend.like ? pend.like === 'like' : p.liked) ? 'unlike' : 'like', p);
  if (act === 'bookmark') queue((pend.bookmark ? pend.bookmark === 'bookmark' : p.bookmarked) ? 'unbookmark' : 'bookmark', p);
  if (act === 'reply') composer(p, 'reply');
  if (act === 'repost-menu') {
    e.stopPropagation();
    const reposted = pend.repost ? pend.repost === 'repost' : p.reposted;
    const m = document.createElement('div'); m.className = 'menu';
    m.innerHTML = `<button data-m="repost">${reposted ? 'Undo repost' : 'Repost'}</button><button data-m="quote">Quote</button>`;
    m.onclick = (ev) => { const w = ev.target.dataset.m; m.remove(); if (w === 'quote') composer(p, 'quote'); else queue(reposted ? 'unrepost' : 'repost', p); };
    b.style.position = 'relative'; b.append(m);
  }
});
$('#more').onclick = async () => { await api('POST', '/api/actions', { type: 'more' }); toast('Asked your agent to scroll for more.'); };

// ---------- agent status, hidden, rules ----------
function setAgent(a) {
  const pill = $('#agentPill');
  pill.classList.toggle('on', !!a.online);
  const label = { scrolling: 'Agent scrolling X', acting: 'Agent acting on X', idle: 'Agent watching', paused: 'Agent paused' }[a.status] || `Agent ${a.status}`;
  pill.querySelector('span').textContent = a.online ? label : 'Agent offline';
  pill.title = a.online ? (a.note || '') : 'Start your agent: "Use the sieve skill: scroll my X"';
}
async function counts() {
  const s = await api('GET', '/api/state');
  setAgent(s.agent);
  $('#hiddenBtn').textContent = `${s.counts.hidden} hidden`;
}
function openDrawer(id) { document.querySelectorAll('.drawer').forEach(d => (d.hidden = d.id !== id)); }
document.querySelectorAll('[data-close]').forEach(b => (b.onclick = () => (b.closest('.drawer').hidden = true)));
$('#rulesBtn').onclick = async () => { $('#rulesText').value = (await api('GET', '/api/rules')).text; openDrawer('rules'); };
$('#rulesSave').onclick = async () => { await api('PUT', '/api/rules', { text: $('#rulesText').value }); toast('Saved. Your agent uses these from its next scroll.'); $('#rules').hidden = true; };
$('#hiddenBtn').onclick = async () => {
  const { hidden } = await api('GET', '/api/hidden');
  const reasons = {};
  for (const h of hidden) reasons[h.reason] = (reasons[h.reason] || 0) + 1;
  $('#hiddenList').innerHTML = `<p class="dim">${Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${esc(r)} ×${n}`).join(' · ') || 'Nothing hidden yet.'}</p>` +
    hidden.map(h => `<div class="hid"><div class="why">${esc(h.reason)}</div><div><b>@${esc(h.handle)}</b></div><div class="t">${esc(h.text)}</div></div>`).join('');
  openDrawer('hidden');
};
try { if (localStorage.getItem('sieve.noteHidden')) $('#templateNote').hidden = true; } catch {}
$('#noteX').onclick = () => { $('#templateNote').hidden = true; try { localStorage.setItem('sieve.noteHidden', '1'); } catch {} };

// ---------- live ----------
let unseen = 0;
const ev = new EventSource('/api/events');
ev.addEventListener('agent', (m) => setAgent(JSON.parse(m.data)));
ev.addEventListener('posts', async () => {
  const atTop = scrollY < 200;
  const before = new Set(posts.map(p => p.id));
  const { posts: all } = await api('GET', '/api/feed?limit=300');
  const added = all.filter(p => !before.has(p.id)).length;
  if (atTop) setPosts(all);
  else { unseen += added; $('#newPill').textContent = `${unseen} new post${unseen === 1 ? '' : 's'}`; $('#newPill').hidden = false; window._next = all; }
  counts();
});
ev.addEventListener('refresh', async (m) => {
  const ids = new Set(JSON.parse(m.data));
  const { posts: all } = await api('GET', '/api/feed?limit=300');
  for (const p of all) if (ids.has(p.id) && byId.has(p.id)) { Object.assign(byId.get(p.id), p); redrawOne(p.id); }
});
ev.addEventListener('hidden', () => counts());
ev.addEventListener('action', (m) => {
  const a = JSON.parse(m.data);
  if (a.status === 'done' || a.status === 'failed') {
    const p = byId.get(a.postId);
    if (p) {
      const key = a.type.replace(/^un/, '');
      if (p.pending) delete p.pending[key];
      if (a.status === 'done') {
        if (key === 'like') p.liked = a.type === 'like';
        if (key === 'repost') p.reposted = a.type === 'repost';
        if (key === 'bookmark') p.bookmarked = a.type === 'bookmark';
        if (a.type === 'quote') p.quoted = true;
        if (a.type === 'reply') p.replied = true;
      }
      redrawOne(p.id);
    }
    if (a.status === 'failed') toast(`Your agent couldn't ${a.type}: ${a.error || 'unknown error'}`);
    else if (a.type !== 'more') toast(`Done on X: ${a.type}`);
  }
});
$('#newPill').onclick = () => { setPosts(window._next || posts); unseen = 0; $('#newPill').hidden = true; scrollTo({ top: 0, behavior: 'smooth' }); };

refresh();
counts();
setInterval(counts, 15000);
setInterval(() => { if (document.querySelectorAll('.post').length && !document.querySelector('.composer, .menu')) draw(); }, 60000); // keep "5m ago" fresh
