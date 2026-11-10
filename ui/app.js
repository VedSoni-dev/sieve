// sieve — template UI. renderPost() draws every post your agent kept.
// Like / repost / quote / reply / bookmark queue an action; your agent does it on real X,
// and the button settles when X confirms.
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
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3400); }
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

const ICON = {
  reply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 12a8 8 0 0 1-11.5 7.2L4 20l.9-4.3A8 8 0 1 1 20 12Z"/></svg>',
  repost: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 10V8a2 2 0 0 1 2-2h12l-3-3M20 14v2a2 2 0 0 1-2 2H6l3 3"/></svg>',
  like: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M6.5 3.5h11v17l-5.5-3.8-5.5 3.8z"/></svg>',
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
};

// ---------- rendering (change freely) ----------
const fig = (src, { pixel = 2, reveal = true, extra = '' } = {}) => src
  ? `<figure class="dither${reveal ? ' reveal' : ''}" data-src="${esc(src)}" data-pixel="${pixel}"><img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">${extra}</figure>`
  : '';
function renderText(segs) {
  return (segs || []).map(s => {
    if (s.t === 'text') return esc(s.v);
    if (s.t === 'user') return `<a class="u" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.v)}</a>`;
    if (s.t === 'tag') return `<a class="hash" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.v)}</a>`;
    const d = host(s.url);
    return `<a class="l" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(String(s.v).replace(/…$/, ''))}</a>${d && d !== 't.co' && !String(s.v).includes(d) ? `<small>${esc(d)}</small>` : ''}`;
  }).join('');
}
function renderBody(p) {
  const imgs = (p.images || []).slice(0, 4);
  return `${p.text?.length ? `<div class="text">${renderText(p.text)}</div>` : ''}
    ${p.truncated ? `<a class="readmore" href="${esc(p.url)}" target="_blank" rel="noopener">Read the whole post →</a>` : ''}
    ${imgs.length ? `<div class="media n${imgs.length}">${imgs.map((src, i) => fig(src, { pixel: 2, extra: p.video && i === 0 ? `<a class="play" href="${esc(p.url)}" target="_blank" rel="noopener">▶ Play on X</a>` : '' })).join('')}</div>` : ''}
    ${p.card ? `<a class="card" href="${esc(p.card.url)}" target="_blank" rel="noopener">${p.card.img ? fig(p.card.img, { pixel: 2, reveal: false }) : '<span></span>'}<span class="c"><span class="d">${esc(p.card.domain || host(p.card.url))}</span><span class="ti">${esc(p.card.title)}</span></span></a>` : ''}`;
}
function renderPost(p) {
  const pend = p.pending || {};
  const state = (key, now) => (pend[key] ? pend[key] === key || pend[key] === 'quote' : now);
  const liked = state('like', p.liked), reposted = state('repost', p.reposted), saved = state('bookmark', p.bookmarked);
  const cls = (key, on) => `${on ? ' on' : ''}${pend[key] ? ' pending' : ''}`;
  return `<article class="post" data-id="${esc(p.id)}">
    <div class="av">${fig(p.avatar?.replace('_normal', '_bigger'), { pixel: 1.5, reveal: false })}</div>
    <div class="body">
      ${p.repostedBy ? `<div class="ctx">↻ ${esc(p.repostedBy)} reposted</div>` : ''}
      <div class="who"><b>${esc(p.name)}</b><span class="h">@${esc(p.handle)}</span><a class="t" href="${esc(p.url)}" target="_blank" rel="noopener" title="${p.time ? esc(new Date(p.time).toLocaleString()) : ''}">${esc(ago(p.time, p.when))}</a>
        ${(p.tags || []).length ? `<span class="tags">${p.tags.slice(0, 2).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</span>` : ''}</div>
      ${renderBody(p)}
      ${p.quote ? `<div class="quote"><div class="who"><b>${esc(p.quote.name)}</b><span class="h">@${esc(p.quote.handle)}</span></div>${renderBody(p.quote)}</div>` : ''}
      <div class="acts">
        <button class="act reply${cls('reply', p.replied)}" data-act="reply" title="Reply (r)">${ICON.reply}<span class="n">${k(p.replies)}</span><span class="wait">sending</span></button>
        <button class="act repost${cls('repost', reposted)}${pend.quote ? ' pending' : ''}" data-act="repost-menu" title="Repost or quote">${ICON.repost}<span class="n">${k(p.reposts)}</span><span class="wait">sending</span></button>
        <button class="act like${cls('like', liked)}" data-act="like" title="Like (l)">${ICON.like}<span class="n">${k(p.likes)}</span><span class="wait">sending</span></button>
        <button class="act save${cls('bookmark', saved)}" data-act="bookmark" title="Bookmark (b)">${ICON.save}<span class="wait">sending</span></button>
        <a class="act open" href="${esc(p.url)}" target="_blank" rel="noopener" title="Open on X (o)">${ICON.open}</a>
      </div>
      <div class="slot"></div>
    </div>
  </article>`;
}

// ---------- state ----------
let posts = [], sel = -1;
const byId = new Map();
function setPosts(list) { posts = list; byId.clear(); for (const p of posts) byId.set(p.id, p); draw(); }
function draw() {
  $('#posts').innerHTML = posts.map(renderPost).join('');
  $('#empty').hidden = posts.length > 0;
  if (!posts.length) $('#empty').innerHTML = `Nothing sifted yet.<br><span class="mono dim">Tell your agent: “use the sieve skill: scroll my x”</span>`;
  window.dither.scan();
  sel = -1;
}
function redrawOne(id) {
  const el = document.querySelector(`.post[data-id="${CSS.escape(id)}"]`);
  const p = byId.get(id);
  if (!el || !p) return;
  // keep already-dithered media; only swap the actions row
  const tmp = document.createElement('div'); tmp.innerHTML = renderPost(p);
  el.querySelector('.acts').replaceWith(tmp.querySelector('.acts'));
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
  const slot = document.querySelector(`.post[data-id="${CSS.escape(p.id)}"] .slot`);
  slot.innerHTML = `<form class="composer"><textarea maxlength="280" placeholder="${kind === 'quote' ? 'Add your take…' : `Reply to @${esc(p.handle)}…`}"></textarea>
    <div class="row"><span class="count">0 / 280 · your agent posts this on X</span><span><button type="button" class="btn-ghost" data-cancel>Cancel</button> <button class="primary">${kind === 'quote' ? 'Quote' : 'Reply'}</button></span></div></form>`;
  const f = slot.querySelector('form'), ta = f.querySelector('textarea');
  ta.focus();
  ta.oninput = () => (f.querySelector('.count').textContent = `${ta.value.length} / 280 · your agent posts this on X`);
  ta.onkeydown = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) f.requestSubmit(); if (e.key === 'Escape') slot.innerHTML = ''; };
  f.querySelector('[data-cancel]').onclick = () => (slot.innerHTML = '');
  f.onsubmit = (e) => { e.preventDefault(); const t = ta.value.trim(); if (!t) return; slot.innerHTML = ''; queue(kind, p, t); };
}
const isOn = (p, key, now) => (p.pending?.[key] ? p.pending[key] === key : now);
function doAct(act, p, anchor) {
  if (act === 'like') return queue(isOn(p, 'like', p.liked) ? 'unlike' : 'like', p);
  if (act === 'bookmark') return queue(isOn(p, 'bookmark', p.bookmarked) ? 'unbookmark' : 'bookmark', p);
  if (act === 'reply') return composer(p, 'reply');
  if (act === 'repost-menu') {
    const reposted = isOn(p, 'repost', p.reposted);
    const m = document.createElement('div'); m.className = 'menu';
    m.innerHTML = `<button data-m="repost">${reposted ? 'Undo repost' : 'Repost'}</button><button data-m="quote">Quote</button>`;
    m.onclick = (ev) => { ev.stopPropagation(); const w = ev.target.dataset.m; m.remove(); if (w === 'quote') composer(p, 'quote'); else if (w) queue(reposted ? 'unrepost' : 'repost', p); };
    anchor.append(m);
  }
}
document.addEventListener('click', (e) => {
  document.querySelectorAll('.menu').forEach(m => { if (!m.contains(e.target)) m.remove(); });
  const b = e.target.closest('[data-act]');
  if (!b) return;
  e.stopPropagation();
  doAct(b.dataset.act, byId.get(b.closest('.post').dataset.id), b);
});
$('#more').onclick = async () => { await api('POST', '/api/actions', { type: 'more' }); toast('Asked your agent to scroll deeper.'); };

