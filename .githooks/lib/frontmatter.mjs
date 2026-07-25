import matter from 'gray-matter';

const INLINE_IMAGE_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

export function parsePost(raw) {
  return matter(raw);
}

/**
 * Every distinct filename this post references — inline `![]()` refs plus
 * the optional `coverImage` frontmatter field — excluding anything already
 * an absolute URL or path (hand-authored external images). Used by the pull
 * hook to know what to download; nothing rewrites these back into the file.
 */
export function collectReferencedFilenames(post) {
  const filenames = new Set();

  if (post.data.coverImage && isPlainFilename(post.data.coverImage)) {
    filenames.add(post.data.coverImage);
  }

  for (const match of post.content.matchAll(INLINE_IMAGE_RE)) {
    const ref = match[2];
    if (isPlainFilename(ref)) filenames.add(ref);
  }

  return [...filenames];
}

function isPlainFilename(ref) {
  return !/^https?:\/\//i.test(ref) && !ref.startsWith('/');
}
