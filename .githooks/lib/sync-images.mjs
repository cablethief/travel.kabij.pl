import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { loadHooksConfig } from './config.mjs';
import { repoRoot } from './git.mjs';
import { collectReferencedUrls, parsePost } from './frontmatter.mjs';

/**
 * Finds every post's index.md under src/content/posts, regardless of author —
 * unlike publish-images/pre-commit, pulling doesn't scope to "my own" posts,
 * since a contractor previewing locally wants everyone's images to render.
 */
function findPostFiles(root) {
  const postsDir = path.join(root, 'src', 'content', 'posts');
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
 * Deliberately does NOT call the Worker's list endpoint — that's an
 * Access-gated hostname (images-api.*), and pulling for local preview must
 * stay auth-free for every contractor, not just whoever's logged in via
 * cloudflared. Instead this derives "what should be present locally"
 * directly from every checked-out post's own referenced image URLs, then
 * downloads each straight from R2's public custom domain (images.*, a
 * separate, non-Access-protected hostname). Idempotent: content-addressed
 * filenames mean "already exists locally" always means "already correct".
 * Never throws: a missing dev-preview image shouldn't block a checkout/merge.
 */
export async function syncImages() {
  const root = repoRoot();
  const { publicImagesBaseUrl } = loadHooksConfig();
  const localImagesRoot = path.join(root, 'public', '_local-images');
  const urlPrefix = `${publicImagesBaseUrl}/`;

  const referencedUrls = new Set();
  for (const file of findPostFiles(root)) {
    const post = parsePost(readFileSync(file, 'utf8'));
    for (const url of collectReferencedUrls(post)) referencedUrls.add(url);
  }

  let downloaded = 0;
  for (const url of referencedUrls) {
    if (!url.startsWith(urlPrefix)) continue; // not one of ours (e.g. a hand-authored external image)
    const destination = path.join(localImagesRoot, url.slice(urlPrefix.length));
    if (existsSync(destination)) continue;
    try {
      await downloadOne(url, destination);
      downloaded++;
    } catch (err) {
      console.warn(`sync-images: failed to download ${url} (${err.message})`);
    }
  }

  console.log(`sync-images: synced ${downloaded} new image(s) across ${referencedUrls.size} referenced`);
}
