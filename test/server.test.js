const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.SIEVE_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'sieve-test-'));
const { server } = require('../server');
let base;
test.before(() => new Promise(r => server.listen(0, '127.0.0.1', () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
test.after(() => { server.closeAllConnections(); server.close(); });

const call = async (method, url, body, headers = {}) => {
  const r = await fetch(base + url, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
};
const P = (id, time, extra = {}) => ({ id, url: `https://x.com/a/status/${id}`, handle: 'a', name: 'A', time, text: [{ t: 'text', v: `post ${id}` }], ...extra });

test('push keeps posts newest-first, dedupes, records hidden with reasons', async () => {
  let r = await call('POST', '/api/feed', { posts: [P('1', 1000), P('3', 3000)], hidden: [{ id: '9', handle: 'b', text: 'ai stuff', reason: 'AI' }] });
  assert.deepEqual(r.body, { added: 2, hidden: 1, total: 2 });
  r = await call('POST', '/api/feed', { posts: [P('2', 2000), P('3', 3000, { likes: 5 })], hidden: [{ id: '9', reason: 'AI' }] });
  assert.equal(r.body.added, 1);
  assert.equal(r.body.hidden, 0);
  const f = await call('GET', '/api/feed');
  assert.deepEqual(f.body.posts.map(p => p.id), ['3', '2', '1']);
  assert.equal(f.body.posts[0].likes, 5);
  const h = await call('GET', '/api/hidden');
  assert.equal(h.body.hidden[0].reason, 'AI');
});

test('actions queue, a toggle back cancels, done updates the post', async () => {
  let r = await call('POST', '/api/actions', { type: 'like', postId: '2' });
  assert.equal(r.body.status, 'pending');
  r = await call('POST', '/api/actions', { type: 'unlike', postId: '2' });
  assert.ok(r.body.cancelled);
  assert.equal((await call('GET', '/api/actions')).body.actions.length, 0);

  const like = (await call('POST', '/api/actions', { type: 'like', postId: '3' })).body;
  let feed = (await call('GET', '/api/feed')).body.posts;
  assert.equal(feed.find(p => p.id === '3').pending.like, 'like');
  await call('POST', `/api/actions/${like.id}`, { status: 'done' });
  feed = (await call('GET', '/api/feed')).body.posts;
  assert.equal(feed.find(p => p.id === '3').liked, true);
  assert.equal(feed.find(p => p.id === '3').pending.like, undefined);
});

test('quote/reply need text; unknown types rejected', async () => {
  assert.equal((await call('POST', '/api/actions', { type: 'quote', postId: '1' })).status, 400);
  assert.equal((await call('POST', '/api/actions', { type: 'follow', postId: '1' })).status, 400);
  const q = await call('POST', '/api/actions', { type: 'quote', postId: '1', text: 'so true' });
  assert.equal(q.body.text, 'so true');
  await call('POST', `/api/actions/${q.body.id}`, { status: 'failed', error: 'rate limited' });
});

test('wait returns as soon as the user clicks', async () => {
  const t0 = Date.now();
  const waiting = call('GET', '/api/actions/wait?timeout=20');
  setTimeout(() => call('POST', '/api/actions', { type: 'bookmark', postId: '1' }), 300);
  const r = await waiting;
  assert.ok(Date.now() - t0 < 5000);
  assert.equal(r.body.actions[0].type, 'bookmark');
});

test('wait returns immediately when a click is already queued (no crash)', async () => {
  const r = await call('GET', '/api/actions/wait?timeout=20');
  assert.ok(r.body.actions.length >= 1);
  assert.equal((await call('GET', '/api/state')).status, 200);
});

test('rules round-trip and agent heartbeat', async () => {
  await call('PUT', '/api/rules', { text: 'no AI' });
  assert.equal((await call('GET', '/api/rules')).body.text, 'no AI');
  const a = await call('POST', '/api/agent', { status: 'scrolling', note: 'hi' });
  assert.equal(a.body.online, true);
});

test('requests from other websites are refused', async () => {
  const r = await fetch(base + '/api/actions', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{"type":"like","postId":"1"}' });
  assert.equal(r.status, 403);
});

test('image proxy only serves X image hosts', async () => {
  assert.equal((await fetch(base + '/img?u=' + encodeURIComponent('https://evil.example/a.jpg'))).status, 403);
  assert.equal((await fetch(base + '/img?u=' + encodeURIComponent('http://pbs.twimg.com/a.jpg'))).status, 403);
  assert.equal((await fetch(base + '/img?u=not-a-url')).status, 400);
});

test('resift: a rules change can bring hidden posts back and hide kept ones', async () => {
  await call('POST', '/api/feed', { posts: [P('20', 20000)], hidden: [{ id: '21', reason: 'AI', post: P('21', 21000) }, { id: '22', handle: 'z', text: 'no full post', reason: 'AI' }] });
  const all = (await call('GET', '/api/all')).body;
  assert.ok(all.hidden.find(h => h.id === '21').canRestore);
  assert.equal(all.hidden.find(h => h.id === '22').canRestore, false);
  const r = await call('POST', '/api/resift', { keep: [{ id: '21', tags: ['frontend'] }, { id: '22' }], hide: [{ id: '20', reason: 'not frontend' }] });
  assert.equal(r.body.restored, 1);
  assert.equal(r.body.removed, 1);
  const feed = (await call('GET', '/api/feed')).body.posts;
  assert.ok(feed.find(p => p.id === '21' && p.tags[0] === 'frontend'));
  assert.ok(!feed.find(p => p.id === '20'));
  const hid = (await call('GET', '/api/hidden')).body.hidden;
  assert.equal(hid.find(h => h.id === '20').reason, 'not frontend');
  assert.equal(hid[0].post, undefined); // the UI list stays light
});

test('multi-source: reddit posts, per-source actions, source status, image hosts', async () => {
  const rp = { id: 'reddit:abc12', source: 'reddit', url: 'https://www.reddit.com/r/x/comments/abc12/t/', handle: 'u1', name: 'r/x', title: 'A title', time: 50000, text: [] };
  const r = await call('POST', '/api/feed', { source: 'reddit', signedIn: true, posts: [rp] });
  assert.equal(r.body.added, 1);
  const feed = (await call('GET', '/api/feed')).body.posts;
  assert.equal(feed.find(p => p.id === 'reddit:abc12').source, 'reddit');
  assert.equal(feed.find(p => p.id === '20' || p.id === '3')?.source, 'x'); // legacy numeric ids are X
  assert.equal((await call('POST', '/api/actions', { type: 'repost', postId: 'reddit:abc12' })).status, 400); // Reddit has no repost
  const up = await call('POST', '/api/actions', { type: 'like', postId: 'reddit:abc12' });
  assert.equal(up.body.source, 'reddit');
  const src = (await call('GET', '/api/sources')).body.sources;
  assert.ok(src.find(s => s.id === 'reddit').status.signedIn);
  await call('PUT', '/api/sources', { id: 'reddit', enabled: true });
  assert.ok((await call('GET', '/api/sources')).body.sources.find(s => s.id === 'reddit').enabled);
  assert.equal((await fetch(base + '/img?u=' + encodeURIComponent('https://i.redd.it/x.jpg'))).status !== 403, true);
});

test('seen lists every judged id; a refresh updates counts but keeps tags; feed filters by source', async () => {
  const hp = { id: 'hn:42', source: 'hn', url: 'https://news.ycombinator.com/item?id=42', handle: '', name: 'example.com', title: 'Story', time: 60000, text: [], likes: 3 };
  await call('POST', '/api/feed', { source: 'hn', signedIn: false, posts: [{ ...hp, tags: ['web'] }], hidden: [{ ...hp, id: 'hn:43', reason: 'about AI' }] });
  const seen = (await call('GET', '/api/seen')).body;
  assert.ok(seen.ids.includes('hn:42') && seen.ids.includes('hn:43'));
  assert.ok(seen.kept.includes('hn:42') && !seen.kept.includes('hn:43'));
  await call('POST', '/api/feed', { source: 'hn', signedIn: false, posts: [{ ...hp, handle: 'pg', likes: 90 }] }); // a round's refresh: no tags
  const only = (await call('GET', '/api/feed?source=hn')).body;
  assert.equal(only.total, 1);
  assert.deepEqual([only.posts[0].handle, only.posts[0].likes, only.posts[0].tags[0]], ['pg', 90, 'web']);
  assert.equal((await call('GET', '/api/sources')).body.sources.find(s => s.id === 'hn').status.signedIn, false);
});
