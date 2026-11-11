// Runs INSIDE a reddit.com page: evaluate `(<this file>)({ cursor })`. Reads the feed the page is on
// (your home feed on reddit.com/, or a subreddit) from Reddit's own JSON, with your session, so it
// includes your vote and save state. Returns { url, signedIn, posts, cursor } (cursor = next page).
(async (opts = {}) => {
  // Markdown → Sieve text segments: quote, heading, bold and code markers dropped; links kept as links.
  const mdInline = (s) => s.replace(/(\*\*|__)(.+?)\1/g, '$2').replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=[^\w*]|$)/g, '$1$2').replace(/~~(.+?)~~/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/\\([\\`*_{}\[\]()#+\-.!>])/g, '$1');
  const mdSegs = (md) => {
    const out = [];
    const push = (t, v, url) => { if (!v) return; const l = out[out.length - 1]; if (t === 'text' && l?.t === 'text') l.v += v; else out.push(url ? { t, v, url } : { t, v }); };
    const text = String(md || '').replace(/\r/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x200B;|​/g, '')
      .split('\n').map((l) => l.replace(/^\s{0,3}(>\s?)+/, '').replace(/^\s{0,3}#{1,6}\s+/, '').replace(/^\s*[-*+]\s+(?=\S)/, '• ').replace(/^\s*([-*_]\s*){3,}$/, '').replace(/^\s*\|?[\s:|-]+\|[\s:|-]*$/, ''))
      .join('\n').replace(/\n{3,}/g, '\n\n').trim();
    const re = /!?\[([^\]]*)\]\((https?:\/\/[^)\s]+)[^)]*\)|(https?:\/\/[^\s)<>\]]+)/g;
    let at = 0, m;
    while ((m = re.exec(text))) {
      push('text', mdInline(text.slice(at, m.index)));
      const url = m[2] || m[3];
      push('link', m[1] ? mdInline(m[1]) : url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 42) + (url.length > 50 ? '…' : ''), url);
      at = re.lastIndex;
    }
    push('text', mdInline(text.slice(at)));
    return out;
  };

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
      text: x.selftext ? mdSegs(x.selftext.slice(0, 1400) + (x.selftext.length > 1400 ? '…' : '')) : [],
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
