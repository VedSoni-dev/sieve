#!/usr/bin/env node
// sieve: the CLI your agent uses to talk to the Sieve server.
const fs = require('fs');
const BASE = process.env.SIEVE_URL || `http://127.0.0.1:${process.env.SIEVE_PORT || 4545}`;

async function call(method, route, body) {
  let res;
  try {
    res = await fetch(BASE + route, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch { die(`Sieve server isn't running at ${BASE}. Start it: npm start`); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) die(j.error || `HTTP ${res.status}`);
  return j;
}
const die = (m) => { console.error(`sieve: ${m}`); process.exit(1); };
const out = (v) => console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
const path = require('path');
const ROUND = path.join(__dirname, '..', 'data', 'round.json');
// Verdicts for the posts `aside.js round` listed. Lines: "<key> hide <reason>" or "<key> keep <tag>, <tag>"
// (key = the short key from the list, like reddit.4, or the full post id). JSON works too: {"hide":{key:reason},"keep":{key:[tags]}}.
function parseVerdicts(raw) {
  const v = { hide: {}, keep: {} };
  try { const j = JSON.parse(raw); return { hide: j.hide || {}, keep: j.keep || j.tags || {} }; } catch {}
  for (const l of raw.split('\n')) {
    const m = l.trim().match(/^(\S+)\s+(hide|keep)\b\s*(.*)$/i);
    if (!m) continue;
    if (m[2].toLowerCase() === 'hide') v.hide[m[1]] = m[3].trim() || 'hidden by rules';
    else v.keep[m[1]] = m[3].split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3);
  }
  return v;
}
const readJSON = (a) => JSON.parse(a === '-' ? fs.readFileSync(0, 'utf8') : fs.existsSync(a) ? fs.readFileSync(a, 'utf8') : a);

const HELP = `sieve — talk to the Sieve server

  status                       agent + counts
  rules                        print the user's rules (read before every scroll)
  sources                      the sources the user turned on (read only these), with last sign-in status
  judge <file|->               after \`node bin/aside.js round\`: push the round with your verdicts.
                               one line per post you hide or tag: "reddit.4 hide about AI" / "hn.2 keep space, photos"
                               unlisted posts are kept; [AD] posts are hidden as "ad" unless you keep them
  push <file|json|->           send posts: {"source":"reddit","signedIn":true,"posts":[...], "hidden":[{...post, "reason"}]}
  actions                      pending actions the user clicked (do these on the real site)
  wait [seconds]               block until the user clicks something (or timeout, default 55s), then print pending actions
  done <id>                    mark an action done
  fail <id> "<why>"            mark an action failed
  working <id>                 mark an action in progress
  agent <status> ["note"]      heartbeat: scrolling | acting | idle | paused (send at least every 60s)
  seen                         ids already in the feed (skip these)
  all                          everything judged so far (kept + hidden), to re-judge after the rules change
  resift <file|json|->         apply fresh decisions: {"keep":[{"id","tags"}], "hide":[{"id","reason"}]}`;

(async () => {
  const [cmd, ...a] = process.argv.slice(2);
  switch (cmd) {
    case 'status': return out(await call('GET', '/api/state'));
    case 'rules': return out((await call('GET', '/api/rules')).text);
    case 'sources': return out((await call('GET', '/api/sources')).sources.map((x) => ({ id: x.id, name: x.name, enabled: x.enabled, actions: x.actions, status: x.status })));
    case 'push': return out(await call('POST', '/api/feed', readJSON(a[0] || '-')));
    case 'actions': return out((await call('GET', '/api/actions?status=pending')).actions);
    case 'wait': return out((await call('GET', `/api/actions/wait?timeout=${Number(a[0]) || 55}`)).actions);
    case 'done': return out(await call('POST', `/api/actions/${a[0]}`, { status: 'done' }));
    case 'fail': return out(await call('POST', `/api/actions/${a[0]}`, { status: 'failed', error: a.slice(1).join(' ') }));
    case 'working': return out(await call('POST', `/api/actions/${a[0]}`, { status: 'working' }));
    case 'agent': return out(await call('POST', '/api/agent', { status: a[0] || 'scrolling', note: a.slice(1).join(' ') }));
    case 'seen': return out((await call('GET', '/api/seen')).ids.join('\n'));
    case 'judge': {
      if (!fs.existsSync(ROUND)) die('nothing to judge: run `node bin/aside.js round` first');
      const round = JSON.parse(fs.readFileSync(ROUND, 'utf8'));
      const raw = !a[0] || a[0] === '-' ? fs.readFileSync(0, 'utf8') : fs.existsSync(a[0]) ? fs.readFileSync(a[0], 'utf8') : a.join(' ');
      const v = parseVerdicts(raw);
      const idOf = (k) => round.keys[k] || k;
      const hide = Object.fromEntries(Object.entries(v.hide).map(([k, r]) => [idOf(k), r]));
      const keep = Object.fromEntries(Object.entries(v.keep).map(([k, t]) => [idOf(k), Array.isArray(t) ? t : String(t).split(',').map((x) => x.trim()).filter(Boolean)]));
      const known = new Set(Object.values(round.sources).flatMap((s) => s.posts.map((p) => p.id)));
      const stray = [...Object.keys(hide), ...Object.keys(keep)].filter((id) => !known.has(id));
      const report = {};
      for (const [src, s] of Object.entries(round.sources)) {
        if (s.error) { report[src] = `skipped: ${s.error}`; continue; }
        const posts = [], hidden = [];
        for (const p of s.posts) {
          if (hide[p.id]) hidden.push({ ...p, reason: hide[p.id] });
          else if (p.promoted && !keep[p.id]) hidden.push({ ...p, reason: 'ad' });
          else posts.push({ ...p, tags: keep[p.id] || [] });
        }
        const r = await call('POST', '/api/feed', { source: src, signedIn: s.signedIn, posts: [...posts, ...(s.refresh || [])], hidden });
        report[src] = `kept ${posts.length}, hid ${hidden.length} (added ${r.added})`;
      }
      fs.renameSync(ROUND, ROUND.replace(/\.json$/, '.done.json'));
      return out({ ...report, ...(stray.length ? { unknownKeys: stray } : {}) });
    }
    case 'all': return out(await call('GET', '/api/all'));
    case 'resift': return out(await call('POST', '/api/resift', readJSON(a[0] || '-')));
    default: return out(HELP);
  }
})();
