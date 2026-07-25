import { execFileSync } from 'node:child_process';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

export function repoRoot() {
  return git(['rev-parse', '--show-toplevel']);
}

/** Staged markdown files under src/content/posts, filtered to added/copied/modified. */
export function stagedPostMarkdownFiles() {
  const out = git(['diff', '--cached', '--name-only', '--diff-filter=ACM', '--', 'src/content/posts/**/*.md']);
  return out ? out.split('\n') : [];
}

/** All staged paths, regardless of type — used for the image-in-commit backstop check. */
export function stagedPaths() {
  const out = git(['diff', '--cached', '--name-only']);
  return out ? out.split('\n') : [];
}

/** Contents of a path as staged in the index (not the working tree), so `git add -p` is respected. */
export function readStagedBlob(path) {
  return git(['show', `:${path}`]);
}

export function stageFile(path) {
  git(['add', path]);
}
