#!/usr/bin/env node
import { readdirSync } from 'node:fs';
import path from 'node:path';

import { loadHooksConfig } from './config.mjs';
import { repoRoot } from './git.mjs';
import { MissingIdentityError, readLocalAuthorIdentity } from './identity.mjs';
import { memoizedAccessToken } from './access-token.mjs';
import { loadCache, saveCache } from './upload-cache.mjs';
import { PostImageError, SkippedNotMineError, processPostFile } from './upload-post-images.mjs';

/**
 * VCS-agnostic counterpart to the pre-commit hook (which git hooks don't
 * fire under `jj`): scans every post under src/content/posts, not just
 * ones a git index considers "staged", and uploads/rewrites any local
 * image refs it finds. Idempotent — already-rewritten posts have no local
 * refs left to find, so re-running this is always safe.
 */
function findPostFiles(root) {
  const postsDir = path.join(root, 'src', 'content', 'posts');
  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'index.md') files.push(path.relative(root, full).split(path.sep).join('/'));
    }
  }
  walk(postsDir);
  return files;
}

async function main() {
  const root = repoRoot();

  let identity;
  try {
    identity = readLocalAuthorIdentity();
  } catch (err) {
    if (err instanceof MissingIdentityError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const { workerBaseUrl, accessAppUrl } = loadHooksConfig();
  const cache = loadCache(root);
  const getAccessToken = memoizedAccessToken(accessAppUrl);

  const errors = [];
  let updatedCount = 0;
  let deletedCount = 0;
  let checkedCount = 0;

  for (const file of findPostFiles(root)) {
    checkedCount++;
    try {
      const result = await processPostFile({ root, file, mySlug: identity.slug, workerBaseUrl, cache, getAccessToken });
      if (result.changed) {
        updatedCount++;
        console.log(`updated ${file}`);
      }
      if (result.deletedCount > 0) {
        deletedCount += result.deletedCount;
        console.log(`deleted ${result.deletedCount} orphaned image(s) for ${file}`);
      }
    } catch (err) {
      if (err instanceof SkippedNotMineError) continue; // not an error — most posts belong to other authors
      if (err instanceof PostImageError) {
        errors.push(err.message);
        continue;
      }
      throw err;
    }
  }

  saveCache(root, cache);
  console.log(`\npublish-images: checked ${checkedCount} post(s), updated ${updatedCount}, deleted ${deletedCount} orphaned image(s).`);

  if (errors.length > 0) {
    console.error(`\n${errors.length} post(s) had problems:\n`);
    for (const message of errors) console.error(`  - ${message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.stack ?? String(err));
  process.exit(1);
});
