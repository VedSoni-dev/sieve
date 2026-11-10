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
const readJSON = (a) => JSON.parse(a === '-' ? fs.readFileSync(0, 'utf8') : fs.existsSync(a) ? fs.readFileSync(a, 'utf8') : a);

const HELP = `sieve — talk to the Sieve server

  status                       agent + counts
  rules                        print the user's rules (read before every scroll)
  push <file|json|->           send posts: {"posts":[...], "hidden":[{"id","handle","text","reason"}]}
  actions                      pending actions the user clicked (do these on real X)
  wait [seconds]               block until the user clicks something (or timeout, default 55s), then print pending actions
  done <id>                    mark an action done
  fail <id> "<why>"            mark an action failed
  working <id>                 mark an action in progress
  agent <status> ["note"]      heartbeat: scrolling | acting | idle | paused (send at least every 60s)
  seen                         ids already in the feed (skip these)`;

(async () => {
  const [cmd, ...a] = process.argv.slice(2);
  switch (cmd) {
    case 'status': return out(await call('GET', '/api/state'));
    case 'rules': return out((await call('GET', '/api/rules')).text);
    case 'push': return out(await call('POST', '/api/feed', readJSON(a[0] || '-')));
    case 'actions': return out((await call('GET', '/api/actions?status=pending')).actions);
    case 'wait': return out((await call('GET', `/api/actions/wait?timeout=${Number(a[0]) || 55}`)).actions);
    case 'done': return out(await call('POST', `/api/actions/${a[0]}`, { status: 'done' }));
    case 'fail': return out(await call('POST', `/api/actions/${a[0]}`, { status: 'failed', error: a.slice(1).join(' ') }));
    case 'working': return out(await call('POST', `/api/actions/${a[0]}`, { status: 'working' }));
    case 'agent': return out(await call('POST', '/api/agent', { status: a[0] || 'scrolling', note: a.slice(1).join(' ') }));
    case 'seen': { const f = await call('GET', '/api/feed?limit=500'); const h = await call('GET', '/api/hidden'); return out([...f.posts.map(p => p.id), ...h.hidden.map(x => x.id)].join('\n')); }
    default: return out(HELP);
  }
})();
