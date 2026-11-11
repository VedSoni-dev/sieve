// Runs in the Aside REPL on youtube.com/watch?v=<id>. Pauses and mutes the video first, so nothing plays
// out loud in the user's browser. Given: T (like|unlike|bookmark|unbookmark|reply), TEXT, ID, PROBE, out.
await page.evaluate(() => { const v = document.querySelector('video'); if (v) { v.pause(); v.muted = true; } });
if (!(await page.evaluate(() => !!document.querySelector('#avatar-btn')))) throw new Error('not signed in to YouTube in this browser');
const likeBtn = page.locator('ytd-watch-metadata like-button-view-model button').first();
await likeBtn.waitFor({ state: 'attached', timeout: 10000 });
const liked = async () => (await likeBtn.getAttribute('aria-pressed')) === 'true';
const openSave = async () => { await page.locator('ytd-watch-metadata button[aria-label="Save to playlist"], ytd-watch-metadata button[aria-label="Save"]').first().click(); await sleep(1500); };
const wl = () => page.locator('yt-sheet-view-model button[aria-label^="Watch later"], tp-yt-paper-dialog button[aria-label^="Watch later"]').first();
const wlOn = async () => (await wl().getAttribute('aria-pressed')) === 'true';
const closeSheet = async () => { await page.keyboard.press('Escape'); await sleep(400); };
if (PROBE) {
  out.found = { like: { label: await likeBtn.getAttribute('aria-label'), on: await liked() } };
  await openSave();   // opening the save sheet only shows it; nothing is selected
  out.found.bookmark = (await wl().count()) ? { label: await wl().getAttribute('aria-label'), on: await wlOn() } : null;
  await closeSheet();
  await page.mouse.wheel(0, 900); await sleep(2500);
  out.found.reply = { box: (await page.locator('#simplebox-placeholder').count()) > 0 };
  out.ok = !!(out.found.like && out.found.bookmark && out.found.reply.box);
} else if (T === 'like' || T === 'unlike') {
  const want = T === 'like';
  if ((await liked()) !== want) { await likeBtn.click(); await sleep(1500); }
  out.ok = (await liked()) === want; out.state = want;
} else if (T === 'bookmark' || T === 'unbookmark') {
  const want = T === 'bookmark';
  await openSave();
  if ((await wlOn()) !== want) { await wl().click(); await sleep(1500); }
  out.ok = (await wlOn()) === want; out.state = want;
  await closeSheet();
} else if (T === 'reply') {
  await page.mouse.wheel(0, 900); await sleep(2500);
  await page.locator('#simplebox-placeholder').first().click({ timeout: 8000 });
  await sleep(500);
  await page.keyboard.type(TEXT, { delay: 12 });
  await page.locator('#submit-button button, ytd-commentbox #submit-button').first().click({ timeout: 5000 });
  await sleep(3000);
  const first = TEXT.slice(0, 40);
  out.ok = await page.evaluate((t) => [...document.querySelectorAll('ytd-comment-thread-renderer #content-text, ytd-comment-view-model #content-text')].slice(0, 5).some((c) => c.textContent.includes(t)), first);
}
if (!PROBE && !out.ok && !out.error) out.error = 'YouTube did not show the expected state afterwards';
