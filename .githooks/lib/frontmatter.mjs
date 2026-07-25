import matter from 'gray-matter';

const INLINE_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

export function parsePost(raw) {
  return matter(raw);
}

export function stringifyPost(post) {
  return matter.stringify(post.content, post.data);
}

export function isLocalRef(ref) {
  return !/^https?:\/\//i.test(ref);
}

/** Every distinct local (non-http) image reference in frontmatter `images[].src` and inline `![]()` refs. */
export function collectLocalImageRefs(post) {
  const refs = new Set();

  for (const image of post.data.images ?? []) {
    if (image.src && isLocalRef(image.src)) refs.add(image.src);
  }

  for (const match of post.content.matchAll(INLINE_IMAGE_RE)) {
    const ref = match[2];
    if (isLocalRef(ref)) refs.add(ref);
  }

  return [...refs];
}

/**
 * Rewrites every local ref found in `rewriteMap` (ref -> {url, width, height})
 * to its uploaded URL, in both frontmatter `images[]` and inline body refs.
 * Mutates and returns `post`.
 */
export function applyRewrites(post, rewriteMap) {
  post.data.images = (post.data.images ?? []).map((image) => {
    const rewrite = image.src && rewriteMap.get(image.src);
    return rewrite ? { ...image, src: rewrite.url, width: rewrite.width, height: rewrite.height } : image;
  });

  post.content = post.content.replace(INLINE_IMAGE_RE, (full, alt, ref) => {
    const rewrite = rewriteMap.get(ref);
    return rewrite ? `![${alt}](${rewrite.url})` : full;
  });

  return post;
}
