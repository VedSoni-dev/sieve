#!/usr/bin/env node
// Kept for older notes and skills: `x-aside.js read|act …` is `aside.js read|act x …`.
const { spawnSync } = require('child_process');
const path = require('path');
const [cmd, ...rest] = process.argv.slice(2);
const r = spawnSync(process.execPath, [path.join(__dirname, 'aside.js'), cmd || 'help', 'x', ...rest], { stdio: 'inherit' });
process.exit(r.status ?? 1);
