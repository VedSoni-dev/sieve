// Runs INSIDE a linkedin.com page: evaluate `(<this file>)({ cursor })`. LinkedIn's 2026 web feed hides
// post ids in the page, so this reads the same feed from LinkedIn's own API (updatesV2) with the page's
// session and CSRF cookie. The session never leaves the page. Returns { url, signedIn, posts, cursor }.
(async (opts = {}) => {
  const csrf = (document.cookie.match(/JSESSIONID="?([^";]+)/) || [])[1];
  if (!csrf) return { url: location.href, signedIn: false, posts: [], note: 'not signed in to LinkedIn', stop: true };
  const start = Number(opts.cursor || 0);
  const res = await fetch(`/voyager/api/feed/updatesV2?q=feed&count=20&start=${start}&moduleKey=home-feed%3Adesktop`, {
    headers: { 'csrf-token': csrf, accept: 'application/vnd.linkedin.normalized+json+2.1', 'x-restli-protocol-version': '2.0.0' }, credentials: 'include' });
  if (!res.ok) return { url: location.href, signedIn: res.status !== 401 && res.status !== 403, posts: [], note: `linkedin said ${res.status}`, stop: true };
  const j = await res.json();
  const byUrn = new Map((j.included || []).map((x) => [x.entityUrn, x]));
  const ref = (v) => (typeof v === 'string' ? byUrn.get(v) : v);
  const pick = (o, k) => (o ? (o[k] !== undefined ? o[k] : ref(o['*' + k])) : undefined);
  const img = (vi) => { vi = vi?.vectorImage || vi; if (!vi?.rootUrl || !vi.artifacts?.length) return ''; const a = [...vi.artifacts].sort((x, y) => y.width - x.width)[0]; return vi.rootUrl + a.fileIdentifyingUrlPathSegment; };
  const attrImg = (image) => { for (const at of image?.attributes || []) { if (at.vectorImage) return img(at.vectorImage); const mp = pick(at, 'miniProfile') || pick(at, 'miniCompany'); if (mp) return img(mp.picture || mp.logo); } return ''; };
  const txt = (t) => (t && (t.text || t.accessibilityText)) || '';
  const ago = (s) => { const m = String(s || '').match(/(\d+)\s*(m|h|d|w|mo|y)\b/); if (!m) return null; const sec = { m: 60, h: 3600, d: 86400, w: 604800, mo: 2592000, y: 31536000 }[m[2]]; return Date.now() - Number(m[1]) * sec * 1000; };
  const posts = [];
  for (const u of (j.included || []).filter((x) => /render\.UpdateV2$/.test(x.$type))) {
    const urn = u.updateMetadata?.urn || '';
    const id = (urn.match(/activity:(\d+)/) || [])[1];
    if (!id) continue;
    const actor = u.actor;
    if (!actor) continue; // follow suggestions and aggregated cards, not posts
    const sub = txt(actor.subDescription);
    const c = u.content || {};
    const kind = (c.$type || '').split('.').pop();
    const imgC = kind === 'ImageComponent' ? c : null;
    const art = kind === 'ArticleComponent' ? c : null;
    const vid = kind === 'LinearVideoComponent' ? c : null;
    const doc = kind === 'DocumentComponent' ? c : null;
    const vpm = vid ? pick(vid, 'videoPlayMetadata') : null;
    const images = imgC ? (imgC.images || []).map((im) => attrImg(im)).filter(Boolean).slice(0, 4) : vpm?.thumbnail ? [img(vpm.thumbnail)] : doc?.document?.coverPages?.pagesPerResolution?.[0]?.imageUrls?.slice(0, 1) || [];
    const sd = pick(u, 'socialDetail');
    const counts = sd ? pick(sd, 'totalSocialActivityCounts') : null;
    const reshare = u.resharedUpdate ? ref(u.resharedUpdate) || u.resharedUpdate : null;
    const text = txt(u.commentary?.text);
    const promoted = /Promoted/i.test(sub + ' ' + txt(actor.description)) || !!u.updateMetadata?.trackingData?.sponsoredTracking;
    const handleUrl = actor.navigationContext?.actionTarget || '';
    posts.push({
      id: 'linkedin:' + id, source: 'linkedin', url: `https://www.linkedin.com/feed/update/urn:li:activity:${id}/`,
      handle: (handleUrl.match(/linkedin\.com\/(?:in|company)\/([^/?]+)/) || [])[1] || '', name: txt(actor.name), headline: txt(actor.description),
      avatar: attrImg(actor.image), time: ago(sub), when: sub.split('•')[0].trim(),
      context: txt(u.header?.text) || null,
      text: text ? [{ t: 'text', v: text.slice(0, 2500) }] : [], plain: [text, art ? txt(art.title) : '', reshare ? txt(reshare.commentary?.text) : ''].filter(Boolean).join('\n'),
      truncated: text.length > 2500,
      images, video: !!vid, card: art ? { url: art.navigationContext?.actionTarget || '', title: txt(art.title), domain: txt(art.subtitle), img: attrImg(art.largeImage) || attrImg(art.smallImage) } : doc ? { url: `https://www.linkedin.com/feed/update/urn:li:activity:${id}/`, title: doc.document?.title || 'Document', domain: 'PDF', img: images[0] || '' } : null,
      quote: reshare && reshare.actor ? { name: txt(reshare.actor.name), handle: '', text: [{ t: 'text', v: txt(reshare.commentary?.text).slice(0, 800) }], url: '' } : null,
      likes: counts?.numLikes || 0, replies: counts?.numComments || 0, reposts: counts?.numShares || 0,
      liked: !!(counts?.liked || sd?.liked), bookmarked: !!pick(pick(u, 'updateActions') || {}, 'saveAction')?.saved,
      promoted,
    });
  }
  const next = start + (j.data?.paging?.count || 20);
  return { url: location.href, signedIn: true, posts, cursor: next < (j.data?.paging?.total || 0) ? String(next) : null };
})
