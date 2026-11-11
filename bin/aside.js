#!/usr/bin/env node
// Drive any Sieve source on the user's real, signed-in browser through Aside (https://aside.com).
//   node bin/aside.js sources                                   list sources
//   node bin/aside.js round [pages]                             reads every source the user turned on, keeps the NEW posts
//                                                              in data/round.json and prints a short list to judge
//                                                              (then: node bin/sieve.js judge <verdicts>)
//   node bin/aside.js read  <source> [pages] [--url <url>]      → JSON {source, signedIn, posts[]}
//   node bin/aside.js act   <source> <type> <postUrl> ["text"]  → JSON {ok, error?}  (exit 2 when not ok)
//   node bin/aside.js probe <source> <postUrl>                  finds the action buttons and their state; never clicks
// Each source lives in sources/<id>/: source.json, read.js (runs in the page), act.js (runs in the REPL).
// Other browser tools follow the same files by hand (sources/<id>/ACTIONS.md where present).
const { execFileSync, execFile } = require('child_process');
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
function runAsync(code, timeout) {
  const f = path.join(os.tmpdir(), `sieve-aside-${process.pid}-${Date.now()}.js`);
  fs.writeFileSync(f, code);
  return new Promise((resolve) => execFile('aside', ['repl', '--file', f], { encoding: 'utf8', timeout, maxBuffer: 128 * 1024 * 1024 }, (err, stdout, stderr) => {
    fs.rmSync(f, { force: true });
    const out = (stdout || '') + (stderr || '');
    const line = out.split('\n').find((l) => l.startsWith('@@SIEVE@@'));
    if (!line) die(`aside repl failed: ${out.slice(-800) || err?.message}`);
    resolve(JSON.parse(line.slice(9)));
  }));
}

// The in-browser read loop for one source, as the body of an async function (returns {source,url,signedIn,note,posts}).
const readBody = (s, from, pages) => `
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
return { source: ${JSON.stringify(s.id)}, url: lastUrl, signedIn, note, posts: [...seen.values()] };`;

const BASE = process.env.SIEVE_URL || `http://127.0.0.1:${process.env.SIEVE_PORT || 4545}`;
async function server(method, route, body) {
  try {
    const r = await fetch(BASE + route, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    return await r.json();
  } catch { die(`Sieve server isn't running at ${BASE}. Start it: npm start`); }
}
const ROUND = path.join(__dirname, '..', 'data', 'round.json');
const one = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
const words = (segs) => Array.isArray(segs) ? segs.map((x) => x.v || '').join('') : String(segs || '');
// One line per post: what the agent needs to judge it, nothing more.
function line(key, p) {
  const flags = [p.promoted && 'AD', p.aiGenerated && 'labeled AI-generated', p.nsfw && 'NSFW', p.spoiler && 'SPOILER', p.video && (p.duration ? `video ${p.duration}` : 'video'), (p.images || []).length && `${p.images.length} img`].filter(Boolean);
  const where = p.community || p.channel || [p.name, p.handle && p.handle !== p.name && '@' + p.handle].filter(Boolean).join(' ') || '';
  const body = [p.title, p.flair && `[${p.flair}]`, words(p.text), p.alt && `[image: ${p.alt}]`, p.context && `(${p.context})`, p.quote && `[quoting ${p.quote.handle || ''}: ${words(p.quote.text)}]`, p.card?.title && !(p.title && p.card.title === p.title) && `[link: ${p.card.title}]`].filter(Boolean).join(' · ');
  return `${key}  ${flags.length ? `[${flags.join(', ')}] ` : ''}${one(where, 48)} — ${one(body, 260)}`;
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
  const r = run(`const R = await (async () => {${readBody(s, from, pages)}
})();
console.log('@@SIEVE@@' + JSON.stringify(R));`);
  console.log(JSON.stringify(r));
} else if (cmd === 'round') {
  (async () => {
    const pages = Math.max(0, Math.min(8, Number([id, ...args].find((a) => /^\d+$/.test(a || '')) ?? 2)));
    const all = [id, ...args], oi = all.indexOf('--only');
    const only = oi >= 0 && all[oi + 1] ? all[oi + 1].split(',') : null;
    const { sources } = await server('GET', '/api/sources');
    const on = sources.filter((x) => (only ? only.includes(x.id) : x.enabled) && listSources().includes(x.id));
    if (!on.length) die('no sources are turned on (Sources panel in the UI, or PUT /api/sources)');
    const S = await server('GET', '/api/seen');
    const seen = new Set(S.ids || []), kept = new Set(S.kept || []);
    const beat = () => server('POST', '/api/agent', { status: 'scrolling', note: `reading ${on.map((x) => x.name).join(', ')}` }).catch(() => {});
    beat(); const hb = setInterval(beat, 30000);
    const code = on.map((m) => { const s = source(m.id); return `try { R[${JSON.stringify(s.id)}] = await (async () => {${readBody(s, s.home, pages)}
})(); } catch (e) { R[${JSON.stringify(s.id)}] = { source: ${JSON.stringify(s.id)}, error: String(e.message || e).slice(0, 200), posts: [] }; try { await closeTab(page); } catch {} }`; }).join('\n');
    const R = await runAsync(`const R = {};\n${code}\nconsole.log('@@SIEVE@@' + JSON.stringify(R));`, 120000 + on.length * (pages + 1) * 25000);
    clearInterval(hb);
    const round = { at: Date.now(), keys: {}, sources: {} };
    const lines = [];
    for (const m of on) {
      const r = R[m.id] || { error: 'no result', posts: [] };
      const fresh = (r.posts || []).filter((p) => !seen.has(p.id));
      // already in the feed: sent again so counts and liked/saved state stay current (no judging needed)
      const refresh = (r.posts || []).filter((p) => kept.has(p.id));
      round.sources[m.id] = { signedIn: r.signedIn !== false, note: r.note || '', error: r.error || '', posts: fresh, refresh };
      lines.push(`\n## ${m.name}: ${r.error ? `ERROR ${r.error}` : `${fresh.length} new of ${(r.posts || []).length} read`}${r.note ? ` (${r.note})` : r.signedIn === false ? ' (signed out: read-only)' : ''}`);
      fresh.forEach((p, n) => { const k = `${m.id}.${n}`; round.keys[k] = p.id; lines.push(line(k, p)); });
    }
    fs.mkdirSync(path.dirname(ROUND), { recursive: true });
    fs.writeFileSync(ROUND, JSON.stringify(round));
    console.log(lines.join('\n').trim());
    console.log(`\nJudge every line against the rules, then: node bin/sieve.js judge <file>, one line per post you hide or tag:\n  <key> hide <2-5 word reason>\n  <key> keep <tag>, <tag>\nUnlisted posts are kept untagged; [AD] posts are hidden as "ad" unless you keep them.`);
  })();
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
node bin/aside.js round [pages] [--only a,b]           read every enabled source; list new posts to judge
node bin/aside.js read  <source> [pages] [--url <url>]
node bin/aside.js act   <source> <type> <postUrl> ["text"]
node bin/aside.js probe <source> <postUrl>          (finds buttons and state; never clicks)
sources: ${listSources().join(', ')}`);
}
