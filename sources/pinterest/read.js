// Runs INSIDE a pinterest.com feed page (your home feed, a board, a search): evaluate `(<this file>)({ page })`.
// Pinterest ships pins as JSON: the first ones inside the page, the rest from its own feed requests as you
// scroll. The first call installs a listener that keeps those responses (nothing is sent anywhere); every call
// returns all pins seen so far.
(async (opts = {}) => {
  const W = window;
  const pins = (W.__sievePins ||= new Map());
  const take = (o, d = 0) => {
    if (!o || typeof o !== 'object' || d > 40) return;
    if (Array.isArray(o)) { for (const x of o) take(x, d + 1); return; }
    if (o.type === 'pin' && o.id && o.images && !pins.has(o.id)) pins.set(o.id, o);
    for (const k in o) if (o[k] && typeof o[k] === 'object') take(o[k], d + 1);
  };
  if (!W.__sievePinsHooked) {
    W.__sievePinsHooked = true;
    const keep = (t) => { if (typeof t === 'string' && t.includes('"resource_response"')) { try { take(JSON.parse(t)); } catch {} } };
    const f0 = W.fetch;
    W.fetch = async (...a) => { const r = await f0(...a); try { r.clone().text().then(keep, () => {}); } catch {} return r; };
    const o0 = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (...a) { this.addEventListener('load', () => { try { if (!this.responseType || this.responseType === 'text') keep(this.responseText); } catch {} }); return o0.apply(this, a); };
    for (const s of document.querySelectorAll('script#__PWS_DATA__, script#__PWS_INITIAL_PROPS__')) { try { take(JSON.parse(s.textContent)); } catch {} }
  }
  const signedIn = !!document.querySelector('[data-test-id="header-profile"], [data-test-id="boards-tab"], a[href*="/_saved/"]') || /"isAuthenticated":true/.test(document.getElementById('__PWS_DATA__')?.textContent || '');
  const img = (p) => p.images?.['736x']?.url || p.images?.['564x']?.url || p.images?.orig?.url || p.images?.['474x']?.url || '';
  const posts = [...pins.values()].map((p) => {
    const desc = (p.description || '').trim(), title = (p.title || p.grid_title || '').trim();
    const reacts = Object.values(p.reaction_counts || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    const ext = p.link && !/pinterest\./.test(p.link) && !/^Uploaded by/i.test(p.domain || '') ? p.link : '';
    const who = p.native_creator || p.pinner || {};
    return {
      id: 'pinterest:' + p.id, source: 'pinterest', url: `https://www.pinterest.com/pin/${p.id}/`,
      handle: who.username || '', name: who.full_name || who.username || 'Pinterest', avatar: who.image_small_url || who.image_medium_url || '',
      time: null, pinnedAt: Date.parse(p.created_at) || null, // a pin's date is when it was first pinned, often long ago: sort pins by when Sieve saw them
      title, text: desc && desc !== title ? [{ t: 'text', v: desc.slice(0, 600) }] : [],
      plain: [title, desc, p.auto_alt_text && `[image: ${p.auto_alt_text}]`].filter(Boolean).join(' · ') || '[image]',
      alt: p.auto_alt_text || '',
      images: [img(p)].filter(Boolean), video: !!p.is_video,
      card: ext ? { url: ext, title: title || p.domain || ext, domain: p.domain || '', img: '' } : null,
      context: p.board?.name ? `on ${p.board.name}` : '',
      likes: reacts, replies: Number(p.comment_count) || 0, reposts: 0,
      liked: false, bookmarked: false,
      promoted: !!(p.is_promoted || p.is_downstream_promotion || p.promoter || p.ad_match_reason),
    };
  });
  return { url: location.href, signedIn, posts, note: signedIn ? '' : 'signed out: Pinterest shows little without an account' };
})
