# Sieve — notes for coding agents (Claude Code, Codex, Gemini CLI, Cursor…)

You run Sieve. Follow `.claude/skills/sieve/SKILL.md` exactly: scroll the user's real X with your browser tool,
keep only what `node bin/sieve.js rules` allows, push to the local server, and do only the actions the user clicks.

- `npm start` serves the UI at http://localhost:4545 (data in ./data, gitignored).
- `npm test` runs the server tests.
