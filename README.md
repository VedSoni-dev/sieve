# Sieve

**Turn social media into your personal media.**

Your coding agent scrolls X for you, in your own signed-in browser, using browser use. It reads every post, keeps only what your rules allow ("nothing about AI", "no engagement bait"), and puts the rest in **your** feed at `localhost:4545`, in a UI you design.

It works the other way too. When you like, repost, quote, reply or bookmark in your feed, the agent does it on real X for you, so the algorithm learns what you actually want. You never open X again.

```
 you ──▶ localhost:4545 (your UI) ──clicks──▶ Sieve server ──▶ your agent ──browser use──▶ real X
     ◀── posts you'd actually want  ◀──────── filtered by your rules ◀─────── reads every post
```

## Quick start

```bash
git clone https://github.com/VedSoni-dev/sieve && cd sieve
npm start                      # http://localhost:4545  (no dependencies)
```

Then, in the same folder, tell your coding agent:

> Use the sieve skill: scroll my X

Sign in to x.com once in the browser your agent uses. The agent never types your password.

## Your rules

Click **Rules** in the UI, or edit `data/rules.md`. Plain words:

```md
## Hide
- Anything about AI, even if it doesn't say "AI"
- Engagement bait, giveaways, ads
## Keep
- Space, nature, photography, sports
```

The agent re-reads them every round and uses judgement, not keyword matching. Everything it hides shows up under **hidden** with a reason, so you can check its work.

## Make the UI yours

The template ships as paper and ink. Every photo and avatar is an ordered (Bayer 8×8) dither in two inks (`ui/dither.js`); hover a photo to develop the real one, or turn **Dither** off. Keys: `j`/`k` move, `l` like, `b` bookmark, `r` reply, `o` open on X.

`ui/` is a template. Ask your agent "change my Sieve UI to a three-column magazine", "only show images", "add a reading-time badge", or edit `ui/index.html`, `ui/style.css` and `ui/app.js` yourself. Posts come from `GET /api/feed` and update live on `/api/events`.

## Browser use

| Your agent has | How Sieve uses it |
|---|---|
| **Aside** | `node bin/x-aside.js read 3` / `node bin/x-aside.js act like <url>`: one command each |
| Claude in Chrome, Playwright MCP, anything that runs JS | evaluates `x/read.js` in the page; actions per `x/ACTIONS.md` |
| screenshot-only computer use | follows `x/ACTIONS.md` by sight |

Claude Code reads `.claude/skills/sieve/SKILL.md`; Codex, Gemini CLI and Cursor read `AGENTS.md`, `GEMINI.md` and `.cursor/rules/sieve.mdc`, which point to the same skill.

## How the agent behaves

- It only does what you clicked. It never likes, follows, posts or DMs on its own initiative.
- Quote and reply text goes out exactly as you wrote it.
- It works at a human pace, about 2 seconds between actions. On a rate limit, captcha or login wall it stops and tells you.
- It waits on `node bin/sieve.js wait`, a long-poll that returns the moment you click, so actions happen within seconds without burning tokens.

## API (for your agent or your own scripts)

| | |
|---|---|
| `POST /api/feed` | `{posts:[…], hidden:[{id, handle, text, reason}]}` |
| `GET /api/feed` | posts, newest first (time comes from X's Snowflake ids) |
| `POST /api/actions` | `{type: like / unlike / repost / unrepost / quote / reply / bookmark / unbookmark / more, postId, text?}` |
| `GET /api/actions/wait?timeout=55` | blocks until there's something to do |
| `POST /api/actions/:id` | `{status: working / done / failed, error?}` |
| `GET/PUT /api/rules`, `POST /api/agent`, `GET /api/events` | rules, heartbeat, live stream |
| `GET /img?u=` | same-origin proxy for `pbs.twimg.com` images (so the canvas can dither them); nothing else |

The server only listens on 127.0.0.1 and refuses requests from other websites.

## Honest notes

- Automating your own account may break X's terms. Sieve acts only on your clicks, at human pace, on your machine.
- X changes its markup, and serves different versions to different sessions. `x/read.js` and the action steps match by meaning (test-ids, labels, structure), not position, and your agent can fix them when they break.
- Not affiliated with X.

MIT
