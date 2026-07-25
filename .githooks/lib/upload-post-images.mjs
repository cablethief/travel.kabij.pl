import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { imageSize } from 'image-size';

import { deleteImage, listImages, putImage } from './worker-client.mjs';
import { applyRewrites, collectLocalImageRefs, collectReferencedUrls, parsePost, stringifyPost } from './frontmatter.mjs';

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];
const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

/** Hard failure: a real problem with this specific post (bad data, missing file, upload/delete failure). */
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
 * back to disk. Then reconciles deletions: any R2 object under this post's
 * prefix that the post no longer references (removed from frontmatter/body)
 * gets deleted — editing the post IS the delete action, no separate command.
 * Never touches git/jj state — callers decide whether/how to stage the result.
 *
 * `file` is repo-root-relative, e.g. "src/content/posts/<author>/<slug>/index.md".
 * `getAccessToken` is called lazily — only if an upload or delete is actually needed.
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
  let changed = false;

  if (refs.length > 0) {
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
    changed = true;
  }

  // Skip reconciliation entirely (and therefore skip needing an Access
  // token at all) when this post has no image involvement right now — text
  // edits shouldn't require cloudflared to be logged in. Known gap: removing
  // a post's *only/last* image in the same edit that empties `images: []`
  // won't auto-delete it, since there's nothing left to key the check off
  // of; re-running after adding any other image (or a manual R2 delete)
  // clears it. Every other case — one of several images removed, whole
  // posts still on disk — is covered.
  const referencedUrls = collectReferencedUrls(post);
  const deletedCount =
    referencedUrls.size > 0
      ? await reconcileDeletedImages({ referencedUrls, mySlug, postSlug, workerBaseUrl, getAccessToken })
      : 0;

  return { changed, deletedCount };
}

/**
 * Deletes any R2 object under this post's prefix that the post's current
 * frontmatter/body no longer references. Stateless by design (compares
 * "what's referenced right now" against "what's actually in R2" — no
 * history/diffing needed), which is what keeps this correct under both the
 * git-staged-diff hook and the full-tree-scan publish-images script.
 */
async function reconcileDeletedImages({ referencedUrls, mySlug, postSlug, workerBaseUrl, getAccessToken }) {
  let listed;
  try {
    const accessToken = await getAccessToken();
    listed = await listImages({ workerBaseUrl, author: mySlug, prefix: `${postSlug}/`, accessToken });
  } catch (err) {
    throw new PostImageError(`Could not check for orphaned images: ${err.message}`);
  }

  const orphans = listed.filter((item) => !referencedUrls.has(item.url));

  for (const orphan of orphans) {
    try {
      const accessToken = await getAccessToken();
      await deleteImage({ workerBaseUrl, author: mySlug, path: orphan.path, accessToken });
    } catch (err) {
      throw new PostImageError(`Failed to delete orphaned image "${orphan.path}": ${err.message}`);
    }
  }

  return orphans.length;
}
