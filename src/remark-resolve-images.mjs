import { visit } from 'unist-util-visit';
import { resolveImageSrc } from './lib/images.ts';

// astro build sets NODE_ENV=production; astro dev doesn't. Can't use
// import.meta.env.DEV here — this runs as plain Node code during markdown
// processing, not through Vite's static replacement.
const isDev = process.env.NODE_ENV !== 'production';

/**
 * Rewrites inline markdown image refs (`![alt](images/glacier.jpg)`) to the
 * resolved URL, using the post's own frontmatter `author` and its
 * directory-derived post-slug. The post's source text never changes — this
 * only affects the rendered output.
 */
export function remarkResolveImages() {
  return (tree, file) => {
    const author = file.data?.astro?.frontmatter?.author;
    const filePath = file.history?.[0] ?? file.path;
    const match = typeof filePath === 'string' && filePath.match(/posts[\\/]([^\\/]+)[\\/]([^\\/]+)[\\/]index\.md$/);
    const postSlug = match?.[2];

    if (!author || !postSlug) return;

    visit(tree, 'image', (node) => {
      if (/^https?:\/\//i.test(node.url) || node.url.startsWith('/')) return; // already absolute — leave alone
      node.url = resolveImageSrc(node.url, author, postSlug, isDev);
    });
  };
}
