// Runs in the Aside REPL on linkedin.com/feed/update/urn:li:activity:<id>/. Given: T, TEXT, ID, PROBE, out.
// LinkedIn restricts accounts that automate: one action, then a pause, and stop at the first warning.
if (!(await page.evaluate(() => /JSESSIONID/.test(document.cookie)))) throw new Error('not signed in to LinkedIn in this browser');
const warn = await page.evaluate(() => /unusual activity|temporarily restricted|verify you.?re a human|security verification/i.test(document.body.innerText.slice(0, 4000)));
if (warn) throw new Error('LinkedIn is showing a security or restriction notice; stopping');
const react = page.locator('main button[aria-label^="Reaction button state"]').first();
await react.waitFor({ state: 'attached', timeout: 10000 });
const likedOn = async () => !/no reaction/i.test((await react.getAttribute('aria-label')) || '');
const menuBtn = page.locator('main button[aria-label^="Open control menu for post"]').first();
const openMenu = async () => { await menuBtn.click(); await sleep(900); };
const saveItem = () => page.getByRole('menuitem', { name: /^(Save|Unsave)\b/ }).first();
const savedOn = async () => /^Unsave/i.test(((await saveItem().textContent().catch(() => '')) || '').trim());
if (PROBE) {
  out.found = { like: { label: await react.getAttribute('aria-label'), on: await likedOn() } };
  out.found.repost = (await page.locator('main button[aria-label="Repost"]').count()) ? { label: 'Repost' } : null;
  await openMenu();
  out.found.bookmark = (await saveItem().count()) ? { label: ((await saveItem().textContent()) || '').trim().split('\n')[0], on: await savedOn() } : null;
  await page.keyboard.press('Escape'); await sleep(300);
  out.found.reply = (await page.locator('main [aria-label="Text editor for creating comment"]').count()) ? { box: true } : null;
  out.ok = Object.values(out.found).every(Boolean);
} else if (T === 'like' || T === 'unlike') {
  const want = T === 'like';
  if ((await likedOn()) !== want) { await react.click(); await sleep(1800); }
  out.ok = (await likedOn()) === want; out.state = want;
} else if (T === 'bookmark' || T === 'unbookmark') {
  const want = T === 'bookmark';
  await openMenu();
  if ((await savedOn()) !== want) { await saveItem().click(); await sleep(1500); await openMenu(); }
  out.ok = (await savedOn()) === want; out.state = want;
  await page.keyboard.press('Escape');
} else if (T === 'repost') {
  await page.locator('main button[aria-label="Repost"]').first().click(); await sleep(900);
  await page.getByRole('menuitem', { name: /^Repost\b/ }).first().click({ timeout: 5000 }); await sleep(2500);
  out.ok = await page.evaluate(() => /Repost(ed)? successful|reposted/i.test(document.body.innerText));
} else if (T === 'reply') {
  const box = page.locator('main [aria-label="Text editor for creating comment"]').first();
  await box.click({ timeout: 8000 });
  await page.keyboard.type(TEXT, { delay: 15 });
  await page.locator('main button:has-text("Comment"), main button:has-text("Post")').filter({ hasNotText: /comments?\s*\d/i }).last().click({ timeout: 5000 });
  await sleep(3500);
  const first = TEXT.slice(0, 40);
  out.ok = await page.evaluate((t) => [...document.querySelectorAll('main article, main [data-id*="comment"], main div')].some((c) => c.childElementCount < 40 && (c.innerText || '').includes(t)), first);
}
if (!PROBE && !out.ok && !out.error) out.error = 'LinkedIn did not show the expected state afterwards';
