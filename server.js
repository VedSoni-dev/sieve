#!/usr/bin/env node
// Sieve server: the bridge between your UI (localhost) and your agent (browser use on your real feeds:
// X, Reddit and every other source in sources/).
//   agent → POST /api/feed       posts it kept (and ones it hid, with a reason)
//   you   → POST /api/actions    like / repost / quote / reply / bookmark / more
//   agent → GET  /api/actions    picks them up, does them on real X, reports back
// Zero dependencies. Data lives in ./data as JSON.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.SIEVE_PORT || 4545);
const DATA = path.resolve(process.env.SIEVE_DATA || path.join(__dirname, 'data'));
const UI = path.join(__dirname, 'ui');
const MAX_POSTS = 2000;
const ACTIONS = new Set(['like', 'unlike', 'repost', 'unrepost', 'quote', 'reply', 'bookmark', 'unbookmark', 'more']);

// Sources: one folder each in sources/ (source.json says what it is and what it can do).
// Re-read on demand, so a new source folder works without restarting the server.
const SRC_DIR = path.join(__dirname, 'sources');
const SOURCES = {};
const IMAGE_HOSTS = new Set(['pbs.twimg.com', 'abs.twimg.com']);
function loadSources() {
  for (const d of fs.readdirSync(SRC_DIR)) {
    const f = path.join(SRC_DIR, d, 'source.json');
    if (!fs.existsSync(f)) continue;
    try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); SOURCES[j.id] = j; for (const h of j.imageHosts || []) IMAGE_HOSTS.add(h); } catch {}
  }
  return SOURCES;
}
loadSources();
const sourceOf = (p) => p?.source || (/^\d+$/.test(String(p?.id)) ? 'x' : String(p?.id || '').split(':')[0]);
const supports = (src, type) => type === 'more' || !SOURCES[src] || Object.keys(SOURCES[src].actions || {}).includes(type.replace(/^un/, ''));

fs.mkdirSync(DATA, { recursive: true });
const file = (n) => path.join(DATA, n);
const load = (n, d) => { try { return JSON.parse(fs.readFileSync(file(n), 'utf8')); } catch { return d; } };
const save = (n, v) => { fs.writeFileSync(file(n) + '.tmp', JSON.stringify(v)); fs.renameSync(file(n) + '.tmp', file(n)); };

const db = {
  posts: load('feed.json', []),            // kept posts, newest arrival first
  hidden: load('hidden.json', []),         // {id, handle, text, reason, at}
  actions: load('actions.json', []),       // queue + history
  agent: { status: 'offline', note: '', lastSeen: 0, ...load('agent.json', {}) },
  sources: { enabled: { x: true }, status: {}, ...load('sources.json', {}) }, // enabled[id], status[id] = {signedIn, at, read}
  rulesAt: (() => { try { return fs.statSync(path.join(DATA, 'rules.md')).mtimeMs; } catch { return 0; } })(),
};
if (!fs.existsSync(file('rules.md'))) fs.copyFileSync(path.join(__dirname, 'rules.example.md'), file('rules.md'));

// ---------- long-poll for the agent: returns as soon as you click something ----------
const waiters = new Set();
function wakeWaiters() { for (const w of waiters) w(); waiters.clear(); }

// ---------- live updates (SSE) ----------
const clients = new Set();
function emit(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20000).unref();

function agentState() {
  const online = Date.now() - (db.agent.lastSeen || 0) < 90_000;
  return { ...db.agent, online, status: online ? db.agent.status : 'offline' };
}

// ---------- handlers ----------
function upsertPosts(incoming) {
  const byId = new Map(db.posts.map(p => [p.id, p]));
  const fresh = [];
  for (const p of incoming) {
    if (!p || !p.id || !/^[\w:.~-]{1,120}$/.test(String(p.id))) continue;
    p.source = sourceOf(p);
    if (!p.time && p.source === 'x' && /^\d+$/.test(String(p.id))) p.time = Number((BigInt(p.id) >> 22n) + 1288834974657n); // Snowflake id → creation time
    const prev = byId.get(p.id);
    if (prev) Object.assign(prev, { ...p, seenAt: prev.seenAt, pending: prev.pending }); // refresh counts / liked state
    else { const np = { ...p, seenAt: Date.now(), pending: {} }; byId.set(p.id, np); fresh.push(np); }
  }
  // Chronological, newest first: your feed, not the algorithm's order.
  db.posts = [...byId.values()].sort((a, b) => (b.time || b.seenAt) - (a.time || a.seenAt)).slice(0, MAX_POSTS);
  save('feed.json', db.posts);
  return fresh;
}

