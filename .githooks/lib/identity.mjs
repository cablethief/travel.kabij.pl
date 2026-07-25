import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from './git.mjs';
import { resolveAuthorSlug } from './authors.mjs';

const IDENTITY_FILE = '.contravel-author.json';

export class MissingIdentityError extends Error {}

/**
 * Reads the local, gitignored .contravel-author.json rather than
 * `git config user.email` — a contractor's commit identity and their
 * Cloudflare Access SSO identity are often different emails, and this
 * file is what decides which author folder/slug the hook treats as "mine".
 * It grants no actual authority: the Worker independently re-derives and
 * enforces identity from the verified Access JWT regardless of what this
 * file says, so a stale/wrong value here just produces a clean 403.
 */
export function readLocalAuthorIdentity() {
  const file = path.join(repoRoot(), IDENTITY_FILE);
  if (!existsSync(file)) {
    throw new MissingIdentityError(
      `${IDENTITY_FILE} not found. Run: npm run whoami -- --email you@company.com --name "Your Name"`,
    );
  }
  const data = JSON.parse(readFileSync(file, 'utf8'));
  if (!data.email) {
    throw new MissingIdentityError(`${IDENTITY_FILE} is missing "email". Run: npm run whoami -- --email you@company.com`);
  }
  return { name: data.name, email: data.email, slug: resolveAuthorSlug(data.email) };
}
