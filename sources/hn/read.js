// Runs INSIDE a news.ycombinator.com list page: evaluate `(<this file>)({ cursor })`.
// Reads the stories on the page; `cursor` is the next page's URL (fetched in the page, same session).
// Job posts ("X is hiring") come back with promoted: true.
(async (opts = {}) => {
  let doc = document, url = location.href;
  if (opts.cursor) { const r = await fetch(opts.cursor, { credentials: 'include' }); doc = new DOMParser().parseFromString(await r.text(), 'text/html'); url = opts.cursor; }
  const posts = [];
  for (const row of doc.querySelectorAll('tr.athing')) {
    if (row.classList.contains('comtr')) continue;
    const link = row.querySelector('.titleline > a');
    if (!link) continue;
    const sub = row.nextElementSibling?.querySelector('.subtext');
    const n = (re) => parseInt((sub?.textContent.match(re) || [])[1] || '0', 10);
    const href = link.getAttribute('href') || '';
    const abs = new URL(href, 'https://news.ycombinator.com/').href;
    const own = /^item\?id=/.test(href);
    const site = row.querySelector('.sitestr')?.textContent || '';
    const ts = sub?.querySelector('.age')?.getAttribute('title') || '';
    const time = Date.parse(ts.split(' ')[0] + (ts.includes('T') && !/Z$/.test(ts.split(' ')[0]) ? 'Z' : '')) || null;
    const voted = !!row.querySelector('.votearrow') && !!row.querySelector('a[id^="up_"].nosee');
    posts.push({
      id: 'hn:' + row.id, source: 'hn', url: 'https://news.ycombinator.com/item?id=' + row.id,
      handle: sub?.querySelector('.hnuser, a[href^="user?id="]')?.textContent || '', name: site || 'news.ycombinator.com',
      avatar: '', time, when: sub?.querySelector('.age a')?.textContent || '',
      title: link.textContent.trim(), text: [], plain: link.textContent.trim() + (site ? ' — ' + site : ''),
      images: [], video: false,
      card: own ? null : { url: abs, title: link.textContent.trim(), domain: site, img: '' },
      likes: n(/(\d+)\s+points?/), replies: n(/(\d+)\s*(?:&nbsp;|\s)comments?/), reposts: 0,
      liked: voted, bookmarked: false,
      promoted: !sub?.querySelector('.score') && /hiring|is looking for/i.test(link.textContent),
    });
  }
  const more = doc.querySelector('a.morelink')?.getAttribute('href');
  return { url, signedIn: !!document.querySelector('#me'), posts, cursor: more ? new URL(more, 'https://news.ycombinator.com/').href : null };
})
