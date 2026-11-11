// Runs in the Aside REPL with the post's own page open. Given: T (action), TEXT, ID (native id), PROBE, out.
// Sets out.ok (and out.state); in PROBE mode only reports what it found, never clicks.
if (await page.evaluate(() => !!document.querySelector('a[href*="mode=login"]'))) throw new Error('not signed in to X in this browser');
const post = page.locator('article').filter({ has: page.locator(`a[href$="/status/${ID}"]`) }).first();
await post.waitFor({ timeout: 8000 });
// X serves different markups (data-testid, data-engagement-action, or bare aria-labels). Match by meaning, never by position.
const SEL = {
  like: '[data-testid="like"], [data-testid="unlike"], [data-engagement-action="like"] button, button[aria-label$=". Like"], button[aria-label$=". Liked"]',
  retweet: '[data-testid="retweet"], [data-testid="unretweet"], [data-engagement-action="retweet"] button, button[aria-label$=". Repost"], button[aria-label$=". Reposted"]',
  bookmark: '[data-testid="bookmark"], [data-testid="removeBookmark"], [data-engagement-action="bookmark"] button, button[aria-label$=". Bookmark"], button[aria-label$=". Bookmarked"]',
  reply: '[data-testid="reply"], [data-engagement-action="reply"] a, [data-engagement-action="reply"] button, [aria-label$=". Reply"]',
};
const btn = (action) => post.locator(SEL[action]).first();
const ON = /(^|\. )(Liked|Unlike|Reposted|Undo repost|Bookmarked|Remove Bookmark)/i;
const isOn = async (action) => { const b = btn(action); const p = await b.getAttribute('aria-pressed'); const l = (await b.getAttribute('aria-label')) || ''; const t = (await b.getAttribute('data-testid')) || ''; return p === 'true' || ON.test(l) || /^(unlike|unretweet|removeBookmark)$/.test(t); };
if (PROBE) {
  out.found = {};
  for (const a of ['like', 'retweet', 'bookmark', 'reply']) out.found[a] = (await btn(a).count()) > 0 ? { label: await btn(a).getAttribute('aria-label'), on: a === 'reply' ? null : await isOn(a) } : null;
  out.ok = Object.values(out.found).every(Boolean);
} else {
  const toggle = async (action, want) => { if ((await isOn(action)) !== want) { await btn(action).click(); await sleep(1200); } out.ok = (await isOn(action)) === want; out.state = want; };
  if (T === 'like') await toggle('like', true);
  if (T === 'unlike') await toggle('like', false);
  if (T === 'bookmark') await toggle('bookmark', true);
  if (T === 'unbookmark') await toggle('bookmark', false);
  if (T === 'repost' || T === 'unrepost') {
    const want = T === 'repost';
    if ((await isOn('retweet')) !== want) {
      await btn('retweet').click();
      await page.getByRole('menuitem', { name: want ? /^Repost$/ : /^Undo repost$/ }).first().click({ timeout: 5000 });
      await sleep(1200);
    }
    out.ok = (await isOn('retweet')) === want;
  }
  if (T === 'quote' || T === 'reply') {
    if (T === 'quote') { await btn('retweet').click(); await page.getByRole('menuitem', { name: /^Quote/ }).first().click({ timeout: 5000 }); }
    else await btn('reply').click();
    const dlg = page.locator('[role="dialog"]').last();
    await dlg.getByRole('textbox').first().click({ timeout: 8000 });
    await page.keyboard.type(TEXT, { delay: 15 });
    await dlg.getByRole('button', { name: T === 'quote' ? /^Post$/ : /^Reply$/ }).last().click({ timeout: 5000 });
    await sleep(2500);
    out.ok = !(await dlg.isVisible().catch(() => false));
  }
  if (!out.ok && !out.error) out.error = 'X did not show the expected state afterwards (' + ((await btn(T.includes('bookmark') ? 'bookmark' : T.includes('like') ? 'like' : 'retweet').getAttribute('aria-label').catch(() => '')) || '') + ')';
}