// ---------- header, drawers ----------
function setAgent(a) {
  const pill = $('#agentPill');
  pill.classList.toggle('on', !!a.online);
  pill.classList.toggle('acting', a.online && a.status === 'acting');
  const label = { scrolling: 'Reading X', acting: 'Acting on X', idle: 'Watching', paused: 'Paused' }[a.status] || a.status;
  pill.querySelector('span').textContent = a.online ? label : 'Agent offline';
  pill.title = a.online ? (a.note || '') : 'Start your agent: "use the sieve skill: scroll my X"';
}
async function counts() {
  const s = await api('GET', '/api/state');
  setAgent(s.agent);
  $('#keptN').textContent = s.counts.posts;
  $('#hiddenN').textContent = s.counts.hidden;
  const total = s.counts.posts + s.counts.hidden;
  $('#footStat').textContent = total ? `${s.counts.posts} of ${total} posts made it through your rules` : '';
}
function openDrawer(id) {
  document.querySelectorAll('.drawer').forEach(d => { const on = d.id === id; d.classList.toggle('open', on); d.setAttribute('aria-hidden', String(!on)); });
  $('#scrim').hidden = !id;
}
$('#scrim').onclick = () => openDrawer(null);
document.querySelectorAll('[data-close]').forEach(b => (b.onclick = () => openDrawer(null)));
$('#rulesBtn').onclick = async () => { $('#rulesText').value = (await api('GET', '/api/rules')).text; openDrawer('rules'); setTimeout(() => $('#rulesText').focus(), 300); };
$('#rulesSave').onclick = async () => { await api('PUT', '/api/rules', { text: $('#rulesText').value }); toast('Saved. Your agent uses these from its next scroll.'); openDrawer(null); };
$('#rulesText').onkeydown = (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('#rulesSave').click(); };
$('#hiddenBtn').onclick = async () => {
  const { hidden } = await api('GET', '/api/hidden');
  const reasons = {};
  for (const h of hidden) { const r = h.reason.split(' · ')[0].replace(/ \(.*\)$/, ''); reasons[r] = (reasons[r] || 0) + 1; }
  const max = Math.max(1, ...Object.values(reasons));
  $('#reasons').innerHTML = Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([r, n]) =>
    `<div class="reason"><span class="r">${esc(r)}</span><span class="n">${n}</span><span class="bar-r" style="--w:${Math.round(100 * n / max)}%"></span></div>`).join('') || '<p class="dim">Nothing sifted out yet.</p>';
  $('#hiddenList').innerHTML = hidden.map(h => `<div class="hid"><div class="r">${esc(h.reason)}</div><div class="w">@${esc(h.handle)}</div><div class="t">${esc(h.text)}</div></div>`).join('');
  openDrawer('hidden');
};
const setDither = (on) => { document.body.classList.toggle('nodither', !on); $('#ditherBtn').setAttribute('aria-pressed', String(on)); store.set('sieve.dither', on ? '1' : '0'); };
$('#ditherBtn').onclick = () => setDither(document.body.classList.contains('nodither'));
setDither(store.get('sieve.dither') !== '0');
if (store.get('sieve.noteHidden')) $('#templateNote').hidden = true;
$('#noteX').onclick = () => { $('#templateNote').hidden = true; store.set('sieve.noteHidden', '1'); };

