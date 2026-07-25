import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { imageSize } from 'image-size';

import { putImage } from './worker-client.mjs';
import { applyRewrites, collectLocalImageRefs, parsePost, stringifyPost } from './frontmatter.mjs';

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];
const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

/** Hard failure: a real problem with this specific post (bad data, missing file, upload failure). */
export class PostImageError extends Error {}
/** Soft skip: the post just isn't the caller's to touch. Not a failure. */
export class SkippedNotMineError extends Error {}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Shared by the pre-commit hook and `npm run publish-images`: finds local
 * (non-http) image refs in one post file, uploads any not already in
 * `cache`, rewrites frontmatter/body to the public URL, and writes the file
 * back to disk. Returns { changed: boolean }. Never touches git/jj state —
 * callers decide whether/how to stage the result.
 *
 * `file` is repo-root-relative, e.g. "src/content/posts/<author>/<slug>/index.md".
 * `getAccessToken` is called lazily — only if an upload is actually needed.
 */
export async function processPostFile({ root, file, mySlug, workerBaseUrl, cache, getAccessToken }) {
  const parts = file.split('/');
  const dirAuthor = parts[3];
  const postSlug = parts[4];
  const postDir = path.dirname(file);
  const absFile = path.join(root, file);

  const post = parsePost(readFileSync(absFile, 'utf8'));

  if (post.data.author !== dirAuthor) {
    throw new PostImageError(
      `${file}: frontmatter "author: ${post.data.author}" doesn't match its directory "${dirAuthor}". Fix one or the other.`,
    );
  }
  if (dirAuthor !== mySlug) {
    throw new SkippedNotMineError(`${file}: belongs to "${dirAuthor}", not you ("${mySlug}")`);
  }

  const refs = collectLocalImageRefs(post);
  if (refs.length === 0) return { changed: false };

  const rewriteMap = new Map();

  for (const ref of refs) {
    const absPath = path.join(root, postDir, ref);
    if (!existsSync(absPath)) {
      throw new PostImageError(`${file} references "${ref}", but no such file exists at ${absPath}.`);
    }

    const ext = path.extname(ref).toLowerCase();
    const contentType = CONTENT_TYPES[ext];
    if (!contentType) {
      throw new PostImageError(`${file} references "${ref}" with unsupported extension "${ext}". Allowed: ${IMAGE_EXTENSIONS.join(', ')}`);
    }

    const buffer = readFileSync(absPath);
    const hash = sha256(buffer);
    const cached = cache[absPath];

    let result;
    if (cached && cached.hash === hash) {
      result = cached;
    } else {
      const basename = path.parse(ref).name;
      const remotePath = `${postSlug}/${basename}.${hash.slice(0, 8)}${ext}`;
      const { width, height } = imageSize(buffer);

      let uploaded;
      try {
        const accessToken = await getAccessToken();
        uploaded = await putImage({ workerBaseUrl, author: mySlug, path: remotePath, filePath: absPath, contentType, accessToken });
      } catch (err) {
        throw new PostImageError(err.message);
      }

      result = { hash, url: uploaded.url, width, height };
      cache[absPath] = result;
    }

    rewriteMap.set(ref, result);
  }

  applyRewrites(post, rewriteMap);
  writeFileSync(absFile, stringifyPost(post));
  return { changed: true };
}
