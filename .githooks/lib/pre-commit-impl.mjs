import path from 'node:path';

import { loadHooksConfig } from './config.mjs';
import { repoRoot, stagedPaths, stagedPostMarkdownFiles, stageFile } from './git.mjs';
import { MissingIdentityError, readLocalAuthorIdentity } from './identity.mjs';
import { memoizedAccessToken } from './access-token.mjs';
import { loadCache, saveCache } from './upload-cache.mjs';
import { IMAGE_EXTENSIONS, PostImageError, SkippedNotMineError, processPostFile } from './upload-post-images.mjs';

function fail(message) {
  console.error(`\npre-commit: ${message}\n`);
  process.exit(1);
}

async function main() {
  const root = repoRoot();

  // Backstop: refuse a commit that force-adds an image directly (they're
  // gitignored on purpose — this hook uploads them instead).
  const offendingImage = stagedPaths().find(
    (p) => p.startsWith('src/content/posts/') && IMAGE_EXTENSIONS.includes(path.extname(p).toLowerCase()),
  );
  if (offendingImage) {
    fail(
      `${offendingImage} is staged directly, but images must never be committed.\n` +
        `Run: git reset HEAD ${offendingImage}\n` +
        `Then re-add the same file locally and commit again — this hook uploads it automatically.`,
    );
  }

  let identity;
  try {
    identity = readLocalAuthorIdentity();
  } catch (err) {
    if (err instanceof MissingIdentityError) fail(err.message);
    throw err;
  }

  const files = stagedPostMarkdownFiles();
  if (files.length === 0) process.exit(0);

  const { workerBaseUrl, accessAppUrl } = loadHooksConfig();
  const cache = loadCache(root);
  const getAccessToken = memoizedAccessToken(accessAppUrl);

  for (const file of files) {
    try {
      const { changed } = await processPostFile({ root, file, mySlug: identity.slug, workerBaseUrl, cache, getAccessToken });
      if (changed) stageFile(file);
    } catch (err) {
      if (err instanceof SkippedNotMineError) {
        console.warn(`pre-commit: skipping ${err.message}`);
        continue;
      }
      if (err instanceof PostImageError) fail(err.message);
      throw err;
    }
  }

  saveCache(root, cache);
  process.exit(0);
}

main().catch((err) => fail(err.stack ?? String(err)));
