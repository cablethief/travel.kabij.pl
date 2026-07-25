#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './git.mjs';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--email') out.email = argv[++i];
    else if (argv[i] === '--name') out.name = argv[++i];
  }
  return out;
}

const { email, name } = parseArgs(process.argv.slice(2));

if (!email) {
  console.error('Usage: npm run whoami -- --email you@company.com [--name "Your Name"]');
  console.error('Use the SAME email as your Cloudflare Access identity (what you log in with via `cloudflared access login`).');
  process.exit(1);
}

const file = path.join(repoRoot(), '.contravel-author.json');
writeFileSync(file, JSON.stringify({ email, name }, null, 2) + '\n');
console.log(`Wrote ${file}`);
