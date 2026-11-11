// Runs in the Aside REPL on bsky.app/profile/<handle>/post/<rkey>. Given: T, TEXT, ID (rkey), PROBE, out.
// Bluesky keeps stable test ids: likeBtn, replyBtn, postBookmarkBtn, and the repost menu button.
const signedIn = await page.evaluate(() => { try { return !!JSON.parse(localStorage.getItem('BSKY_STORAGE') || 'null')?.session?.currentAccount?.accessJwt; } catch { return false; } });
const main = page.locator('[data-testid^="postThreadItem-by-"]').first();
await main.waitFor({ timeout: 10000 });
const like = main.locator('[data-testid="likeBtn"]').first();
const bm = main.locator('[data-testid="postBookmarkBtn"]').first();
const rp = main.locator('button[aria-label^="Repost or quote"], button[aria-label^="Undo repost or quote"], [data-testid="repostBtn"]').first();
const label = async (l) => ((await l.getAttribute('aria-label').catch(() => '')) || '');
const likedOn = async () => /^Unlike/i.test(await label(like));
const savedOn = async () => /^Remove from saved/i.test(await label(bm));
const repostOn = async () => /^Undo repost/i.test(await label(rp));
if (PROBE) {
  out.signedIn = signedIn;
  out.found = {
    like: (await like.count()) ? { label: await label(like), on: await likedOn() } : null,
    repost: (await rp.count()) ? { label: await label(rp), on: await repostOn() } : null,
    bookmark: (await bm.count()) ? { label: await label(bm), on: await savedOn() } : null,
    reply: (await main.locator('[data-testid="replyBtn"]').count()) ? { label: await label(main.locator('[data-testid="replyBtn"]').first()) } : null,
  };
  out.ok = Object.values(out.found).every(Boolean);
  if (!signedIn) out.note = 'signed out: buttons are there, but acting needs a Bluesky sign-in';
} else {
  if (!signedIn) throw new Error('not signed in to Bluesky in this browser');
  const toggle = async (btn, isOn, want) => { if ((await isOn()) !== want) { await btn.click(); await sleep(1500); } out.ok = (await isOn()) === want; out.state = want; };
  if (T === 'like') await toggle(like, likedOn, true);
  if (T === 'unlike') await toggle(like, likedOn, false);
  if (T === 'bookmark') await toggle(bm, savedOn, true);
  if (T === 'unbookmark') await toggle(bm, savedOn, false);
  if (T === 'repost' || T === 'unrepost') {
    const want = T === 'repost';
    if ((await repostOn()) !== want) { await rp.click(); await sleep(700); await page.getByRole('menuitem', { name: want ? /^Repost$/ : /^Undo repost$/ }).first().click({ timeout: 5000 }); await sleep(1500); }
    out.ok = (await repostOn()) === want;
  }
  if (T === 'quote' || T === 'reply') {
    if (T === 'quote') { await rp.click(); await sleep(700); await page.getByRole('menuitem', { name: /^Quote post$/ }).first().click({ timeout: 5000 }); }
    else await main.locator('[data-testid="replyBtn"]').first().click();
    const box = page.locator('[data-testid="composerTextInput"], [contenteditable="true"]').first();
    await box.click({ timeout: 8000 });
    await page.keyboard.type(TEXT, { delay: 12 });
    await page.locator('[data-testid="composerPublishBtn"]').first().click({ timeout: 5000 });
    await sleep(3000);
    out.ok = (await page.locator('[data-testid="composerPublishBtn"]').count()) === 0;
  }
  if (!out.ok && !out.error) out.error = 'Bluesky did not show the expected state afterwards';
}
