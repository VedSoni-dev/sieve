// Runs in the Aside REPL on <your Lemmy server>/post/<id>. Given: T, TEXT, ID (post id on your server), PROBE, out.
// Lemmy's web app is a client of Lemmy's own API, so we make the calls it makes when you press upvote, save or
// reply, with the page's session (the token never leaves the page), then read the post back to check it took.
const api = (method, path, body) => page.evaluate(async ([method, path, body]) => {
  const jwt = decodeURIComponent((document.cookie.match(/(?:^|;\s*)jwt=([^;]+)/) || [])[1] || '');
  if (!jwt && method !== 'GET') return { status: 401, signedIn: false, j: { error: 'not signed in' } };
  const r = await fetch(path, { method, headers: { 'content-type': 'application/json', ...(jwt ? { Authorization: 'Bearer ' + jwt } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, signedIn: !!jwt, j: await r.json().catch(() => ({})) };
}, [method, path, body || null]);
const get = async () => (await api('GET', `/api/v3/post?id=${ID}`));
const now = await get();
if (now.status !== 200) throw new Error(`Lemmy couldn't find post ${ID} (${now.status}): ${now.j?.error || ''}`);
const pv = now.j.post_view;
if (PROBE) {
  out.signedIn = now.signedIn;
  out.found = { like: { on: pv.my_vote === 1, score: pv.counts.score }, bookmark: { on: !!pv.saved }, reply: { found: !pv.post.locked, comments: pv.counts.comments } };
  out.ok = true;
  if (!now.signedIn) out.note = 'signed out: the post and its counts read fine; upvote, save and comment need a Lemmy sign-in';
} else {
  if (!now.signedIn) throw new Error('not signed in to Lemmy in this browser');
  const pid = Number(ID);
  let r;
  if (T === 'like' || T === 'unlike') r = await api('POST', '/api/v3/post/like', { post_id: pid, score: T === 'like' ? 1 : 0 });
  if (T === 'bookmark' || T === 'unbookmark') r = await api('PUT', '/api/v3/post/save', { post_id: pid, save: T === 'bookmark' });
  if (T === 'reply') {
    if (pv.post.locked) throw new Error('this post is locked: comments are closed');
    r = await api('POST', '/api/v3/comment', { post_id: pid, content: TEXT });
    out.ok = r.status === 200 && r.j?.comment_view?.comment?.content === TEXT;
    out.posted = r.j?.comment_view?.comment?.ap_id || null;
  } else {
    await sleep(700);
    const after = (await get()).j.post_view;
    out.ok = T === 'like' ? after.my_vote === 1 : T === 'unlike' ? !after.my_vote : T === 'bookmark' ? !!after.saved : !after.saved;
  }
  if (r?.status === 429) throw new Error('Lemmy rate limit: stop for now');
  if (!out.ok) out.error = `Lemmy answered ${r?.status}${r?.j?.error ? ': ' + r.j.error : ''}`;
}
