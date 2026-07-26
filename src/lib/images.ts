// Matches config/hooks.config.json's publicImagesBaseUrl and
// worker/wrangler.toml's PUBLIC_IMAGES_BASE_URL — hardcoded here too rather
// than shared, following the existing pattern in this repo where each
// runtime context (Astro build, Worker, Node hook scripts) keeps its own
// copy rather than introducing cross-context config loading.
const PUBLIC_IMAGES_BASE_URL = 'https://images.travel.kabij.pl';

/**
 * Deterministic ref -> URL resolution. Nothing is ever stored as a URL in a
 * post's markdown — the same ref resolves identically in dev and prod
 * through this one function, called from both `.astro` files and the
 * build-time remark plugin (see src/remark-resolve-images.mjs).
 *
 * `ref` is whatever's written in markdown/frontmatter, e.g. "images/glacier.jpg"
 * (images live in an `images/` subfolder next to the post's index.md — see
 * README — so a plain editor can follow the relative path and preview it;
 * that "images/" prefix is purely a source-layout convention and isn't part
 * of the actual R2 key/URL, so it's stripped here).
 *
 * `isDev` is passed in explicitly rather than read from `import.meta.env`
 * internally, because the remark plugin runs as plain Node code during
 * markdown processing, where `import.meta.env` isn't reliably available —
 * only `.astro` files can rely on Vite's static replacement of that.
 */
export function resolveImageSrc(ref: string, author: string, postSlug: string, isDev: boolean): string {
  const filename = ref.replace(/^images\//, '');
  const path = `${author}/${postSlug}/${filename}`;
  return isDev ? `/images/${path}` : `${PUBLIC_IMAGES_BASE_URL}/${path}`;
}
