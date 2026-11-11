// Runs in the Aside REPL on <your server>/@user/<id>. Given: T, TEXT, ID (status id on your server), PROBE, out.
// Mastodon's web app is a client of Mastodon's own API, so we make the same calls it makes when you press
// Favorite, Boost, Bookmark or Reply, with the page's own session (the token never leaves the page), then read the
// status back to check the server now shows it.
const api = (method, path, body) => page.evaluate(async ([method, path, body]) => {
  let token = null;
  try { token = JSON.parse(document.getElementById('initial-state')?.textContent || '{}').meta?.access_token || null; } catch {}
  if (!token && method !== 'GET') return { status: 401, j: { error: 'not signed in' } };
  const h = { 'content-type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) };
  if (method === 'POST') h['Idempotency-Key'] = 'sieve-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  const r = await fetch(path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, signedIn: !!token, j: await r.json().catch(() => ({})) };
}, [method, path, body || null]);

const now = await api('GET', `/api/v1/statuses/${ID}`);
if (now.status !== 200) throw new Error(`Mastodon couldn't find status ${ID} (${now.status}): ${now.j?.error || ''}`);
if (PROBE) {
  out.signedIn = now.signedIn;
  out.found = { like: { on: !!now.j.favourited, count: now.j.favourites_count }, repost: { on: !!now.j.reblogged, count: now.j.reblogs_count }, bookmark: { on: !!now.j.bookmarked }, reply: { found: true, replies: now.j.replies_count } };
  out.ok = true;
  if (!now.signedIn) out.note = 'signed out: the status and its counts read fine; favorite, boost, bookmark and reply need a Mastodon sign-in';
} else {
  if (!now.signedIn) throw new Error('not signed in to Mastodon in this browser');
  const path = { like: 'favourite', unlike: 'unfavourite', repost: 'reblog', unrepost: 'unreblog', bookmark: 'bookmark', unbookmark: 'unbookmark' }[T];
  if (path) {
    const r = await api('POST', `/api/v1/statuses/${ID}/${path}`);
    if (r.status === 429) throw new Error('Mastodon rate limit: stop for now');
    await sleep(800);
    const s = (await api('GET', `/api/v1/statuses/${ID}`)).j;
    const want = !T.startsWith('un');
    const key = { like: 'favourited', unlike: 'favourited', repost: 'reblogged', unrepost: 'reblogged', bookmark: 'bookmarked', unbookmark: 'bookmarked' }[T];
    out.ok = !!s[key] === want;
    if (!out.ok) out.error = `Mastodon answered ${r.status}${r.j?.error ? ': ' + r.j.error : ''}`;
  }
  if (T === 'reply') {
    // like pressing Reply in Mastodon: the reply starts with @author so they're notified
    const at = '@' + now.j.account.acct;
    const status = TEXT.includes(at) ? TEXT : `${at} ${TEXT}`;
    const r = await api('POST', '/api/v1/statuses', { status, in_reply_to_id: ID });
    out.ok = r.status === 200 && r.j?.in_reply_to_id === ID;
    out.posted = r.j?.url || null;
    if (!out.ok) out.error = `Mastodon answered ${r.status}${r.j?.error ? ': ' + r.j.error : ''}`;
  }
}
