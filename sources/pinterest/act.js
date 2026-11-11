// Runs in the Aside REPL on pinterest.com/pin/<id>/. Given: T, TEXT, ID (pin id), PROBE, out.
// Love is the React button (aria-pressed). Save puts the pin on the board Pinterest has selected
// (the last one you saved to), as its own Save button does; the button then reads "Saved".
const signedIn = await page.evaluate(() => !!document.querySelector('[data-test-id="boards-tab"], [data-test-id="header-profile"]'));
const react = page.locator('button[data-test-id="react-button"], [data-test-id="react-button"] button').first();
const save = page.locator('[data-test-id="PinBetterSaveButton"] button, button[aria-label="Save"], button[aria-label="Saved"]').first();
await react.waitFor({ timeout: 12000 }).catch(() => {});
const pressed = async (l) => (await l.count()) ? (await l.getAttribute('aria-pressed')) === 'true' : null;
const savedOn = async () => (await pressed(save)) || /^Saved$/i.test(((await save.textContent().catch(() => '')) || '').trim());
const board = await page.evaluate(() => document.querySelector('[data-test-id="board-selection-item-selected"], [data-test-id="PinBetterSaveDropdown"]')?.innerText.trim() || '');
if (PROBE) {
  out.signedIn = signedIn;
  out.found = {
    like: (await react.count()) ? { on: await pressed(react) } : null,
    bookmark: (await save.count()) ? { on: await savedOn(), board } : null,
    reply: (await page.locator('[data-test-id="comment-editor-container"], [data-test-id="inline-comment-composer-container"]').count()) ? { found: true } : null,
  };
  out.ok = Object.values(out.found).every(Boolean);
} else {
  if (!signedIn) throw new Error('not signed in to Pinterest in this browser');
  const toggle = async (btn, isOn, want) => { if ((await isOn()) !== want) { await btn.click(); await sleep(1800); } out.ok = (await isOn()) === want; };
  if (T === 'like') await toggle(react, () => pressed(react), true);
  if (T === 'unlike') await toggle(react, () => pressed(react), false);
  if (T === 'bookmark') { await toggle(save, savedOn, true); out.board = board; }
  if (T === 'unbookmark') throw new Error('Pinterest removes a saved pin from its board page, not here: open the board to remove it');
  if (T === 'reply') {
    await page.locator('[data-test-id="comment-editor-container"], [data-test-id="inline-comment-composer-container"]').first().click({ timeout: 8000 });
    await sleep(600);
    await page.keyboard.type(TEXT, { delay: 14 });
    await sleep(500);
    await page.locator('button[aria-label="Post"], button[aria-label="Done"], [data-test-id="activity-item-create-submit"] button, button[type="submit"]').first().click({ timeout: 5000 });
    await sleep(3000);
    out.ok = await page.evaluate((t) => [...document.querySelectorAll('[data-test-id="author-and-comment-container"]')].some((c) => (c.innerText || '').includes(t)), TEXT.slice(0, 40));
  }
  if (!out.ok && !out.error) out.error = 'Pinterest did not show the expected state afterwards';
}
