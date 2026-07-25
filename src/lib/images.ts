/**
 * In dev, images haven't been uploaded yet — the post-checkout/post-merge
 * hook pulls them into public/_local-images/<author>/<postSlug>/<filename>,
 * mirroring the R2 key (and therefore the public URL's pathname) exactly.
 * In prod, frontmatter already stores the public R2 URL, so this branch is
 * dead-code-eliminated from the build (import.meta.env.DEV is statically known).
 */
export function resolveImageSrc(publicUrl: string): string {
  if (import.meta.env.DEV) {
    const { pathname } = new URL(publicUrl);
    return `/_local-images${pathname}`;
  }
  return publicUrl;
}
