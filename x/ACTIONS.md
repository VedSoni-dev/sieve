# Doing actions on X by hand (any browser tool)

X's 2026 web app has no `data-testid` hooks. Each post is an `<article>`. Its action buttons sit inside `[data-engagement-action="reply" | "retweet" | "like" | "bookmark" | "share"]`, and each button's `aria-label` carries the count and the verb, e.g. `"14637 Likes. Like"`.

Always act on the post's own page: `https://x.com/i/status/<id>`. The post you want is the `<article>` that contains a link ending in `/status/<id>`. Replies and parent posts on the same page are other articles.

| Action | Steps | Done when |
|---|---|---|
| like / unlike | click the like button | its `aria-pressed` is `"true"` (or `"false"` for unlike), or the label says Liked/Unlike |
| bookmark / unbookmark | click the bookmark button | `aria-pressed` flips |
| repost | click the retweet button, then the menu item **Repost** | retweet button is pressed |
| unrepost | click the retweet button, then **Undo repost** | not pressed |
| quote | retweet button, then **Quote**; click the dialog's textbox, type the text with real key presses (X's editor ignores pasted DOM values), then press **Post** | the dialog closes |
| reply | click the reply button; in the dialog, type into the textbox, then press **Reply** | the dialog closes |

Reading: evaluate `x/read.js` in the page. It returns `{url, signedIn, posts[]}`, with each post's text, media, link card, quoted post, counts, and whether you already liked, reposted or bookmarked it. Scroll the page between reads: X only keeps about 10 posts in the DOM at a time.

If X shows a login wall, a rate limit, a "something went wrong" or a captcha: stop and tell the user. Don't retry in a loop.
