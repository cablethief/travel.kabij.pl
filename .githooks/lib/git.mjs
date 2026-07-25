import { execFileSync } from 'node:child_process';

export function repoRoot() {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
}
