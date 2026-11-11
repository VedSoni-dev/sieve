// Runs INSIDE a Mastodon page (your server, e.g. mastodon.social): evaluate `(<this file>)({ cursor })`.
// Signed in: your home timeline, through Mastodon's own API with the web app's session (the token stays in the page).
// Signed out: the server's trending posts.
(async (opts = {}) => {
  const host = location.host;
  let token = null;
  try { token = JSON.parse(document.getElementById('initial-state')?.textContent || '{}').meta?.access_token || null; } catch {}
  const signedIn = !!token;
  const path = signedIn
    ? `/api/v1/timelines/home?limit=40${opts.cursor ? '&max_id=' + opts.cursor : ''}`
    : `/api/v1/trends/statuses?limit=40&offset=${opts.cursor || 0}`;
  const r = await fetch(path, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
  if (!r.ok) return { url: location.href, signedIn, posts: [], cursor: null, note: `Mastodon said ${r.status}` };
  const list = await r.json();
  const segs = (html) => {
    const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
    const out = [];
    const push = (s) => { if (!s.v) return; const last = out[out.length - 1]; if (s.t === 'text' && last?.t === 'text') last.v += s.v; else out.push(s); };
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { push({ t: 'text', v: c.textContent }); continue; }
        if (c.nodeType !== 1 || c.classList.contains('invisible') || c.classList.contains('quote-inline')) continue;
        if (c.tagName === 'BR') { push({ t: 'text', v: '\n' }); continue; }
        if (c.tagName === 'A') {
          const href = c.getAttribute('href') || '';
          const v = [...c.childNodes].filter((x) => !(x.nodeType === 1 && x.classList.contains('invisible'))).map((x) => x.textContent).join('');
          if (c.classList.contains('mention') && c.classList.contains('hashtag')) push({ t: 'tag', v, url: href });
          else if (c.classList.contains('mention') || c.classList.contains('u-url')) push({ t: 'user', v, url: href });
          else push({ t: 'link', v: v + (c.querySelector('.ellipsis') ? '…' : ''), url: href });
          continue;
        }
        walk(c);
        if (c.tagName === 'P' && c.nextElementSibling) push({ t: 'text', v: '\n\n' });
      }
    };
    walk(doc.body.firstChild);
    return out;
  };
  const acct = (a) => (a?.acct || '').includes('@') ? a.acct : `${a?.acct}`;
  const media = (s) => (s.media_attachments || []).filter((m) => m.type !== 'audio').map((m) => m.preview_url || m.url).filter(Boolean);
  const local = (s) => `https://${host}/@${acct(s.account)}/${s.id}`;
  const posts = list.map((outer) => {
    const s = outer.reblog || outer;
    const q = s.quote?.quoted_status || (s.quote?.state === 'accepted' ? s.quote.quoted_status : null);
    const text = segs(s.content);
    return {
      id: `mastodon:${s.id}`, source: 'mastodon', url: local(s), originalUrl: s.url || s.uri,
      handle: acct(s.account), name: s.account?.display_name || s.account?.username || '', avatar: s.account?.avatar_static || s.account?.avatar || '',
      time: Date.parse(s.created_at) || null,
      text, plain: text.map((x) => x.v).join(''),
      images: media(s).slice(0, 4), video: (s.media_attachments || []).some((m) => m.type === 'video' || m.type === 'gifv'),
      quote: q ? { handle: acct(q.account), name: q.account?.display_name || '', text: segs(q.content), images: media(q).slice(0, 1), url: q.url || q.uri } : null,
      card: s.card?.url && !media(s).length ? { url: s.card.url, title: s.card.title || '', domain: s.card.provider_name || (() => { try { return new URL(s.card.url).host; } catch { return ''; } })(), img: s.card.image || '' } : null,
      repostedBy: outer.reblog ? (outer.account?.display_name || outer.account?.acct || '') : '',
      context: s.spoiler_text ? `CW: ${s.spoiler_text}` : '',
      likes: s.favourites_count || 0, replies: s.replies_count || 0, reposts: s.reblogs_count || 0,
      liked: !!s.favourited, reposted: !!s.reblogged, bookmarked: !!s.bookmarked,
      nsfw: !!s.sensitive && !s.spoiler_text, spoiler: !!s.spoiler_text, bot: !!s.account?.bot, promoted: false,
    };
  });
  const cursor = !list.length ? null : signedIn ? list[list.length - 1].id : (Number(opts.cursor) || 0) + list.length;
  return { url: location.href, signedIn, posts, cursor, note: signedIn ? '' : 'signed out: trending posts' };
})
