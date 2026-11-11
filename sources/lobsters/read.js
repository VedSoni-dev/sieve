// Runs INSIDE a lobste.rs list page (front page, /newest, /active, /t/<tag>): evaluate `(<this file>)({})`.
// One page holds 25 stories; Sieve reads that page each round.
(async () => {
  const abs = (h) => (h ? new URL(h, 'https://lobste.rs/').href : '');
  const posts = [...document.querySelectorAll('li.story')].map((li) => {
    const id = li.dataset.shortid || li.id.replace(/^story_/, '');
    const a = li.querySelector('.details h2 a.u-url, .details .link a');
    const href = a?.getAttribute('href') || '';
    const own = !href || href.startsWith('/s/');
    const user = li.querySelector('.byline .u-author')?.textContent.trim() || '';
    const t = li.querySelector('time[data-at-unix]');
    const cm = li.querySelector('.comments_label a')?.textContent || '';
    const tags = [...li.querySelectorAll('ul.tags a.tag')].map((x) => x.textContent.trim());
    const domain = li.querySelector('a.domain')?.textContent.trim() || '';
    const title = a?.textContent.trim() || '';
    const saveLink = [...li.querySelectorAll('.byline a')].find((x) => /^(save|unsave)$/i.test(x.textContent.trim()));
    return {
      id: 'lobsters:' + id, source: 'lobsters', url: `https://lobste.rs/s/${id}`,
      handle: user, name: domain || 'lobste.rs', avatar: user ? abs(`/avatars/${user}-32.png`) : '',
      time: t ? Number(t.dataset.atUnix) * 1000 : null, when: t?.textContent.trim() || '',
      title, flair: tags.join(' · '), text: [], plain: `${title}${domain ? ' — ' + domain : ''} [${tags.join(', ')}]`,
      images: [], video: false,
      card: own ? null : { url: abs(href), title, domain, img: '' },
      likes: parseInt(li.querySelector('.upvoter')?.textContent, 10) || 0, replies: parseInt(cm, 10) || 0, reposts: 0,
      liked: li.classList.contains('upvoted'), bookmarked: /^unsave$/i.test(saveLink?.textContent.trim() || ''),
      promoted: false,
    };
  }).filter((p) => p.title);
  const signedIn = !document.querySelector('a.upvoter[href="/login"]') && !!document.querySelector('a[href="/logout"], form[action="/logout"], a[href="/settings"]');
  return { url: location.href, signedIn, posts, stop: true };
})
