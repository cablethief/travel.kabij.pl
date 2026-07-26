import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

/**
 * Dev-only: serves /images/<author>/<post-slug>/<filename> during `astro
 * dev` from content/posts/<author>/<post-slug>/images/<filename> — images
 * live inside each post's own directory (gitignored) rather than a separate
 * tree, specifically so a plain markdown previewer can follow the relative
 * `images/glacier.jpg` reference and show it with no knowledge of this
 * project's build. Production never reads this at all — images always
 * resolve to the R2 URL there; this middleware only exists so local preview
 * has something to render. Nothing here runs in the deployed site —
 * Cloudflare Pages serves the static `dist/` output, not this dev server.
 */
export function contentImagesPlugin() {
  const postsRoot = path.join(process.cwd(), 'content', 'posts');

  return {
    name: 'serve-content-images',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/images/')) return next();

        const relPath = decodeURIComponent(req.url.slice('/images/'.length).split('?')[0]);
        const segments = relPath.split('/');
        if (segments.length !== 3 || segments.some((s) => !s || s === '.' || s === '..')) return next();

        const [author, postSlug, filename] = segments;
        const filePath = path.join(postsRoot, author, postSlug, 'images', filename);

        if (!filePath.startsWith(postsRoot + path.sep) || !existsSync(filePath) || !statSync(filePath).isFile()) {
          return next();
        }

        const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        createReadStream(filePath).pipe(res);
      });
    },
  };
}
