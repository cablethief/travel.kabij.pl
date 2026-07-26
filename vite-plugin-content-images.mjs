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
 * Dev-only: serves /images/* from content/images/ during `astro dev`.
 *
 * content/images/ deliberately isn't under public/ — it's gitignored
 * content-author state (your own images to sync, plus downloaded copies of
 * others'), not a real static asset directory, and production never reads
 * it at all (images always resolve to the R2 URL in prod; this middleware
 * only exists so local preview has something to render). Nothing here runs
 * in the actual deployed site — Cloudflare Pages serves the static `dist/`
 * output, not this dev server.
 */
export function contentImagesPlugin() {
  const imagesRoot = path.join(process.cwd(), 'content', 'images');

  return {
    name: 'serve-content-images',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/images/')) return next();

        const relPath = decodeURIComponent(req.url.slice('/images/'.length).split('?')[0]);
        const filePath = path.resolve(imagesRoot, relPath);

        if (!filePath.startsWith(imagesRoot + path.sep) || !existsSync(filePath) || !statSync(filePath).isFile()) {
          return next();
        }

        const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        createReadStream(filePath).pipe(res);
      });
    },
  };
}
