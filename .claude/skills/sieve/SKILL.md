---
name: sieve
description: Run Sieve, the user's personal media. You scroll their real, signed-in feeds (X, Reddit and every other source in sources/) with browser use, keep only the posts their rules allow, push them to their own localhost UI, and carry out the likes, upvotes, reposts, quotes, replies, comments and saves they click there. Use when the user says "use the sieve skill", "scroll my feeds", "scroll my X", "run sieve", or asks to change their Sieve UI, rules or sources.
---

# Sieve: you are the user's feed

The user never opens these sites again. You do it for them, in their own signed-in browser, and they read the result at http://localhost:4545, a UI they own. Two things only you can do:

1. **Read and judge.** Read every enabled source, read every post, and keep only what their rules (`node bin/sieve.js rules`) allow. Hide the rest with a short reason so they can audit you.
2. **Act for them.** When they press an action in their UI (like, upvote, repost, quote, reply, comment, save, watch later…), do exactly that on the real site, so the site's algorithm learns from it.

Work from the repo root. Start the server if `node bin/sieve.js status` says it isn't running (`npm start`, in the background). Then tell the user to open http://localhost:4545.

## Sources

Each source is a folder in `sources/<id>/`:
- `source.json`: its name, home URL, which actions it has and what the site calls them.
- `read.js`: runs in the page and returns posts in Sieve's shape.
- `act.js`: does an action on the post's own page.

`node bin/sieve.js sources` lists them and shows which ones **the user turned on** (`enabled`). Read only those. The user switches sources on and off in the Sources panel.

## Your browser

Use whatever browser-use tool you have, in this order:

1. **Aside** (`aside` CLI). Use the generic driver:
   - `node bin/aside.js read <source> 3` opens the source's home, reads three pages (scrolling, or the next page of its own JSON) and prints `{source, signedIn, posts[]}`. Add `--url <url>` to read one profile, subreddit or channel.
   - `node bin/aside.js act <source> <type> <postUrl> ["text"]` does one action, then checks the site's state and prints `{ok, error?}`.
   - `node bin/aside.js probe <source> <postUrl>` finds the action buttons and reads their state. **It never clicks.** Use it when a site's markup may have changed.
2. **Claude in Chrome, or any browser tool that can run JS.** Open the source's `home`, evaluate `(<sources/<id>/read.js>)({})` in the page, and scroll (or pass `{cursor}` for JSON sources). For actions, follow `act.js` step by step by hand.
3. **Screenshot-only tools.** Read posts off the screen and follow `act.js` by sight. It's slower, but it works.

If a source reports `signedIn: false` where it needs an account, skip it this round. Push nothing for it, and tell the user to sign in to that site in their browser themselves. Never type their password. Other sources keep running.

## The loop (keep it running until the user says stop)

```
node bin/sieve.js rules                        # re-read every round; they may have edited them
node bin/sieve.js sources                      # which sources are on
node bin/sieve.js seen                         # ids you already handled; skip these
for each enabled source:
  node bin/sieve.js agent scrolling "reading <Source>"
  node bin/aside.js read <source> 3            # or your browser's equivalent
  → judge each NEW post against the rules (below)
  node bin/sieve.js push /tmp/sieve-<source>.json   # {"source":"<id>","signedIn":true,"posts":[kept…],"hidden":[{…post,"reason"}]}
node bin/sieve.js agent idle "watching for your clicks"
node bin/sieve.js wait 55                      # returns the moment they click something
→ do each action (below), then loop. If wait timed out with nothing, loop anyway.
```

When the user presses **"Ask the agent for more"**, you get a `more` action: read deeper next round (`read <source> 8`) and mark it done.

### Judging posts
- Read the whole post: title, text, quoted post, link card title, subreddit or channel. Decide **keep** or **hide** by their rules. Use real judgement, not keyword matching: "no AI" hides a post about LLM benchmarks or "AI upscaling" even if it never says "AI", and keeps a post about a painter named Al.
- The rules apply across every source. A section titled with a source name (`## Reddit`) applies only to that source.
- Ads and promoted posts (`promoted: true`): hide with reason `ad`, unless the rules say otherwise.
- NSFW posts: keep them flagged (`nsfw: true`; the UI blurs them) unless the rules hide them.
- For a kept post, push the object exactly as the reader returned it, plus `"tags": ["1-3 short topics"]`.
- For a hidden post, push the **whole post object** plus `"reason": "2-5 words"`. Keeping the whole post lets it come back if the rules change.
- If the text alone is ambiguous ("Is this management?", image-only posts), **look at the images** before deciding. The picture is often the actual content.
- Still unsure: keep it with the tag `unsure`.

### Doing actions
For each pending action `{id, source, type, url, text?}`:
1. `node bin/sieve.js working <id>`
2. Do it on the real site: `node bin/aside.js act <source> <type> <url> ["text"]` (or by hand per `sources/<source>/act.js`).
3. If the site now shows it: `node bin/sieve.js done <id>`. Otherwise: `node bin/sieve.js fail <id> "what happened"`.

Rules for acting, with no exceptions:
- **Only do actions the user clicked.** Never like, upvote, follow, post, comment, DM or repost on your own initiative, and never "help" by doing extra ones.
- Reply, comment and quote text goes out **exactly** as they wrote it.
- Wait about 2 seconds between actions. If a site shows a rate limit, a captcha or a warning, stop acting on that site, mark the action failed with what the site said, and tell the user.
- If the same action fails twice, stop retrying, so the site doesn't flag the account. Mark it failed and say why.

## When the rules change: re-sift
`node bin/sieve.js status` shows `rulesAt`. When it's newer than the last round, or the user says they changed their rules:
1. `node bin/sieve.js agent resifting "re-reading everything with your new rules"`
2. `node bin/sieve.js all` lists every post you've judged, kept and hidden, with its source. Re-judge **all** of them against the new rules.
3. `node bin/sieve.js resift /tmp/resift.json` with `{"keep":[{"id","tags"}], "hide":[{"id","reason"}]}`. Hidden posts with `canRestore: true` come back; kept ones that now break the rules move to hidden.
4. Then read fresh posts as usual. A new rule usually means new things are worth keeping, so read deeper.

## Adding a source
Copy the closest existing folder in `sources/`. Write `read.js` against the live site; prefer the site's own JSON when the page can fetch it with the user's session, since it's richer and more stable than the DOM. Write `act.js` to click and then **verify the state the site shows**. Check with `read` and `probe` on the real site before turning it on.

## Changing their UI or rules
- "Change my Sieve UI so …": edit `ui/index.html`, `ui/style.css` and `ui/app.js`. Posts come from `GET /api/feed`, sources from `GET /api/sources`, and updates arrive live via `/api/events`. Keep the action buttons working (they `POST /api/actions`). Tell them to refresh.
- "Hide X / keep Y": edit the rules (`PUT /api/rules`, or they can use the Rules panel). They take effect from the next round.