// A hidden entry keeps the whole post (when the agent sends it) so a later rules change can bring it back.
function hideEntry(h, post) {
  const full = post || (h.post && typeof h.post === 'object' ? h.post : (Array.isArray(h.text) ? h : null));
  const plain = full ? (full.plain || (full.text || []).map(s => s.v).join('')) : h.text;
  return { id: String(h.id), source: sourceOf(full || h), handle: h.handle || full?.handle || '', text: String((full?.title ? full.title + ' — ' : '') + (plain || '')).slice(0, 280), reason: String(h.reason || 'your rules'), at: Date.now(), post: full || null };
}

const routes = {
  'GET /api/state': () => ({
    agent: agentState(),
    rulesAt: db.rulesAt || 0,
    counts: { posts: db.posts.length, hidden: db.hidden.length, pending: db.actions.filter(a => a.status === 'pending').length },
    bySource: Object.fromEntries(Object.keys(SOURCES).map((id) => [id, { kept: db.posts.filter((p) => sourceOf(p) === id).length, hidden: db.hidden.filter((h) => sourceOf(h.post || h) === id).length }])),
  }),
  'GET /api/sources': () => (loadSources(), {
    sources: Object.values(SOURCES).map((s) => ({ ...s, enabled: !!db.sources.enabled[s.id], status: db.sources.status[s.id] || null })),
  }),
  'PUT /api/sources': (b) => {
    if (!loadSources()[b.id]) throw Object.assign(new Error(`unknown source ${b.id}`), { code: 400 });
    db.sources.enabled[b.id] = !!b.enabled;
    save('sources.json', db.sources);
    emit('sources', {});
    return { ok: true };
  },
  'GET /api/feed': (q) => {
    const limit = Math.min(500, Number(q.limit) || 200);
    return { posts: db.posts.slice(0, limit), total: db.posts.length };
  },
  'POST /api/feed': (b) => {
    if (b.source && loadSources()[b.source]) {
      db.sources.status[b.source] = { signedIn: b.signedIn !== false, at: Date.now(), read: (b.posts || []).length + (b.hidden || []).length };
      save('sources.json', db.sources); emit('sources', {});
    }
    const fresh = upsertPosts(Array.isArray(b.posts) ? b.posts : []);
    const hid = (Array.isArray(b.hidden) ? b.hidden : []).filter(h => h && h.id && !db.hidden.some(x => x.id === h.id))
      .map(h => hideEntry(h));
    db.hidden = [...hid, ...db.hidden].slice(0, MAX_POSTS);
    save('hidden.json', db.hidden);
    if (fresh.length) emit('posts', fresh);
    if (hid.length) emit('hidden', hid);
    // tell the UI about refreshed states (liked etc.) too
    emit('refresh', (b.posts || []).map(p => p.id));
    return { added: fresh.length, hidden: hid.length, total: db.posts.length };
  },
  'GET /api/hidden': () => ({ hidden: db.hidden.slice(0, 300).map(({ post, ...h }) => h) }),
  // Everything the agent has judged so far, for re-judging after the rules change.
  'GET /api/all': () => ({
    rulesAt: db.rulesAt || 0,
    kept: db.posts.map(p => ({ id: p.id, source: sourceOf(p), handle: p.handle, title: p.title || '', community: p.community || '', text: (p.text || []).map(s => s.v).join(''), card: p.card?.title || '', quote: (p.quote?.text || []).map(s => s.v).join(''), images: (p.images || []).length, tags: p.tags || [] })),
    hidden: db.hidden.map(h => ({ id: h.id, source: sourceOf(h.post || h), handle: h.handle, text: h.text, reason: h.reason, canRestore: !!h.post })),
  }),
  // The agent's fresh decisions after a rules change: {keep:[{id, tags}], hide:[{id, reason}]}.
  'POST /api/resift': (b) => {
    const keptById = new Map(db.posts.map(p => [p.id, p]));
    const hidById = new Map(db.hidden.map(h => [h.id, h]));
    let restored = 0, removed = 0;
    for (const h of b.hide || []) {
      const id = String(h.id), p = keptById.get(id);
      if (p) { keptById.delete(id); hidById.set(id, { ...hideEntry({ id, reason: h.reason }, p) }); removed++; }
      else if (hidById.has(id)) hidById.get(id).reason = String(h.reason || hidById.get(id).reason);
    }
    for (const k of b.keep || []) {
      const id = String(k.id);
      if (keptById.has(id)) { if (k.tags) keptById.get(id).tags = k.tags; continue; }
      const h = hidById.get(id);
      if (h?.post) { keptById.set(id, { ...h.post, tags: k.tags || h.post.tags || [], seenAt: Date.now(), pending: {} }); hidById.delete(id); restored++; }
    }
    db.posts = [...keptById.values()].sort((a, b) => (b.time || b.seenAt) - (a.time || a.seenAt));
    db.hidden = [...hidById.values()].sort((a, b) => b.at - a.at);
    save('feed.json', db.posts); save('hidden.json', db.hidden);
    emit('resift', { restored, removed, kept: db.posts.length, hidden: db.hidden.length });
    return { restored, removed, kept: db.posts.length, hidden: db.hidden.length };
  },
  'GET /api/rules': () => ({ text: fs.readFileSync(file('rules.md'), 'utf8') }),
  'PUT /api/rules': (b) => {
    fs.writeFileSync(file('rules.md'), String(b.text ?? ''));
    db.rulesAt = Date.now(); save('agent.json', db.agent);
    emit('rules', { text: b.text, rulesAt: db.rulesAt });
    return { ok: true };
  },
  'POST /api/actions': (b) => {
    if (!ACTIONS.has(b.type)) throw Object.assign(new Error(`unknown action ${b.type}`), { code: 400 });
    if (b.type !== 'more' && !b.postId) throw Object.assign(new Error('postId required'), { code: 400 });
    if ((b.type === 'quote' || b.type === 'reply') && !String(b.text || '').trim()) throw Object.assign(new Error('text required'), { code: 400 });
    const post = db.posts.find(p => p.id === b.postId);
    const src = post ? sourceOf(post) : (b.source || null);
    if (src && !supports(src, b.type)) throw Object.assign(new Error(`${SOURCES[src]?.name || src} has no ${b.type}`), { code: 400 });
    const a = { id: crypto.randomUUID().slice(0, 8), type: b.type, source: src, postId: b.postId || null, url: b.url || post?.url || null,
                text: b.text ? String(b.text).slice(0, 280) : undefined, status: 'pending', createdAt: Date.now() };
    // Collapse toggles: a like followed by an unlike before the agent got to it cancels out.
    const opposite = { like: 'unlike', unlike: 'like', repost: 'unrepost', unrepost: 'repost', bookmark: 'unbookmark', unbookmark: 'bookmark' }[a.type];
    const clash = opposite && db.actions.find(x => x.status === 'pending' && x.postId === a.postId && x.type === opposite);
    if (clash) { clash.status = 'cancelled'; clash.doneAt = Date.now(); }
    else db.actions.push(a);
    if (post && a.type !== 'more') { const k = a.type.replace(/^un/, ''); post.pending = { ...(post.pending || {}) }; if (clash) delete post.pending[k]; else post.pending[k] = a.type; save('feed.json', db.posts); }
    save('actions.json', db.actions.slice(-1000));
    if (!clash) wakeWaiters();
    emit('action', clash ? clash : a);
    return clash ? { cancelled: clash.id } : a;
  },
  'GET /api/actions': (q) => {
    const status = q.status || 'pending';
    return { actions: db.actions.filter(a => status === 'all' || a.status === status) };
  },
  'POST /api/actions/:id': (b, id) => {
    const a = db.actions.find(x => x.id === id);
    if (!a) throw Object.assign(new Error('no such action'), { code: 404 });
    a.status = b.status === 'done' ? 'done' : b.status === 'failed' ? 'failed' : 'working';
    if (b.error) a.error = String(b.error).slice(0, 300);
    if (a.status !== 'working') a.doneAt = Date.now();
    const post = db.posts.find(p => p.id === a.postId);
    if (post && a.status !== 'working') {
      const key = a.type.replace(/^un/, '');
      if (post.pending) delete post.pending[key];
      if (a.status === 'done') {
        if (key === 'like') post.liked = a.type === 'like';
        if (key === 'repost') post.reposted = a.type === 'repost';
        if (key === 'bookmark') post.bookmarked = a.type === 'bookmark';
        if (a.type === 'quote') post.quoted = true;
        if (a.type === 'reply') post.replied = true;
      }
      save('feed.json', db.posts);
    }
    save('actions.json', db.actions.slice(-1000));
    emit('action', a);
    return a;
  },
  'POST /api/agent': (b) => {
    db.agent = { status: String(b.status || 'working').slice(0, 40), note: String(b.note || '').slice(0, 200), lastSeen: Date.now() };
    save('agent.json', db.agent);
    emit('agent', agentState());
    return agentState();
  },
};

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  // Only this machine, and only same-origin browser calls (blocks other sites poking your agent's queue).
  const origin = req.headers.origin;
  if (origin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) { res.writeHead(403); return res.end(); }

  if (url.pathname === '/api/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    res.write(`event: agent\ndata: ${JSON.stringify(agentState())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (url.pathname === '/api/actions/wait') {
    const t = Math.min(115, Math.max(1, Number(url.searchParams.get('timeout')) || 55)) * 1000;
    const pendingNow = () => db.actions.filter(a => a.status === 'pending');
    let timer = null;
    const finish = () => { clearTimeout(timer); waiters.delete(finish); if (!res.writableEnded) { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ actions: pendingNow() })); } };
    if (pendingNow().length) return finish();
    timer = setTimeout(finish, t);
    waiters.add(finish);
    req.on('close', () => { clearTimeout(timer); waiters.delete(finish); });
    return;
  }

  // Image proxy so the UI can dither images on a canvas (the sites' CDNs don't allow cross-origin pixel reads).
  // Only the image hosts the sources list (sources/*/source.json → imageHosts), only GET, cached for a day.
  if (url.pathname === '/img') {
    let src;
    try { src = new URL(url.searchParams.get('u') || ''); } catch { res.writeHead(400); return res.end(); }
    if (src.protocol !== 'https:' || !IMAGE_HOSTS.has(src.hostname)) { res.writeHead(403); return res.end(); }
    fetch(src, { headers: { 'user-agent': 'sieve-image-proxy' } }).then(async (r) => {
      if (!r.ok) { res.writeHead(r.status); return res.end(); }
      res.writeHead(200, { 'content-type': r.headers.get('content-type') || 'image/jpeg', 'cache-control': 'public, max-age=86400' });
      res.end(Buffer.from(await r.arrayBuffer()));
    }).catch(() => { res.writeHead(502); res.end(); });
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    const m = url.pathname.match(/^\/api\/actions\/([\w-]+)$/);
    const key = m ? `${req.method} /api/actions/:id` : `${req.method} ${url.pathname}`;
    const fn = routes[key];
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 5e6) req.destroy(); });
    req.on('end', () => {
      const reply = (code, v) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)); };
      if (!fn) return reply(404, { error: `no route ${key}` });
      try {
        const input = body ? JSON.parse(body) : {};
        reply(200, req.method === 'GET' ? fn(Object.fromEntries(url.searchParams)) : fn(input, m?.[1]));
      } catch (e) { reply(e.code || 500, { error: e.message }); }
    });
    return;
  }

  // static UI
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const f = path.join(UI, rel);
  if (!f.startsWith(UI) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => console.log(`sieve: http://localhost:${PORT}  (data: ${DATA})`));
}
module.exports = { server, routes, db, SOURCES };
