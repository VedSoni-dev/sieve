// Runs in the Aside REPL on tiktok.com/@user/video/<id>. Given: T, TEXT, ID (video id), PROBE, out.
// The first video on the page is the one the URL names. TikTok's buttons carry stable test ids:
// like-icon (aria-pressed), favorite-icon ("Add to Favorites" / "Remove from Favorites"), comment-icon.
const signedIn = await page.evaluate(() => { try { return !!JSON.parse(document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__').textContent).__DEFAULT_SCOPE__['webapp.app-context']?.user; } catch { return !document.querySelector('[data-e2e="top-login-button"]'); } });
const like = page.locator('[data-e2e="like-icon"]').first();
const fav = page.locator('[data-e2e="favorite-icon"]').first();
const comment = page.locator('[data-e2e="comment-icon"]').first();
await like.waitFor({ timeout: 12000 });
const pressed = (l) => l.evaluate((e) => (e.closest('[aria-pressed]')?.getAttribute('aria-pressed') || e.getAttribute('aria-pressed')) === 'true');
const likedOn = () => pressed(like);
const savedOn = async () => (await pressed(fav)) || /^(Remove|Added)/i.test((await fav.getAttribute('aria-label')) || '');
const pause = () => page.evaluate(() => document.querySelectorAll('video').forEach((v) => { v.pause(); v.muted = true; }));
await pause();
if (PROBE) {
  out.signedIn = signedIn;
  out.found = {
    like: (await like.count()) ? { on: await likedOn(), label: (await like.getAttribute('aria-label') || '').replace(/\s+/g, ' ') } : null,
    bookmark: (await fav.count()) ? { on: await savedOn(), label: await fav.getAttribute('aria-label') } : null,
    reply: (await comment.count()) ? { found: true } : null,
  };
  out.ok = Object.values(out.found).every(Boolean);
  if (!signedIn) out.note = 'signed out: buttons are there, but acting needs a TikTok sign-in';
} else {
  if (!signedIn) throw new Error('not signed in to TikTok in this browser');
  const toggle = async (btn, isOn, want) => { if ((await isOn()) !== want) { await btn.click(); await sleep(1600); } out.ok = (await isOn()) === want; };
  if (T === 'like') await toggle(like, likedOn, true);
  if (T === 'unlike') await toggle(like, likedOn, false);
  if (T === 'bookmark') await toggle(fav, savedOn, true);
  if (T === 'unbookmark') await toggle(fav, savedOn, false);
  if (T === 'reply') {
    await comment.click(); await sleep(1500); await pause();
    const box = page.locator('[data-e2e="comment-input"] [contenteditable="true"], [data-e2e="comment-text"] [contenteditable="true"], [contenteditable="true"]').first();
    await box.click({ timeout: 8000 });
    await page.keyboard.type(TEXT, { delay: 16 });
    await sleep(500);
    await page.locator('[data-e2e="comment-post"]').first().click({ timeout: 5000 });
    await sleep(3000);
    const first = TEXT.slice(0, 40);
    out.ok = await page.evaluate((t) => [...document.querySelectorAll('[data-e2e^="comment-level"], [data-e2e="comment-item"]')].some((c) => (c.textContent || '').includes(t)), first);
  }
  if (!out.ok && !out.error) out.error = 'TikTok did not show the expected state afterwards';
}
