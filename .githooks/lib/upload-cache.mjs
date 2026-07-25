import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const CACHE_FILE = path.join('.githooks', 'cache', 'upload-manifest.json');

export function loadCache(root) {
  const file = path.join(root, CACHE_FILE);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

export function saveCache(root, cache) {
  const file = path.join(root, CACHE_FILE);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(cache, null, 2) + '\n');
}
