import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './git.mjs';

let cached;

export function loadHooksConfig() {
  if (cached) return cached;
  const file = path.join(repoRoot(), 'config', 'hooks.config.json');
  cached = JSON.parse(readFileSync(file, 'utf8'));
  return cached;
}
