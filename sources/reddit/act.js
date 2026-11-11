// Runs in the Aside REPL on old.reddit.com/comments/<id> (plain HTML, stable buttons).
// Given: T (like|unlike|bookmark|unbookmark|reply), TEXT, ID, PROBE, out.
const user = await page.evaluate(() => { const a = document.querySelector('.user a[href*="/user/"]'); return a ? a.textContent.trim() : null; });
if (!user) throw new Error('not signed in to Reddit in this browser');
const thing = page.locator(`#thing_t3_${ID}`).first();
await thing.waitFor({ timeout: 8000 });
const upOn = async () => (await thing.locator('.midcol .arrow.upmod').count()) > 0;
const saveLink = () => thing.locator('.flat-list .save-button a, .flat-list a.save-button, .buttons .save-button a').first();
const savedOn = async () => /unsave/i.test((await saveLink().textContent().catch(() => '')) || '');
if (PROBE) {
  out.user = user;
  out.found = {
    like: { found: (await thing.locator('.midcol .arrow.up, .midcol .arrow.upmod').count()) > 0, on: await upOn() },
    bookmark: { found: (await saveLink().count()) > 0, on: await savedOn(), label: (await saveLink().textContent().catch(() => '')) },
    reply: { found: (await page.locator('.commentarea > form.usertext textarea, .commentarea form.usertext textarea').count()) > 0 },
  };
  out.ok = out.found.like.found && out.found.bookmark.found && out.found.reply.found;
} else if (T === 'like' || T === 'unlike') {
  const want = T === 'like';
  if ((await upOn()) !== want) { await thing.locator(want ? '.midcol .arrow.up' : '.midcol .arrow.upmod').first().click(); await sleep(1200); }
  out.ok = (await upOn()) === want; out.state = want;
} else if (T === 'bookmark' || T === 'unbookmark') {
  const want = T === 'bookmark';
  if ((await savedOn()) !== want) { await saveLink().click(); await sleep(1200); }
  out.ok = (await savedOn()) === want; out.state = want;
} else if (T === 'reply') {
  const box = page.locator('.commentarea > form.usertext textarea, .commentarea form.usertext textarea').first();
  await box.click({ timeout: 6000 });
  await page.keyboard.type(TEXT, { delay: 12 });
  await page.locator('.commentarea > form.usertext button[type="submit"], .commentarea form.usertext .save').first().click({ timeout: 5000 });
  await sleep(3000);
  const first = TEXT.slice(0, 40);
  out.ok = await page.evaluate(([u, t]) => [...document.querySelectorAll('.comment')].some((c) => c.querySelector('.author')?.textContent.trim() === u && c.querySelector('.md')?.textContent.includes(t)), [user, first]);
}
if (!PROBE && !out.ok && !out.error) out.error = 'Reddit did not show the expected state afterwards';
