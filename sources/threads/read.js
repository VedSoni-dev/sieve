// Runs INSIDE a threads.com page: evaluate `(<this file>)({ page })`.
// Threads ships each feed page as JSON (the first few posts inside the HTML, the rest as you scroll).
// On the first call this installs a listener that keeps every feed response the page itself fetches,
// then every call returns all posts seen so far, mapped to Sieve's shape. Nothing is sent anywhere.
(async (opts = {}) => {
  const W = window;
  if (!W.__sieveThreads) {
    const S = (W.__sieveThreads = { raw: [] });
    const keep = (t) => { if (typeof t === 'string' && t.includes('thread_items')) S.raw.push(t); };
    const f0 = W.fetch;
    W.fetch = async (...a) => { const r = await f0(...a); try { r.clone().text().then(keep, () => {}); } catch {} return r; };
    const o0 = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (...a) {
      this.addEventListener('load', () => { try { if (!this.responseType || this.responseType === 'text') keep(this.responseText); } catch {} });
      return o0.apply(this, a);
    };
    for (const s of document.querySelectorAll('script[type="application/json"]')) keep(s.textContent);
  }
  const groups = [];
  const walk = (o, d = 0) => {
    if (!o || typeof o !== 'object' || d > 60) return;
    if (Array.isArray(o)) { for (const x of o) walk(x, d + 1); return; }
    if (Array.isArray(o.thread_items)) { groups.push(o.thread_items); return; }
    for (const k in o) walk(o[k], d + 1);
  };
  for (const raw of W.__sieveThreads.raw) {
    for (const chunk of raw.replace(/^for \(;;\);/, '').split(/\n(?=\{)/)) { try { walk(JSON.parse(chunk)); } catch {} }
  }
  const best = (m) => (m?.image_versions2?.candidates || []).slice().sort((a, b) => Math.abs((a.width || 0) - 1080) - Math.abs((b.width || 0) - 1080))[0]?.url || '';
  const textOf = (p) => {
    const frags = p.text_post_app_info?.text_fragments?.fragments;
    if (Array.isArray(frags) && frags.length) {
      return frags.map((f) => {
        const t = f.plaintext || '';
        if (f.fragment_type === 'mention' && f.mention_fragment?.mentioned_user?.username) { const u = f.mention_fragment.mentioned_user.username; return { t: 'user', v: t || '@' + u, url: `https://www.threads.com/@${u}` }; }
        if (f.fragment_type === 'link' && f.link_fragment?.uri) return { t: 'link', v: f.link_fragment.display_text || t, url: f.link_fragment.uri };
        if (f.fragment_type === 'tag' || f.tag_fragment) { const tag = (f.tag_fragment?.tag_name || t).replace(/^#/, ''); return { t: 'tag', v: '#' + tag, url: `https://www.threads.com/search?q=${encodeURIComponent(tag)}&serp_type=tags` }; }
        return { t: 'text', v: t };
      }).filter((s) => s.v);
    }
    return p.caption?.text ? [{ t: 'text', v: p.caption.text }] : [];
  };
  const media = (p) => {
    if (Array.isArray(p.carousel_media) && p.carousel_media.length) return p.carousel_media.map(best).filter(Boolean);
    const u = best(p); return u ? [u] : [];
  };
  const url = (p) => `https://www.threads.com/@${p.user?.username}/post/${p.code}`;
  const map = (outer) => {
    const share = outer.text_post_app_info?.share_info || {};
    const p = share.reposted_post || outer; // a repost shows the original post
    const q = share.quoted_post;
    const tp = p.text_post_app_info || {};
    const lp = tp.link_preview_attachment;
    const text = textOf(p);
    return {
      id: 'threads:' + p.pk, source: 'threads', url: url(p),
      handle: p.user?.username || '', name: p.user?.full_name || p.user?.username || '', avatar: p.user?.profile_pic_url || '', verified: !!p.user?.is_verified,
      time: p.taken_at ? p.taken_at * 1000 : null,
      text, plain: text.map((s) => s.v).join(''),
      images: media(p), video: !!(p.video_versions?.length || p.carousel_media?.some((m) => m.video_versions?.length)),
      quote: q ? { handle: q.user?.username || '', name: q.user?.full_name || '', text: textOf(q), images: media(q).slice(0, 1), url: url(q) } : null,
      card: lp?.url ? { url: lp.url, title: lp.title || lp.display_url || '', domain: lp.display_url || '', img: lp.image_url || '' } : null,
      repostedBy: share.reposted_post ? (outer.user?.username || '') : '',
      likes: p.like_count || 0, replies: tp.direct_reply_count || 0, reposts: (tp.repost_count || 0) + (tp.quote_count || 0),
      liked: !!p.has_liked, reposted: false, bookmarked: !!p.has_viewer_saved,
      spoiler: !!tp.is_spoiler_media, promoted: !!(p.injected || p.ad_id || p.ad_metadata),
    };
  };
  const posts = [], seen = new Set();
  for (const g of groups) {
    const first = g.find((ti) => ti?.post)?.post;
    if (!first?.pk || !first.user?.username) continue;
    const m = map(first);
    if (!seen.has(m.id)) { seen.add(m.id); posts.push(m); }
  }
  const loggedOut = [...document.querySelectorAll('a, [role="button"]')].some((e) => /^Log in$/.test(e.textContent.trim()));
  return { url: location.href, signedIn: !loggedOut, posts, note: loggedOut ? 'signed out: public For You feed' : '' };
})
