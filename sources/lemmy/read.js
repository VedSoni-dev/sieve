// Runs INSIDE a Lemmy page on your server (e.g. lemmy.world): evaluate `(<this file>)({ cursor })`.
// Signed in: the communities you subscribe to (Hot), through Lemmy's own API with the page's session.
// Signed out: the server's Hot posts from everywhere. The session token stays in the page.
(async (opts = {}) => {
  const host = location.host;
  const jwt = decodeURIComponent((document.cookie.match(/(?:^|;\s*)jwt=([^;]+)/) || [])[1] || '');
  const signedIn = !!jwt;
  const q = new URLSearchParams({ type_: signedIn ? 'Subscribed' : 'All', sort: 'Hot', limit: '30' });
  if (opts.cursor) q.set('page_cursor', opts.cursor);
  const r = await fetch('/api/v3/post/list?' + q, { headers: jwt ? { Authorization: 'Bearer ' + jwt } : {} });
  if (!r.ok) return { url: location.href, signedIn, posts: [], cursor: null, note: `Lemmy said ${r.status}` };
  const j = await r.json();
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
  const hostOf = (u) => { try { return new URL(u).host; } catch { return ''; } };
  const where = (actor, name) => { const h = hostOf(actor); return h && h !== host ? `${name}@${h}` : name; };
  // the same link is often cross-posted to several communities: keep the first one this session sees
  const seenLinks = (window.__sieveLemmyLinks ||= new Set());
  const fresh = (v) => { const k = v.post.url || ''; if (!k) return true; if (seenLinks.has(k)) return false; seenLinks.add(k); return true; };
  const posts = (j.posts || []).filter((v) => !v.post.removed && !v.post.deleted && fresh(v)).map((v) => {
    const p = v.post, isImg = /^image\//.test(p.url_content_type || '') || /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(p.url || '');
    const img = isImg ? (hostOf(p.url) === host ? p.url : p.thumbnail_url || p.url) : '';
    const video = /^video\//.test(p.url_content_type || '') || /\.(mp4|webm)(\?|$)/i.test(p.url || '');
    const body = (p.body || '').trim();
    const community = where(v.community.actor_id, v.community.name);
    return {
      id: 'lemmy:' + p.id, source: 'lemmy', url: `https://${host}/post/${p.id}`, originalUrl: p.ap_id,
      handle: v.creator.name, name: 'c/' + v.community.name, community: 'c/' + community, // the full c/name@server goes to the agent
      avatar: v.community.icon || v.creator.avatar || '',
      time: Date.parse(p.published) || null,
      title: p.name, text: body ? mdSegs(body.length > 1400 ? body.slice(0, 1400) + '…' : body) : [], truncated: body.length > 1400,
      plain: `${p.name}${body ? ' — ' + body.slice(0, 300) : ''}`,
      images: img ? [img] : video && p.thumbnail_url ? [p.thumbnail_url] : [], video,
      card: p.url && !isImg ? { url: p.url, title: p.embed_title || p.name, domain: hostOf(p.url).replace(/^www\./, ''), img: video ? '' : (p.thumbnail_url || '') } : null,
      likes: v.counts.score || 0, replies: v.counts.comments || 0, reposts: 0,
      liked: v.my_vote === 1, bookmarked: !!v.saved,
      nsfw: !!(p.nsfw || v.community.nsfw), promoted: false,
    };
  });
  return { url: location.href, signedIn, posts, cursor: j.next_page || null, note: signedIn ? '' : 'signed out: Hot posts from every community' };
})
