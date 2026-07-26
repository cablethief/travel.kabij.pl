import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { putImage } from './worker-client.mjs';

const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

const CACHE_FILE = path.join('.githooks', 'cache', 'sync-manifest.json');

export class SyncImagesError extends Error {}

function loadCache(root) {
  const file = path.join(root, CACHE_FILE);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function saveCache(root, cache) {
  const file = path.join(root, CACHE_FILE);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(cache, null, 2) + '\n');
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function walk(dir, root, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, root, out);
    else out.push(path.relative(root, full).split(path.sep).join('/'));
  }
  return out;
}

/**
 * One-way, folder-authoritative push: uploads every new/changed file under
 * content/images/<mySlug>/ to R2. Never deletes anything remotely — removing
 * a file from the folder just stops it being re-uploaded, it doesn't get
 * cleaned up on the server. No markdown involved at all: this doesn't know
 * or care which posts reference which files.
 */
export async function syncMyImages({ root, mySlug, workerBaseUrl, getAccessToken }) {
  const myImagesDir = path.join(root, 'content', 'images', mySlug);
  const cache = loadCache(root);

  if (!existsSync(myImagesDir)) {
    return { checked: 0, uploaded: 0 };
  }

  const relativePaths = walk(myImagesDir, myImagesDir);
  let uploaded = 0;

  for (const relativePath of relativePaths) {
    const absPath = path.join(myImagesDir, relativePath);
    const ext = path.extname(relativePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext];
    if (!contentType) {
      throw new SyncImagesError(`content/images/${mySlug}/${relativePath} has an unsupported extension "${ext}". Allowed: ${Object.keys(CONTENT_TYPES).join(', ')}`);
    }

    const buffer = readFileSync(absPath);
    const hash = sha256(buffer);
    if (cache[relativePath] === hash) continue; // unchanged since last sync

    try {
      const accessToken = await getAccessToken();
      await putImage({ workerBaseUrl, author: mySlug, path: relativePath, filePath: absPath, contentType, accessToken });
    } catch (err) {
      throw new SyncImagesError(`Failed to upload ${relativePath}: ${err.message}`);
    }

    cache[relativePath] = hash;
    uploaded++;
  }

  saveCache(root, cache);
  return { checked: relativePaths.length, uploaded };
}
