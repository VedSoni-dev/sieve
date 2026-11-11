// Runs INSIDE a tiktok.com feed page (For You or Following): evaluate `(<this file>)({ page })`.
// TikTok puts the first videos in the page's own data and loads the rest as you move to the next video.
// The first call installs a listener that keeps the item lists the page itself fetches; later calls move
// to the next video a few times so TikTok loads more. Returns every video seen so far.
(async (opts = {}) => {
  const W = window;
  const scope = (() => { try { return JSON.parse(document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__')?.textContent || '{}').__DEFAULT_SCOPE__ || {}; } catch { return {}; } })();
  if (!W.__sieveTikTok) {
    const S = (W.__sieveTikTok = { items: [] });
    const keep = (t) => { if (typeof t !== 'string' || !t.includes('itemList')) return; try { S.items.push(...(JSON.parse(t).itemList || [])); } catch {} };
    const f0 = W.fetch;
    W.fetch = async (...a) => { const r = await f0(...a); try { r.clone().text().then(keep, () => {}); } catch {} return r; };
    const o0 = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (...a) { this.addEventListener('load', () => { try { if (!this.responseType || this.responseType === 'text') keep(this.responseText); } catch {} }); return o0.apply(this, a); };
    S.items.push(...(scope['webapp.updated-items'] || []), ...(scope['webapp.video-detail']?.itemInfo?.itemStruct ? [scope['webapp.video-detail'].itemInfo.itemStruct] : []));
  }
  const signedIn = !!scope['webapp.app-context']?.user || (!document.querySelector('[data-e2e="top-login-button"]') && !!document.querySelector('[data-e2e="nav-profile"]'));
  const walled = () => !!document.querySelector('[data-e2e="login-modal"]');
  if (opts.page > 0 && !walled()) {
    for (let i = 0; i < 5 && !walled(); i++) {
      const next = document.querySelector('[data-e2e="feed-navigation-next"]');
      if (next) next.click(); else W.scrollBy(0, innerHeight);
      await new Promise((r) => setTimeout(r, 1300));
    }
  }
  const dur = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : '');
  const segs = (x) => {
    const d = x.desc || '';
    const marks = (x.textExtra || []).filter((e) => e.end > e.start).sort((a, b) => a.start - b.start);
    const out = []; let at = 0;
    for (const e of marks) {
      if (e.start < at) continue;
      if (e.start > at) out.push({ t: 'text', v: d.slice(at, e.start) });
      const v = d.slice(e.start, e.end);
      if (e.hashtagName) out.push({ t: 'tag', v, url: `https://www.tiktok.com/tag/${encodeURIComponent(e.hashtagName)}` });
      else if (e.userUniqueId) out.push({ t: 'user', v, url: `https://www.tiktok.com/@${e.userUniqueId}` });
      else out.push({ t: 'text', v });
      at = e.end;
    }
    if (at < d.length) out.push({ t: 'text', v: d.slice(at) });
    return out.filter((s) => s.v);
  };
  const n = (v) => Number(v) || 0;
  const posts = [], seen = new Set();
  for (const x of W.__sieveTikTok.items) {
    if (!x?.id || !x.author?.uniqueId || seen.has(x.id)) continue;
    seen.add(x.id);
    const photos = x.imagePost?.images?.map((i) => i.imageURL?.urlList?.[0]).filter(Boolean) || [];
    const text = segs(x);
    posts.push({
      id: 'tiktok:' + x.id, source: 'tiktok', url: `https://www.tiktok.com/@${x.author.uniqueId}/${photos.length ? 'photo' : 'video'}/${x.id}`,
      handle: x.author.uniqueId, name: x.author.nickname || x.author.uniqueId, avatar: x.author.avatarThumb || '', verified: !!x.author.verified,
      time: x.createTime ? n(x.createTime) * 1000 : null,
      text, plain: text.map((s) => s.v).join(''),
      images: photos.length ? photos.slice(0, 4) : [x.video?.cover || x.video?.originCover].filter(Boolean),
      video: !photos.length, duration: dur(n(x.video?.duration)), portrait: (x.video?.height || 0) > (x.video?.width || 0),
      context: x.music?.title && !x.music?.original ? `♫ ${x.music.title}${x.music.authorName ? ' · ' + x.music.authorName : ''}` : '',
      likes: n(x.statsV2?.diggCount ?? x.stats?.diggCount), replies: n(x.statsV2?.commentCount ?? x.stats?.commentCount),
      reposts: n(x.statsV2?.shareCount ?? x.stats?.shareCount), views: n(x.statsV2?.playCount ?? x.stats?.playCount),
      liked: !!x.digged, bookmarked: !!x.collected,
      promoted: !!x.isAd, aiGenerated: x.IsAigc === true || !!x.AIGCDescription, // TikTok's own "AI-generated" label
    });
  }
  return { url: location.href, signedIn, posts, cursor: walled() && opts.page > 0 ? null : 'next', note: signedIn ? '' : 'signed out: TikTok shows a few videos, then asks you to log in' };
})
