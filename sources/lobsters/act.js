// Runs in the Aside REPL on lobste.rs/s/<id>. Given: T, TEXT, ID (short id), PROBE, out.
// Upvote and Save are links on the story itself; Lobsters flips the story's "upvoted" class and the
// save/unsave text when they take. Comments go through the form under the story.
const signedIn = await page.evaluate(() => !document.querySelector('a.upvoter[href="/login"]'));
const story = page.locator(`#story_${ID}`).first();
await story.waitFor({ timeout: 10000 });
const up = story.locator('a.upvoter').first();
const saver = story.locator('.byline a').filter({ hasText: /^(save|unsave)$/i }).first();
const upOn = () => story.evaluate((li) => li.classList.contains('upvoted'));
const savedOn = async () => /^unsave$/i.test(((await saver.textContent().catch(() => '')) || '').trim());
if (PROBE) {
  out.signedIn = signedIn;
  out.found = {
    like: (await up.count()) ? { on: await upOn() } : null,
    bookmark: (await saver.count()) ? { on: await savedOn() } : { found: false, note: 'Save shows once signed in' },
    reply: { found: (await page.locator('textarea#comment, .comment_form_container textarea').count()) > 0 || !signedIn, note: signedIn ? '' : 'the comment form shows once signed in' },
  };
  out.ok = !!out.found.like;
  if (!signedIn) out.note = 'signed out: upvote, save and comment need a Lobsters sign-in (Lobsters is invite-only)';
} else {
  if (!signedIn) throw new Error('not signed in to Lobsters in this browser');
  const toggle = async (btn, isOn, want) => { if ((await isOn()) !== want) { await btn.click(); await sleep(1500); } out.ok = (await isOn()) === want; };
  if (T === 'like') await toggle(up, upOn, true);
  if (T === 'unlike') await toggle(up, upOn, false);
  if (T === 'bookmark') await toggle(saver, savedOn, true);
  if (T === 'unbookmark') await toggle(saver, savedOn, false);
  if (T === 'reply') {
    const box = page.locator('textarea#comment, .comment_form_container textarea').first();
    await box.click({ timeout: 8000 });
    await page.keyboard.type(TEXT, { delay: 10 });
    await page.locator('.comment_form_container button[type="submit"], .comment_form_container input[type="submit"]').filter({ hasText: /post|submit/i }).first().click({ timeout: 5000 }).catch(() => page.locator('.comment_form_container [type="submit"]').first().click());
    await sleep(3000);
    const me = await page.evaluate(() => document.querySelector('#nav a[href^="/~"], header a[href^="/~"]')?.textContent.trim() || '');
    out.ok = await page.evaluate(([u, t]) => [...document.querySelectorAll('.comment')].some((c) => (!u || c.querySelector('.byline a[href^="/~"]')?.textContent.trim() === u) && (c.querySelector('.comment_text')?.textContent || '').includes(t)), [me, TEXT.slice(0, 40)]);
  }
  if (!out.ok && !out.error) out.error = 'Lobsters did not show the expected state afterwards';
}
