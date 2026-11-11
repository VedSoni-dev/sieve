// Runs INSIDE a bsky.app page: evaluate `(<this file>)({ cursor })`.
// Signed in: your Following timeline, through Bluesky's own API with the page's session (the same call
// the app makes; the session never leaves the page). Signed out: the public Discover feed, or the profile
// the page is on. Returns { url, signedIn, posts, cursor }.
(async (opts = {}) => {
  let acct = null;
  try { acct = JSON.parse(localStorage.getItem('BSKY_STORAGE') || 'null')?.session?.currentAccount || null; } catch {}
  const signedIn = !!acct?.accessJwt;
  const profile = (location.pathname.match(/^\/profile\/([^/]+)\/?$/) || [])[1];
  const q = new URLSearchParams({ limit: '40' });
  if (opts.cursor) q.set('cursor', opts.cursor);
  let url, headers = {};
  if (profile) { q.set('actor', profile); q.set('filter', 'posts_no_replies'); url = 'app.bsky.feed.getAuthorFeed'; }
  else if (signedIn) url = 'app.bsky.feed.getTimeline';
  else { q.set('feed', 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot'); url = 'app.bsky.feed.getFeed'; }
  const base = signedIn ? acct.pdsUrl.replace(/\/$/, '') : 'https://public.api.bsky.app';
  if (signedIn) headers = { Authorization: 'Bearer ' + acct.accessJwt };
  const res = await fetch(`${base}/xrpc/${url}?${q}`, { headers });
  if (!res.ok) return { url: location.href, signedIn, posts: [], note: `bluesky said ${res.status}`, stop: true };
  const d = await res.json();
  const seg = (record) => {
    const text = record?.text || '';
    if (!record?.facets?.length) return text ? [{ t: 'text', v: text }] : [];
    const bytes = new TextEncoder().encode(text), dec = new TextDecoder(), out = [];
    let at = 0;
    for (const f of [...record.facets].sort((a, b) => a.index.byteStart - b.index.byteStart)) {
      const { byteStart: s, byteEnd: e } = f.index; const feat = f.features?.[0] || {};
      if (s < at) continue;
      if (s > at) out.push({ t: 'text', v: dec.decode(bytes.slice(at, s)) });
      const v = dec.decode(bytes.slice(s, e));
      if (feat.$type === 'app.bsky.richtext.facet#link') out.push({ t: 'link', v, url: feat.uri });
      else if (feat.$type === 'app.bsky.richtext.facet#mention') out.push({ t: 'user', v, url: `https://bsky.app/profile/${feat.did}` });
      else if (feat.$type === 'app.bsky.richtext.facet#tag') out.push({ t: 'tag', v, url: `https://bsky.app/hashtag/${encodeURIComponent(feat.tag)}` });
      else out.push({ t: 'text', v });
      at = e;
    }
    if (at < bytes.length) out.push({ t: 'text', v: dec.decode(bytes.slice(at)) });
    return out;
  };
  const media = (embed) => {
    const m = { images: [], video: false, card: null, quote: null };
    if (!embed) return m;
    const t = embed.$type || '';
    if (t.startsWith('app.bsky.embed.images')) m.images = (embed.images || []).map((i) => i.fullsize || i.thumb).slice(0, 4);
    if (t.startsWith('app.bsky.embed.video')) { m.video = true; if (embed.thumbnail) m.images = [embed.thumbnail]; }
    if (t.startsWith('app.bsky.embed.external')) { const x = embed.external || {}; try { m.card = { url: x.uri, title: x.title, domain: new URL(x.uri).hostname.replace(/^www\./, ''), img: x.thumb || '' }; } catch {} }
    if (t.startsWith('app.bsky.embed.recordWithMedia')) { const inner = media(embed.media); Object.assign(m, { images: inner.images, video: inner.video, card: inner.card }); embed = embed.record; }
    if ((embed.$type || '').startsWith('app.bsky.embed.record')) {
      const r = embed.record || {};
      if (r.author && r.value) m.quote = { handle: r.author.handle, name: r.author.displayName || r.author.handle, avatar: r.author.avatar || '', text: seg(r.value), url: `https://bsky.app/profile/${r.author.handle}/post/${r.uri.split('/').pop()}`, images: (r.embeds?.[0]?.images || []).map((i) => i.fullsize).slice(0, 4) };
    }
    return m;
  };
  const NSFW = /^(porn|sexual|nudity|graphic-media)$/;
  const posts = (d.feed || []).map(({ post: p, reason }) => {
    const rkey = p.uri.split('/').pop(), did = p.author.did.split(':').pop();
    const m = media(p.embed);
    return {
      id: `bluesky:${did}-${rkey}`, source: 'bluesky', url: `https://bsky.app/profile/${p.author.handle}/post/${rkey}`,
      handle: p.author.handle, name: p.author.displayName || p.author.handle, avatar: p.author.avatar || '',
      time: Date.parse(p.record?.createdAt || p.indexedAt) || null,
      text: seg(p.record), plain: (p.record?.text || '') + (m.quote ? '\n> ' + m.quote.text.map((x) => x.v).join('') : '') + (m.card ? '\n' + m.card.title : ''),
      images: m.images, video: m.video, card: m.card, quote: m.quote,
      repostedBy: reason?.$type === 'app.bsky.feed.defs#reasonRepost' ? (reason.by.displayName || reason.by.handle) : null,
      likes: p.likeCount || 0, reposts: (p.repostCount || 0) + (p.quoteCount || 0), replies: p.replyCount || 0,
      liked: !!p.viewer?.like, reposted: !!p.viewer?.repost, bookmarked: !!p.viewer?.bookmarked,
      nsfw: (p.labels || []).some((l) => NSFW.test(l.val)), promoted: false,
    };
  });
  return { url: location.href, signedIn, posts, cursor: d.cursor || null, note: signedIn ? '' : 'signed out: public Discover feed' };
})
