import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { loadHooksConfig } from './config.mjs';
import { repoRoot } from './git.mjs';
import { MissingIdentityError, readLocalAuthorIdentity } from './identity.mjs';
import { collectReferencedFilenames, parsePost } from './frontmatter.mjs';

function findPostFiles(root) {
  const postsDir = path.join(root, 'content', 'posts');
  if (!existsSync(postsDir)) return [];
  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'index.md') files.push(full);
    }
  }
  walk(postsDir);
  return files;
}

async function downloadOne(url, destination) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, buffer);
}

/**
 * Downloads every image referenced by a checked-out post that isn't your
 * own (your own live in content/images/<mySlug>/ already — that's your
 * write-folder, not something to pull). Never touches the Access-gated
 * Worker: derives the remote URL deterministically (filename + author +
 * post-slug, same template as src/lib/images.ts) and fetches straight from
 * R2's public custom domain, so this needs no authentication at all.
 * Doesn't re-download files that already exist locally — filenames are no
 * longer content-addressed, so this can go stale if someone edits an image
 * in place; delete the local file (or the whole content/images/<author>/
 * folder) to force a fresh copy. Never throws: a missing dev-preview image
 * shouldn't block a checkout/merge.
 */
export async function syncImages() {
  const root = repoRoot();
  const { publicImagesBaseUrl } = loadHooksConfig();

  let mySlug;
  try {
    mySlug = readLocalAuthorIdentity().slug;
  } catch (err) {
    if (!(err instanceof MissingIdentityError)) throw err;
    mySlug = null; // no identity set yet — nothing to skip, just pull everything referenced
  }

  let downloaded = 0;
  let referencedCount = 0;

  for (const file of findPostFiles(root)) {
    const post = parsePost(readFileSync(file, 'utf8'));
    const author = post.data.author;
    const postSlug = path.basename(path.dirname(file));
    if (!author || author === mySlug) continue;

    for (const filename of collectReferencedFilenames(post)) {
      referencedCount++;
      const destination = path.join(root, 'content', 'images', author, postSlug, filename);
      if (existsSync(destination)) continue;

      const url = `${publicImagesBaseUrl}/${author}/${postSlug}/${filename}`;
      try {
        await downloadOne(url, destination);
        downloaded++;
      } catch (err) {
        console.warn(`sync-images: failed to download ${url} (${err.message})`);
      }
    }
  }

  console.log(`sync-images: synced ${downloaded} new image(s) across ${referencedCount} referenced`);
}
