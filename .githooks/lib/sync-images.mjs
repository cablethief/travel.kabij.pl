import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { loadHooksConfig } from './config.mjs';
import { repoRoot } from './git.mjs';
import { listImages } from './worker-client.mjs';

function authorSlugs(root) {
  const postsDir = path.join(root, 'src', 'content', 'posts');
  if (!existsSync(postsDir)) return [];
  return readdirSync(postsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

async function downloadOne(url, destination) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, buffer);
}

/**
 * Full idempotent reconciliation (not a diff against the previous HEAD) —
 * simpler, robust to merges/rebases/detached HEAD. Content-addressed
 * filenames (see worker/src/images.ts) mean "already exists locally" is
 * always equivalent to "already correct", so nothing is ever re-verified.
 * Never throws: a missing dev-preview image shouldn't block a checkout/merge.
 */
export async function syncImages() {
  const root = repoRoot();
  const { workerBaseUrl } = loadHooksConfig();
  const localImagesRoot = path.join(root, 'public', '_local-images');

  let downloaded = 0;
  let authorsChecked = 0;

  for (const author of authorSlugs(root)) {
    authorsChecked++;
    let items;
    try {
      items = await listImages({ workerBaseUrl, author });
    } catch (err) {
      console.warn(`sync-images: could not list images for "${author}" (${err.message}) — skipping`);
      continue;
    }

    for (const item of items) {
      const destination = path.join(localImagesRoot, author, item.path);
      if (existsSync(destination)) continue;
      try {
        await downloadOne(item.url, destination);
        downloaded++;
      } catch (err) {
        console.warn(`sync-images: failed to download ${item.url} (${err.message})`);
      }
    }
  }

  console.log(`sync-images: synced ${downloaded} new image(s) across ${authorsChecked} author(s)`);
}
