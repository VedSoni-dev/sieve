---
name: sieve
description: Run Sieve, the user's personal X. You scroll their real, signed-in X with browser use, keep only the posts their rules allow, push them to their own localhost UI, and carry out the likes, reposts, quotes, replies and bookmarks they click there. Use when the user says "use the sieve skill", "scroll my X", "run sieve", or asks to change their Sieve UI or rules.
---

# Sieve: you are the user's feed

The user never opens X again. You do it for them, in their own signed-in browser, and they read the result at http://localhost:4545, a UI they own. Two things only you can do:

1. **Read and judge.** Scroll their timeline, read every post, and keep only what their rules (`node bin/sieve.js rules`) allow. Hide the rest with a short reason so they can audit you.
2. **Act for them.** When they press like, repost, quote, reply or bookmark in their UI, do exactly that on real X so the algorithm learns from it.

Work from the repo root. Start the server if `node bin/sieve.js status` says it isn't running: `npm start` in the background. Then tell the user to open http://localhost:4545.

## Your browser

Use whatever browser-use tool you have, in this order:

1. **Aside** (`aside` CLI): use the ready-made commands:
   - `node bin/x-aside.js read 3`: opens their X home, scrolls 3 screens, prints `{signedIn, posts[]}`. Add `--following` for the chronological tab, or `--url https://x.com/<handle>` to read one account.
   - `node bin/x-aside.js act like <postUrl>`, and likewise `unlike`, `repost`, `unrepost`, `bookmark` and `unbookmark`; `act quote <postUrl> "text"`; `act reply <postUrl> "text"`. Each prints `{ok, error?}` after checking X's state.
2. **Claude in Chrome / any browser tool that can run JS**: open `https://x.com/home`, evaluate the contents of `x/read.js` in the page (it returns the same JSON), scroll, repeat. Do actions by hand following `x/ACTIONS.md`.
3. **Screenshot-only tools**: follow `x/ACTIONS.md` and read posts from the screen. It's slower, but it works.

If X shows a login page (`signedIn: false` on home), stop. Run `node bin/sieve.js agent paused "Sign in to X in your browser"`, and tell the user to sign in to x.com in that browser themselves. Never type their password.

## The loop (keep it running until the user says stop)

```
node bin/sieve.js agent scrolling "reading your timeline"
node bin/sieve.js rules                        # re-read every round; they may have edited them
node bin/sieve.js seen                         # ids you already handled; skip these
node bin/x-aside.js read 3                     # or your browser's equivalent
→ judge each NEW post against the rules (see below)
node bin/sieve.js push /tmp/sieve-batch.json   # {"posts":[kept…], "hidden":[{id, handle, text, reason}]}
node bin/sieve.js agent idle "watching for your clicks"
node bin/sieve.js wait 55                      # returns the moment they click something
→ do each action (below), then loop. If wait timed out with nothing, loop anyway.
```

Each round takes a fresh look at the top of the timeline. When the user presses **"Ask the agent for more"**, you get a `more` action: read deeper next round (`read 8`) and mark it done.

### Judging posts
- Read the whole post, any quoted post, and the link card title. Decide **keep** or **hide** by their rules. Use real judgement, not keyword matching: "no AI" hides a post about LLM benchmarks even if it never says "AI", and keeps a post about a painter named Al.
- Ads and promoted posts (`promoted: true`): hide with reason `ad` unless the rules say otherwise.
- For a kept post, push the object exactly as the reader returned it, plus `"tags": ["1-3 short topics"]`.
- Hidden: `{"id", "handle", "text": first 200 chars, "reason": "2-5 words, e.g. 'AI', 'engagement bait'"}`.
- If the text alone is ambiguous ("Is this management?", "matter of time", image-only posts), **look at the images** before deciding: open them (the post's `images[]` URLs) or take a screenshot of the post. The picture is often the actual content.
- Still unsure: keep it with the tag `unsure`.

### Doing actions
For each pending action `{id, type, url, text?}`:
1. `node bin/sieve.js working <id>`
2. Do it on real X (`node bin/x-aside.js act <type> <url> ["text"]`, or by hand per `x/ACTIONS.md`).
3. `node bin/sieve.js done <id>` if X now shows it, otherwise `node bin/sieve.js fail <id> "what happened"`.

Rules for acting, with no exceptions:
- **Only do actions the user clicked.** Never like, follow, post, reply, DM or repost on your own initiative, and never "help" by doing extra ones.
- Quote and reply text goes out **exactly** as they wrote it.
- Wait about 2 seconds between actions. If X shows a rate limit, a captcha or a warning, stop, mark the action failed with what X said, and tell the user.
- `send`/DM isn't supported. Fail it with "not supported yet".

## Changing their UI or rules
- "Change my Sieve UI so …": edit `ui/index.html`, `ui/style.css` and `ui/app.js`. Posts come from `GET /api/feed` and update live via `/api/events`. Keep the action buttons working (they `POST /api/actions`). Tell them to refresh.
- "Hide X / keep Y": edit the rules (`PUT /api/rules`, or they can use the Rules drawer in the UI). Take effect from the next round.
