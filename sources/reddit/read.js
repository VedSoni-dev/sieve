// Runs INSIDE a reddit.com page: evaluate `(<this file>)({ cursor })`. Reads the feed the page is on
// (your home feed on reddit.com/, or a subreddit) from Reddit's own JSON, with your session, so it
// includes your vote and save state. Returns { url, signedIn, posts, cursor } (cursor = next page).
(async (opts = {}) => {
  const q = new URLSearchParams({ limit: '25', raw_json: '1', sr_detail: '1' });
  if (opts.cursor) q.set('after', opts.cursor);
  const base = location.pathname.replace(/\/+$/, '').replace(/\/comments\/.*/, '');
  const res = await fetch(`${base}/.json?${q}`, { credentials: 'include' });
  if (!res.ok) return { url: location.href, signedIn: false, posts: [], note: `reddit said ${res.status}`, stop: true };
  const d = await res.json();
  let signedIn = true;
  if (!opts.page) { try { const me = await (await fetch('/api/me.json', { credentials: 'include' })).json(); signedIn = !!me?.data?.name; } catch { signedIn = false; } }
  const clean = (u) => (u || '').replace(/&amp;/g, '&');
  const posts = (d.data?.children || []).filter((c) => c.kind === 't3').map(({ data: x }) => {
    const gallery = x.is_gallery && x.media_metadata ? (x.gallery_data?.items || []).map((it) => clean(x.media_metadata[it.media_id]?.s?.u || x.media_metadata[it.media_id]?.s?.gif)).filter(Boolean) : [];
    const preview = clean(x.preview?.images?.[0]?.source?.url);
    const isImage = x.post_hint === 'image' || /\.(jpe?g|png|gif|webp)$/i.test(x.url || '');
    const isSelf = x.is_self;
    const images = gallery.length ? gallery.slice(0, 4) : isImage ? [clean(x.url)] : x.is_video && preview ? [preview] : [];
    const card = !isSelf && !images.length && x.url && !/reddit\.com/.test(x.domain || '') ? { url: clean(x.url), title: x.title, domain: x.domain, img: preview || (/^https/.test(x.thumbnail) ? clean(x.thumbnail) : '') } : null;
    const sr = x.sr_detail || {};
    return {
      id: 'reddit:' + x.id, source: 'reddit', url: 'https://www.reddit.com' + x.permalink,
      handle: x.author, name: x.subreddit_name_prefixed, community: x.subreddit_name_prefixed,
      avatar: clean(sr.community_icon || sr.icon_img || ''),
      time: Math.round(x.created_utc * 1000),
      title: x.title, flair: x.link_flair_text || null,
      text: x.selftext ? [{ t: 'text', v: x.selftext.slice(0, 1400) }] : [],
      plain: (x.title + '\n' + (x.selftext || '')).trim().slice(0, 2000),
      truncated: (x.selftext || '').length > 1400,
      images, video: !!x.is_video, card,
      likes: x.score, replies: x.num_comments, reposts: 0,
      liked: x.likes === true, disliked: x.likes === false, bookmarked: !!x.saved,
      nsfw: !!x.over_18, spoiler: !!x.spoiler, promoted: !!x.promoted, stickied: !!x.stickied,
    };
  });
  return { url: location.href, signedIn, posts, cursor: d.data?.after || null };
})