// ---------- keyboard: j/k move · l like · b bookmark · r reply · o open · esc close ----------
function select(i) {
  const els = [...document.querySelectorAll('.post')];
  if (!els.length) return;
  sel = Math.max(0, Math.min(els.length - 1, i));
  els[sel].scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  els.forEach((e, j) => e.style.opacity = j === sel ? '' : '');
}
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { openDrawer(null); document.querySelectorAll('.menu').forEach(m => m.remove()); return; }
  if (e.target.closest('textarea, input') || e.metaKey || e.ctrlKey || e.altKey) return;
  const el = document.querySelectorAll('.post')[sel];
  const p = el && byId.get(el.dataset.id);
  if (e.key === 'j') select(sel + 1);
  else if (e.key === 'k') select(sel - 1);
  else if (p && e.key === 'l') doAct('like', p);
  else if (p && e.key === 'b') doAct('bookmark', p);
  else if (p && e.key === 'r') { e.preventDefault(); doAct('reply', p); }
  else if (p && e.key === 'o') open(p.url, '_blank', 'noopener');
});

// ---------- live ----------
let unseen = 0;
const ev = new EventSource('/api/events');
ev.addEventListener('agent', (m) => setAgent(JSON.parse(m.data)));
ev.addEventListener('posts', async () => {
  const before = new Set(posts.map(p => p.id));
  const { posts: all } = await api('GET', '/api/feed?limit=300');
  const added = all.filter(p => !before.has(p.id)).length;
  if (scrollY < 200 && !document.querySelector('.composer')) setPosts(all);
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
  if (a.status !== 'done' && a.status !== 'failed') return;
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
});
$('#newPill').onclick = () => { setPosts(window._next || posts); unseen = 0; $('#newPill').hidden = true; scrollTo({ top: 0, behavior: 'smooth' }); };

refresh();
counts();
setInterval(counts, 15000);
setInterval(() => document.querySelectorAll('.post .t').forEach(t => { const p = byId.get(t.closest('.post').dataset.id); if (p) t.textContent = ago(p.time, p.when); }), 60000);
