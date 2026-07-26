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
 * Finds every image under content/posts/<mySlug>/<post-slug>/images/,
 * alongside the post they belong to (not a separate tree — see README).
 * Returns { remotePath, absPath }, where remotePath ("<post-slug>/<filename>")
 * matches the R2 key convention exactly.
 */
function findMyImages(root, mySlug) {
  const myPostsDir = path.join(root, 'content', 'posts', mySlug);
  if (!existsSync(myPostsDir)) return [];

  const results = [];
  for (const entry of readdirSync(myPostsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const postSlug = entry.name;
    const imagesDir = path.join(myPostsDir, postSlug, 'images');
    if (!existsSync(imagesDir)) continue;

    for (const relPath of walk(imagesDir, imagesDir)) {
      results.push({ remotePath: `${postSlug}/${relPath}`, absPath: path.join(imagesDir, relPath) });
    }
  }
  return results;
}

/**
 * One-way, folder-authoritative push: uploads every new/changed file under
 * your own posts' images/ subfolders to R2. Never deletes anything
 * remotely — removing a file from the folder just stops it being
 * re-uploaded, it doesn't get cleaned up on the server. No markdown
 * involved at all: this doesn't read post content, just the filesystem.
 */
export async function syncMyImages({ root, mySlug, workerBaseUrl, getAccessToken }) {
  const cache = loadCache(root);
  const files = findMyImages(root, mySlug);
  let uploaded = 0;

  for (const { remotePath, absPath } of files) {
    const ext = path.extname(remotePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext];
    if (!contentType) {
      throw new SyncImagesError(`${path.relative(root, absPath)} has an unsupported extension "${ext}". Allowed: ${Object.keys(CONTENT_TYPES).join(', ')}`);
    }

    const buffer = readFileSync(absPath);
    const hash = sha256(buffer);
    if (cache[remotePath] === hash) continue; // unchanged since last sync

    try {
      const accessToken = await getAccessToken();
      await putImage({ workerBaseUrl, author: mySlug, path: remotePath, filePath: absPath, contentType, accessToken });
    } catch (err) {
      throw new SyncImagesError(`Failed to upload ${remotePath}: ${err.message}`);
    }

    cache[remotePath] = hash;
    uploaded++;
  }

  saveCache(root, cache);
  return { checked: files.length, uploaded };
}
