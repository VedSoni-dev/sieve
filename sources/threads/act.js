// Runs in the Aside REPL on threads.com/@user/post/<code>. Given: T, TEXT, ID (post code), PROBE, out.
// The first post on the page is the one the URL names. Threads names its buttons only by the SVG <title>
// inside them (Like / Unlike, Comment, Repost, Share, More), so we tag them with data-sieve and click those.
// Repost and Quote live in the Repost menu; Save lives in the More menu.
const loggedOut = await page.evaluate(() => [...document.querySelectorAll('a, [role="button"]')].some((e) => /^Log in$/.test(e.textContent.trim())));
await page.locator('[data-pressable-container]').first().waitFor({ timeout: 12000 });
const names = () => page.evaluate(() => {
  const main = document.querySelector('[data-pressable-container]');
  document.querySelectorAll('[data-sieve]').forEach((e) => e.removeAttribute('data-sieve'));
  const got = [];
  for (const b of main.querySelectorAll('[role="button"]')) {
    const t = [...b.querySelectorAll('svg')].map((s) => s.getAttribute('aria-label') || s.querySelector('title')?.textContent || '').find(Boolean);
    if (t && !got.includes(t)) { b.setAttribute('data-sieve', t.toLowerCase()); got.push(t); }
  }
  return got;
});
const btn = (n) => page.locator(`[data-sieve="${n}"]`).first();
// a visible menu item (or dialog button) whose text is exactly one of these words
const item = async (re) => {
  const found = await page.evaluate((src) => {
    const re = new RegExp(src, 'i');
    document.querySelectorAll('[data-sieve-item]').forEach((e) => e.removeAttribute('data-sieve-item'));
    const main = document.querySelector('[data-pressable-container]');
    const els = [...document.querySelectorAll('[role="menuitem"], [role="menu"] [role="button"], [role="dialog"] [role="button"], div[role="button"]')]
      .filter((e) => e.offsetParent !== null && !main?.contains(e) && re.test((e.innerText || '').trim()));
    const e = els[els.length - 1];
    if (e) e.setAttribute('data-sieve-item', '1');
    return e ? e.innerText.trim() : null;
  }, re.source);
  return found ? page.locator('[data-sieve-item]').first() : null;
};
const menu = async (which, re) => { await btn(which).click(); await sleep(900); return item(re); };
const closeMenu = async () => { await page.keyboard.press('Escape'); await sleep(400); };
const liked = async () => (await names()).includes('Unlike');
// the Repost menu offers "Remove" once you've reposted; the More menu offers "Unsave" once saved
const menuState = async (which, onRe) => { await names(); const on = await item(onRe); if (on) return true; const m = await menu(which, onRe); await closeMenu(); return !!m; };

if (PROBE) {
  const n = await names();
  out.signedIn = !loggedOut;
  out.found = {
    like: n.includes('Like') || n.includes('Unlike') ? { on: n.includes('Unlike') } : null,
    reply: n.includes('Comment') ? { found: true } : null,
    repost: n.includes('Repost') ? { found: true } : null,
    bookmark: n.includes('More') ? { found: true, note: 'Save is in the More menu' } : null,
  };
  out.ok = Object.values(out.found).every(Boolean);
  if (loggedOut) out.note = 'signed out: buttons are there, but acting needs a Threads sign-in';
  else {
    out.found.repost.on = await menuState('repost', /^(Remove|Undo repost)$/);
    out.found.bookmark.on = await menuState('more', /^Unsave$/);
  }
} else {
  if (loggedOut) throw new Error('not signed in to Threads in this browser');
  await names();
  if (T === 'like' || T === 'unlike') {
    const want = T === 'like';
    if ((await liked()) !== want) { await btn(want ? 'like' : 'unlike').click(); await sleep(1500); }
    out.ok = (await liked()) === want;
  }
  if (T === 'repost' || T === 'unrepost') {
    const want = T === 'repost';
    const m = await menu('repost', want ? /^Repost$/ : /^(Remove|Undo repost)$/);
    if (m) { await m.click(); await sleep(1800); } else await closeMenu();
    out.ok = (await menuState('repost', /^(Remove|Undo repost)$/)) === want;
  }
  if (T === 'bookmark' || T === 'unbookmark') {
    const want = T === 'bookmark';
    const m = await menu('more', want ? /^Save$/ : /^Unsave$/);
    if (m) { await m.click(); await sleep(1500); } else await closeMenu();
    out.ok = (await menuState('more', /^Unsave$/)) === want;
  }
  if (T === 'quote' || T === 'reply') {
    if (T === 'quote') { const m = await menu('repost', /^Quote$/); if (!m) throw new Error('no Quote in the Repost menu'); await m.click(); }
    else await btn('comment').click();
    await sleep(1200);
    const box = page.locator('[role="dialog"] [contenteditable="true"], [contenteditable="true"][role="textbox"]').first();
    await box.click({ timeout: 8000 });
    await page.keyboard.type(TEXT, { delay: 14 });
    await sleep(500);
    const post = await item(/^Post$/);
    if (!post) throw new Error('no Post button in the composer');
    await post.click();
    await sleep(3500);
    out.ok = (await page.locator('[role="dialog"] [contenteditable="true"]').count()) === 0;
  }
  if (!out.ok && !out.error) out.error = 'Threads did not show the expected state afterwards';
}
