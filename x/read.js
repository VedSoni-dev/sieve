// Runs INSIDE an x.com page (via your browser tool's "evaluate JS"). Returns the
// posts currently rendered, in a compact shape Sieve understands. X dropped its
// data-testid hooks in 2026, so this reads semantic structure instead.
(() => {
  const abs = (h) => { try { return new URL(h, location.href).href; } catch { return h; } };
  const own = (root, sel) => [...root.querySelectorAll(sel)].filter(el => el.closest('article') === root);
  const tidy = (s) => String(s || '').replace(/\s+\n/g, '\n').trim();

  function segments(div) {
    const out = [];
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) { if (c.textContent) out.push({ t: 'text', v: c.textContent }); continue; }
        if (c.nodeType !== 1 || c.tagName === 'SCRIPT' || c.tagName === 'BUTTON') continue;
        if (c.tagName === 'IMG' && c.alt) { out.push({ t: 'text', v: c.alt }); continue; }
        if (c.tagName === 'A') {
          const href = c.getAttribute('href') || '';
          out.push({ t: href.startsWith('/hashtag') ? 'tag' : href.startsWith('/') ? 'user' : 'link', v: c.textContent.trim(), url: c.title || abs(href) });
          continue;
        }
        walk(c);
      }
    };
    walk(div);
    return out;
  }

  // X post ids are Snowflake ids: creation time is baked in.
  const snowflakeTime = (id) => { try { return Number((BigInt(id) >> 22n) + 1288834974657n); } catch { return null; } };

  const pressed = (a, action) => {
    const el = own(a, `[data-engagement-action="${action}"] button, [data-engagement-action="${action}"] a`)[0];
    if (!el) return false;
    return el.getAttribute('aria-pressed') === 'true' || /^(Unlike|Liked|Undo repost|Reposted|Remove Bookmark|Bookmarked)/i.test(el.getAttribute('aria-label') || '');
  };

  function post(a) {
    const quoteEl = a.querySelector('article');
    const outside = (el) => !quoteEl || !quoteEl.contains(el);
    const handle = (own(a, 'a[href^="/"]').filter(outside).map(l => l.getAttribute('href')).find(h => /^\/\w{1,20}$/.test(h)) || '/').slice(1);
    const statusLink = own(a, `a[href^="/${handle}/status/"]`).filter(outside).find(l => /\/status\/\d+$/.test(l.getAttribute('href')));
    const href = statusLink?.getAttribute('href') || '';
    const name = own(a, `a[href="/${handle}"]`).filter(outside).map(l => l.textContent.trim()).find(t => t && !t.startsWith('@'));
    const textDiv = own(a, 'div[dir="auto"]').filter(outside).find(d => d.querySelector('span') && !d.closest('a'));
    const ts = (statusLink?.parentElement?.innerHTML.match(/"timestamp":(\d+)/) || [])[1];
    const group = own(a, '[role="group"][aria-label]')[0]?.getAttribute('aria-label') || '';
    const n = (k) => Number((group.match(new RegExp(`(\\d+) ${k}`)) || [])[1] || 0);
    const cardA = own(a, 'a[href^="https://t.co"]').filter(outside).find(l => l.querySelector('img'));
    // "X reposted" / "Promoted" / "Ad" labels sit above the author line.
    const labels = own(a, 'span').filter(outside).map(s => s.textContent.trim()).filter(t => t && t.length < 60);
    const repostedBy = (labels.find(t => / reposted$/.test(t)) || '').replace(/ reposted$/, '');
    const id = (href.match(/status\/(\d+)/) || [])[1] || '';
    return {
      id,
      url: abs(href),
      handle, name: name || handle,
      avatar: own(a, 'img[src*="profile_images"]').filter(outside)[0]?.src || '',
      time: ts ? Number(ts) : snowflakeTime(id), when: statusLink?.textContent.trim() || '',
      text: textDiv ? segments(textDiv) : [],
      plain: tidy(textDiv?.innerText),
      truncated: !!(textDiv && [...textDiv.querySelectorAll('button')].some(b => /show more/i.test(b.textContent))),
      images: own(a, 'img[src*="/media/"], img[src*="video_thumb"]').filter(outside).map(i => i.src.replace(/name=\w+/, 'name=medium')),
      video: !!own(a, 'video').filter(outside).length,
      card: cardA ? { url: own(a, 'a[title^="http"]')[0]?.title || cardA.href, title: cardA.innerText.trim().split('\n')[0] || '', img: cardA.querySelector('img')?.src || '',
        domain: (own(a, 'a[href^="https://t.co"] div').map(d => d.textContent).find(t => /^From /.test(t)) || '').replace(/^From /, '') } : null,
      quote: quoteEl ? post(quoteEl) : null,
      repostedBy: repostedBy || null,
      promoted: labels.some(t => t === 'Ad' || t === 'Promoted'),
      replies: n('replies'), reposts: n('reposts'), likes: n('likes'), views: n('views'),
      liked: pressed(a, 'like'), reposted: pressed(a, 'retweet'), bookmarked: pressed(a, 'bookmark'),
    };
  }

  const posts = [...document.querySelectorAll('article')].filter(a => !a.parentElement.closest('article')).map(post).filter(p => p.id);
  return {
    url: location.href,
    signedIn: !document.querySelector('a[href*="mode=login"]') && !/\/login|\/i\/flow/.test(location.pathname),
    posts,
  };
})()
