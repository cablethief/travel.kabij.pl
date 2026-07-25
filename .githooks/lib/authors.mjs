/**
 * Mirrors worker/src/authors.ts exactly — no roster file, slug derived
 * purely from the email local-part. Must stay in sync with that file: the
 * hook needs to agree with the Worker's own derivation, or every upload
 * would 403.
 */
export function resolveAuthorSlug(email) {
  const localPart = email.trim().toLowerCase().split('@')[0] ?? '';
  return localPart.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
