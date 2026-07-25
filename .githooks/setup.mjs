import { chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hooksDir = path.dirname(fileURLToPath(import.meta.url));
const hookFiles = ['pre-commit', 'post-checkout', 'post-merge'];

for (const name of hookFiles) {
  // Defense-in-depth: the executable bit should already be set/preserved by
  // git, but isn't guaranteed on every checkout (e.g. some Windows/zip flows).
  chmodSync(path.join(hooksDir, name), 0o755);
}

console.log('Git hooks installed (core.hooksPath=.githooks).');
