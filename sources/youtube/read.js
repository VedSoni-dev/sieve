// Runs INSIDE a youtube.com page (home, subscriptions, a channel's videos): evaluate `(<this file>)({})`.
// Reads the video tiles currently rendered (2026 markup: yt-lockup-view-model). Ads come back with
// promoted: true so the agent can sift them out. Shorts and auto-generated Mixes (YouTube's own
// radio playlists, i.e. the algorithm itself) are skipped.
((opts = {}) => {
  const num = (label) => {
    const m = String(label || '').replace(/,/g, '').match(/([\d.]+)\s*(thousand|million|billion|K|M|B)?/i);
    if (!m) return 0;
    const mult = { thousand: 1e3, k: 1e3, million: 1e6, m: 1e6, billion: 1e9, b: 1e9 }[(m[2] || '').toLowerCase()] || 1;
    return Math.round(parseFloat(m[1]) * mult);
  };
  const ago = (s) => {
    const m = String(s || '').match(/(\d+)\s*(second|sec|s|minute|min|m(?!o)|hour|hr|h|day|d|week|wk|w|month|mo|year|yr|y)/i);
    if (!m) return null;
    const unit = m[2].toLowerCase()[0] === 'm' ? (/^mo/.test(m[2].toLowerCase()) ? 'mo' : 'm') : m[2].toLowerCase()[0];
    const sec = { s: 1, m: 60, h: 3600, d: 86400, w: 604800, mo: 2592000, y: 31536000 }[unit] || 0;
    return Date.now() - Number(m[1]) * sec * 1000;
  };
  const posts = [];
  for (const l of document.querySelectorAll('yt-lockup-view-model')) {
    const ad = !!l.closest('ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer');
    const link = l.querySelector('a[href*="/watch?v="], a[href*="video_id="]');
    if (!link) continue;
    const href = link.getAttribute('href') || '';
    const vid = (href.match(/[?&](?:v|video_id)=([\w-]{11})/) || [])[1];
    if (!vid) continue;
    const titleEl = l.querySelector('.ytLockupMetadataViewModelTitle, h3[title], h3');
    const title = (titleEl?.textContent || l.querySelector('h3')?.getAttribute('title') || (ad ? l.innerText.split('\n').map((x) => x.trim()).find((x) => x && !/^(Sponsored|Watch|Sign up|Learn more|\d+:\d+)$/i.test(x)) : '') || '').trim();
    const ch = l.querySelector('.ytContentMetadataViewModelMetadataRow a[href^="/@"], .ytContentMetadataViewModelMetadataRow a[href^="/channel/"]');
    const chLabel = (l.querySelector('[aria-label^="Go to channel"]')?.getAttribute('aria-label') || '').replace(/^Go to channel\s*/, '');
    const isMix = /^Mix$/i.test(l.querySelector('.ytBadgeShapeText')?.textContent.trim() || '') || /^Mix - /.test(title);
    const parts = [...l.querySelectorAll('.ytContentMetadataViewModelMetadataText')].map((s) => ({ t: s.textContent.trim(), a: s.getAttribute('aria-label') || '' }));
    const viewsPart = parts.find((p) => /views?|watching/i.test(p.a) || /views?/i.test(p.t));
    const agePart = parts.find((p) => /ago|Streamed|Premiered/i.test(p.t));
    if (isMix) continue;
    const thumbImg = l.querySelector('.ytThumbnailViewModelImage img')?.getAttribute('src') || '';
    const duration = l.querySelector('.ytBadgeShapeText')?.textContent.trim() || '';
    posts.push({
      id: 'youtube:' + vid, source: 'youtube', url: 'https://www.youtube.com/watch?v=' + vid,
      handle: ch ? (ch.getAttribute('href') || '').replace(/^\/(@|channel\/)/, '') : '', name: ch?.textContent.trim() || chLabel || (ad ? 'Sponsored' : isMix ? 'YouTube Mix' : ''),
      avatar: l.querySelector('.ytLockupMetadataViewModelAvatar img, yt-avatar-shape img')?.getAttribute('src') || '',
      time: ago(agePart?.t), when: agePart?.t || '',
      title, text: [], plain: [title, ch?.textContent.trim() || chLabel].filter(Boolean).join(' — '),
      images: [/^https:\/\/i\d*\.ytimg\.com\//.test(thumbImg) ? thumbImg : `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`],
      video: true, duration, live: /LIVE/i.test(duration) || /watching/i.test(viewsPart?.a || ''),
      views: num(viewsPart?.a || viewsPart?.t), likes: 0, replies: 0, reposts: 0,
      liked: false, bookmarked: false, promoted: ad,
    });
  }
  return { url: location.href, signedIn: !!document.querySelector('#avatar-btn'), posts };
})
