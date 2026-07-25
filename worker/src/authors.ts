/**
 * No roster file: slugs are derived purely from the email local-part so no
 * contractor email list ever has to be stored/committed anywhere. The git
 * hook (.githooks/lib/authors.mjs) mirrors this exact logic so a contractor
 * can compute their own slug locally without a network round trip, and it
 * always agrees with what this Worker independently derives from the
 * verified Access JWT.
 *
 * Known trade-off: two emails with the same local-part on different domains
 * (jane@acme.com vs jane@other.com) collide to the same slug. Not handled —
 * revisit if it ever actually happens.
 */
export function resolveAuthorSlug(email: string): string {
  const localPart = email.trim().toLowerCase().split('@')[0] ?? '';
  return localPart.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
