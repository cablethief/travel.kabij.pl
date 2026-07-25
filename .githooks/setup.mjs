import { chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hooksDir = path.dirname(fileURLToPath(import.meta.url));
// No pre-commit: images live in a gitignored sync folder now, so there's no
// git-trackable trigger to hook — publishing is always the manual
// `npm run publish-images` (or `npm run pull-images` for the read side),
// regardless of git or jj. post-checkout/post-merge still auto-pull other
// authors' images for local preview under plain git.
const hookFiles = ['post-checkout', 'post-merge'];

for (const name of hookFiles) {
  // Defense-in-depth: the executable bit should already be set/preserved by
  // git, but isn't guaranteed on every checkout (e.g. some Windows/zip flows).
  chmodSync(path.join(hooksDir, name), 0o755);
}

console.log('Git hooks installed (core.hooksPath=.githooks).');
