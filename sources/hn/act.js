// Runs in the Aside REPL on news.ycombinator.com/item?id=<id>. Given: T (like|unlike|bookmark|unbookmark|reply), TEXT, ID, PROBE, out.
const me = await page.evaluate(() => document.querySelector('#me')?.textContent || null);
const up = page.locator(`a#up_${ID}`).first();
const un = page.locator(`#unv_${ID} a`).first();
const voted = async () => (await un.count()) > 0 && /unvote/i.test((await un.textContent()) || '');
const fav = page.locator('.fatitem a[href^="fave?"]').first();
const favOn = async () => /un-favorite/i.test(((await fav.textContent().catch(() => '')) || ''));
if (PROBE) {
  out.signedIn = !!me;
  out.found = {
    like: { found: (await page.locator(`#up_${ID}, #unv_${ID}`).count()) > 0, on: await voted() },
    bookmark: { found: (await fav.count()) > 0, on: await favOn(), note: me ? '' : 'favorite shows once signed in' },
    reply: { found: (await page.locator('form[action="comment"] textarea').count()) > 0 },
  };
  out.ok = out.found.like.found && (out.found.reply.found || !me);
  if (!me) out.note = 'signed out: upvote and comment need a Hacker News sign-in';
} else {
  if (!me) throw new Error('not signed in to Hacker News in this browser');
  if (T === 'like') { if (!(await voted())) { await up.click(); await sleep(1500); } out.ok = await voted(); out.state = true; }
  if (T === 'unlike') { if (await voted()) { await un.click(); await sleep(1500); } out.ok = !(await voted()); out.state = false; }
  if (T === 'bookmark' || T === 'unbookmark') {
    const want = T === 'bookmark';
    if ((await favOn()) !== want) { await fav.click(); await sleep(1500); await page.goto(`https://news.ycombinator.com/item?id=${ID}`); await sleep(1500); }
    out.ok = (await favOn()) === want; out.state = want;
  }
  if (T === 'reply') {
    await page.locator('form[action="comment"] textarea').first().click();
    await page.keyboard.type(TEXT, { delay: 10 });
    await page.locator('form[action="comment"] input[type="submit"]').first().click();
    await sleep(2500);
    const first = TEXT.slice(0, 40);
    out.ok = await page.evaluate(([u, t]) => [...document.querySelectorAll('.comtr')].some((c) => c.querySelector('.hnuser')?.textContent === u && c.querySelector('.commtext')?.textContent.includes(t)), [me, first]);
  }
  if (!out.ok && !out.error) out.error = 'Hacker News did not show the expected state afterwards';
}
