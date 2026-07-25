import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { imageSize } from 'image-size';

import { loadHooksConfig } from './config.mjs';
import { readStagedBlob, repoRoot, stagedPaths, stagedPostMarkdownFiles, stageFile } from './git.mjs';
import { MissingIdentityError, readLocalAuthorIdentity } from './identity.mjs';
import { getAccessToken } from './access-token.mjs';
import { putImage } from './worker-client.mjs';
import { applyRewrites, collectLocalImageRefs, parsePost, stringifyPost } from './frontmatter.mjs';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];
const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

const CACHE_FILE = path.join('.githooks', 'cache', 'upload-manifest.json');

function fail(message) {
  console.error(`\npre-commit: ${message}\n`);
  process.exit(1);
}

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
  let accessToken; // fetched lazily, once, only if an upload is actually needed

  for (const file of files) {
    const parts = file.split('/'); // src/content/posts/<author>/<postSlug>/index.md
    const dirAuthor = parts[3];
    const postSlug = parts[4];
    const postDir = path.dirname(file);

    const raw = readStagedBlob(file);
    const post = parsePost(raw);

    if (post.data.author !== dirAuthor) {
      fail(
        `${file}: frontmatter "author: ${post.data.author}" doesn't match its directory "${dirAuthor}". ` +
          `Fix one or the other before committing.`,
      );
    }

    if (dirAuthor !== identity.slug) {
      console.warn(`pre-commit: skipping ${file} — it belongs to "${dirAuthor}", not you ("${identity.slug}")`);
      continue;
    }

    const refs = collectLocalImageRefs(post);
    if (refs.length === 0) continue;

    const rewriteMap = new Map();

    for (const ref of refs) {
      const absPath = path.join(root, postDir, ref);
      if (!existsSync(absPath)) {
        fail(`${file} references "${ref}", but no such file exists at ${absPath}.`);
      }

      const ext = path.extname(ref).toLowerCase();
      const contentType = CONTENT_TYPES[ext];
      if (!contentType) {
        fail(`${file} references "${ref}" with unsupported extension "${ext}". Allowed: ${IMAGE_EXTENSIONS.join(', ')}`);
      }

      const buffer = readFileSync(absPath);
      const hash = sha256(buffer);
      const cacheKey = absPath;
      const cached = cache[cacheKey];

      let result;
      if (cached && cached.hash === hash) {
        result = cached;
      } else {
        accessToken ??= await getAccessToken(accessAppUrl).catch((err) => fail(err.message));

        const basename = path.parse(ref).name;
        const remotePath = `${postSlug}/${basename}.${hash.slice(0, 8)}${ext}`;
        const { width, height } = imageSize(buffer);

        let uploaded;
        try {
          uploaded = await putImage({
            workerBaseUrl,
            author: identity.slug,
            path: remotePath,
            filePath: absPath,
            contentType,
            accessToken,
          });
        } catch (err) {
          fail(err.message);
        }

        result = { hash, url: uploaded.url, width, height };
        cache[cacheKey] = result;
      }

      rewriteMap.set(ref, result);
    }

    applyRewrites(post, rewriteMap);
    writeFileSync(path.join(root, file), stringifyPost(post));
    stageFile(file);
  }

  saveCache(root, cache);
  process.exit(0);
}

main().catch((err) => fail(err.stack ?? String(err)));
