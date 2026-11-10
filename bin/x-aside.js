#!/usr/bin/env node
// Drive the user's real, signed-in X through Aside (https://aside.com) in one command each.
//   node bin/x-aside.js read [pages] [--following] [--url <x.com url>]   → JSON {signedIn, posts[]} (scrolls `pages` screens)
//   node bin/x-aside.js act <like|unlike|repost|unrepost|quote|reply|bookmark|unbookmark> <postUrl> ["text"]
// Other browser tools (Claude in Chrome, Playwright MCP…) follow the same steps by hand: see x/ACTIONS.md.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const READ = fs.readFileSync(path.join(__dirname, '..', 'x', 'read.js'), 'utf8');
const die = (m) => { console.error(`x-aside: ${m}`); process.exit(1); };

function run(code) {
  const f = path.join(os.tmpdir(), `sieve-aside-${process.pid}-${Date.now()}.js`);
  fs.writeFileSync(f, code);
  let out;
  try { out = execFileSync('aside', ['repl', '--file', f], { encoding: 'utf8', timeout: 130000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { out = (e.stdout || '') + (e.stderr || ''); if (!/@@SIEVE@@/.test(out)) die(`aside repl failed: ${out.slice(-600) || e.message}`); }
  finally { fs.rmSync(f, { force: true }); }
  const line = out.split('\n').find(l => l.startsWith('@@SIEVE@@'));
  if (!line) die(`no result from aside:\n${out.slice(-600)}`);
  return JSON.parse(line.slice(9));
}

const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'read') {
  const pages = Math.max(0, Math.min(12, Number(args.find(a => /^\d+$/.test(a)) ?? 3)));
  const following = args.includes('--following');
  const ui = args.indexOf('--url');
  const from = ui >= 0 ? args[ui + 1] : 'https://x.com/home';
  if (!/^https:\/\/(x|twitter)\.com\//.test(from)) die('--url must be an x.com URL');
  const isProfile = /^https:\/\/(x|twitter)\.com\/(?!home)[A-Za-z0-9_]{1,20}\/?$/.test(from); // public profiles read fine signed out
  const r = run(`
await openTab(${JSON.stringify(from)});
await sleep(2500);
const READ_SRC = ${JSON.stringify(READ)};
const seenIds = new Map();
let signedIn = true, lastUrl = '';
${following ? `try { await page.getByRole('tab', { name: /^Following$/ }).first().click({ timeout: 4000 }); await sleep(1500); } catch {}` : ''}
for (let i = 0; i <= ${pages}; i++) {
  const got = await page.evaluate(READ_SRC);
  signedIn = got.signedIn; lastUrl = got.url;
  for (const p of got.posts) if (!seenIds.has(p.id)) seenIds.set(p.id, p);
  if (!signedIn && !${isProfile}) break;
  if (i < ${pages}) { await page.mouse.wheel(0, 2400); await sleep(1400); }
}
console.log('@@SIEVE@@' + JSON.stringify({ url: lastUrl, signedIn, posts: [...seenIds.values()] }));
`);
  console.log(JSON.stringify(r));
} else if (cmd === 'act') {
  const [type, url, text = ''] = args;
  if (!/^(like|unlike|repost|unrepost|quote|reply|bookmark|unbookmark)$/.test(type || '')) die('type must be like|unlike|repost|unrepost|quote|reply|bookmark|unbookmark');
  const id = (String(url).match(/status\/(\d+)/) || [])[1];
  if (!id) die('need a post URL like https://x.com/user/status/123');
  if ((type === 'quote' || type === 'reply') && !text.trim()) die(`${type} needs text`);
  const r = run(`
await openTab(${JSON.stringify(`https://x.com/i/status/${id}`)});
await sleep(2500);
const out = { ok: false, type: ${JSON.stringify(type)}, id: ${JSON.stringify(id)} };
try {
  if (await page.evaluate(() => !!document.querySelector('a[href*="mode=login"]'))) throw new Error('not signed in to X in this browser');
  const post = page.locator('article').filter({ has: page.locator('a[href$="/status/${id}"]') }).first();
  await post.waitFor({ timeout: 8000 });
  const btn = (action) => post.locator('[data-engagement-action="' + action + '"]').locator('button, a').first();
  const isOn = async (action) => { const b = btn(action); const p = await b.getAttribute('aria-pressed'); const l = (await b.getAttribute('aria-label')) || ''; return p === 'true' || /^(Unlike|Liked|Undo repost|Reposted|Remove Bookmark|Bookmarked)/i.test(l); };
  const toggle = async (action, want) => { if ((await isOn(action)) !== want) { await btn(action).click(); await sleep(1200); } out.ok = (await isOn(action)) === want; out.state = want; };
  const T = ${JSON.stringify(type)}, TEXT = ${JSON.stringify(text)};
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
    const box = dlg.getByRole('textbox').first();
    await box.click({ timeout: 8000 });
    await page.keyboard.type(TEXT, { delay: 15 });
    await dlg.getByRole('button', { name: T === 'quote' ? /^Post$/ : /^Reply$/ }).last().click({ timeout: 5000 });
    await sleep(2500);
    out.ok = !(await dlg.isVisible().catch(() => false));
  }
  if (!out.ok) out.error = 'X did not show the expected state afterwards';
} catch (e) { out.error = String(e.message || e).slice(0, 300); }
try { await closeTab(page); } catch {}
console.log('@@SIEVE@@' + JSON.stringify(out));
`);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 2);
} else {
  console.log(`node bin/x-aside.js read [pages] [--following]
node bin/x-aside.js act <like|unlike|repost|unrepost|quote|reply|bookmark|unbookmark> <postUrl> ["text"]`);
}
