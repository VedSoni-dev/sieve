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
