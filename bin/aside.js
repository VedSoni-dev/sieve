#!/usr/bin/env node
// Drive any Sieve source on the user's real, signed-in browser through Aside (https://aside.com).
//   node bin/aside.js sources                                   list sources
//   node bin/aside.js read  <source> [pages] [--url <url>]      → JSON {source, signedIn, posts[]}
//   node bin/aside.js act   <source> <type> <postUrl> ["text"]  → JSON {ok, error?}  (exit 2 when not ok)
//   node bin/aside.js probe <source> <postUrl>                  finds the action buttons and their state; never clicks
// Each source lives in sources/<id>/: source.json, read.js (runs in the page), act.js (runs in the REPL).
// Other browser tools follow the same files by hand (sources/<id>/ACTIONS.md where present).
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'sources');
const die = (m) => { console.error(`aside: ${m}`); process.exit(1); };
const listSources = () => fs.readdirSync(ROOT).filter((d) => fs.existsSync(path.join(ROOT, d, 'source.json')));
function source(id) {
  if (!listSources().includes(id)) die(`unknown source "${id}". Known: ${listSources().join(', ')}`);
  const dir = path.join(ROOT, id);
  return { ...JSON.parse(fs.readFileSync(path.join(dir, 'source.json'), 'utf8')), read: fs.readFileSync(path.join(dir, 'read.js'), 'utf8'), act: fs.existsSync(path.join(dir, 'act.js')) ? fs.readFileSync(path.join(dir, 'act.js'), 'utf8') : null };
}

function run(code) {
  const f = path.join(os.tmpdir(), `sieve-aside-${process.pid}-${Date.now()}.js`);
  fs.writeFileSync(f, code);
  let out;
  try { out = execFileSync('aside', ['repl', '--file', f], { encoding: 'utf8', timeout: 150000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { out = (e.stdout || '') + (e.stderr || ''); if (!/@@SIEVE@@/.test(out)) die(`aside repl failed: ${out.slice(-800) || e.message}`); }
  finally { fs.rmSync(f, { force: true }); }
  const line = out.split('\n').find((l) => l.startsWith('@@SIEVE@@'));
  if (!line) die(`no result from aside:\n${out.slice(-800)}`);
  return JSON.parse(line.slice(9));
}

const [cmd, id, ...args] = process.argv.slice(2);

if (cmd === 'sources') {
  console.log(JSON.stringify(listSources().map((s) => { const { read, act, ...meta } = source(s); return meta; }), null, 2));
} else if (cmd === 'read') {
  const s = source(id);
  const pages = Math.max(0, Math.min(12, Number(args.find((a) => /^\d+$/.test(a)) ?? 3)));
  const ui = args.indexOf('--url');
  const from = ui >= 0 ? args[ui + 1] : s.home;
  if (!new RegExp(s.urlPattern).test(from)) die(`--url must match ${s.urlPattern}`);
  const r = run(`
await openTab(${JSON.stringify(from)});
await sleep(${s.settleMs || 2500});
const READ_SRC = ${JSON.stringify(s.read)};
const seen = new Map();
let signedIn = true, lastUrl = '', cursor = null, note = '';
for (let i = 0; i <= ${pages}; i++) {
  const got = await page.evaluate('(' + READ_SRC + ')(' + JSON.stringify({ page: i, cursor }) + ')');
  signedIn = got.signedIn; lastUrl = got.url; if (got.note) note = got.note;
  for (const p of got.posts || []) if (!seen.has(p.id)) seen.set(p.id, p);
  if (got.stop) break;
  if (i < ${pages}) {
    if (got.cursor !== undefined) { if (!got.cursor) break; cursor = got.cursor; }
    else { await page.mouse.wheel(0, 2400); await sleep(${s.scrollWaitMs || 1400}); }
  }
}
try { await closeTab(page); } catch {}
console.log('@@SIEVE@@' + JSON.stringify({ source: ${JSON.stringify(s.id)}, url: lastUrl, signedIn, note, posts: [...seen.values()] }));
`);
  console.log(JSON.stringify(r));
} else if (cmd === 'act' || cmd === 'probe') {
  const s = source(id);
  if (!s.act) die(`${s.name} has no actions yet`);
  const [type, url, text = ''] = cmd === 'probe' ? ['probe', args[0], ''] : args;
  if (cmd === 'act' && !Object.keys(s.actions || {}).some((a) => type === a || type === 'un' + a)) die(`${s.name} supports: ${Object.keys(s.actions).join(', ')} (and un- forms of toggles)`);
  if (!url || !new RegExp(s.urlPattern).test(url)) die(`need a ${s.name} post URL (matching ${s.urlPattern})`);
  if ((type === 'quote' || type === 'reply') && !text.trim()) die(`${type} needs text`);
  const native = s.nativeIdFrom ? (String(url).match(new RegExp(s.nativeIdFrom)) || [])[1] : null;
  const open = s.postUrl && native ? s.postUrl.replace('{id}', native) : url;
  const r = run(`
await openTab(${JSON.stringify(open)});
await sleep(${s.settleMs || 2500});
const T = ${JSON.stringify(type)}, TEXT = ${JSON.stringify(text)}, URL = ${JSON.stringify(url)}, ID = ${JSON.stringify(native)}, PROBE = ${cmd === 'probe'};
const out = { ok: false, source: ${JSON.stringify(s.id)}, type: T, id: ID };
try {
${s.act}
} catch (e) { out.error = String(e.message || e).slice(0, 300); }
try { await closeTab(page); } catch {}
console.log('@@SIEVE@@' + JSON.stringify(out));
`);
  console.log(JSON.stringify(r));
  process.exit(r.ok ? 0 : 2);
} else {
  console.log(`node bin/aside.js sources
node bin/aside.js read  <source> [pages] [--url <url>]
node bin/aside.js act   <source> <type> <postUrl> ["text"]
node bin/aside.js probe <source> <postUrl>          (finds buttons and state; never clicks)
sources: ${listSources().join(', ')}`);
}
