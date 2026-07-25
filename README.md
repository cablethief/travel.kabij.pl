# Contravel

A blog where our contractors share travel stories. Built with Astro, deployed
to Cloudflare Pages. Images never live in git (or jj) — they're uploaded to
Cloudflare R2 through a small Worker, and either git hooks or two plain npm
commands handle the push/pull around your commits.

## How it works

- **The blog is public.** Anyone can read the site and its images, no login
  required.
- **Uploading a new image requires Cloudflare Access.** Only authenticated
  contractors can add/change images. You authenticate once via `cloudflared`.
- Images are never committed. `npm run publish-images` finds any post with a
  local (not-yet-uploaded) image reference, uploads it to R2 (via the
  Worker), and rewrites your markdown to point at the public URL instead of
  the local file — so only text ever lands in history.
- `npm run pull-images` downloads images back down into
  `public/_local-images/`, purely so `npm run dev` has something to render
  locally. This part needs no authentication — reads are public.
- **If you use plain `git commit`/`git checkout`/`git merge`** (this repo is
  git-and-jj colocated), the equivalent `.githooks/` hooks do the exact same
  thing automatically — see "Automatic hooks (git only)" below. **They do
  not fire under `jj commit`/`jj new`**, since jj doesn't invoke `git commit`
  under the hood and has no hook mechanism of its own today. If your workflow
  is jj (as this project's is), treat `publish-images`/`pull-images` as the
  real interface and the git hooks as a bonus for anyone who commits with
  plain git.

## One-time setup (after cloning)

```sh
npm install
npm run whoami -- --email you@company.com --name "Your Name"
cloudflared access login https://images-api.travel.kabij.pl
```

- `npm install` wires up the git hooks (`core.hooksPath`) and installs all
  dependencies, including the Worker's (via npm workspaces).
- `npm run whoami` writes a local, **gitignored** `.contravel-author.json`.
  Use the *same* email you use to log in via `cloudflared` below — this is
  what decides which post directory is "yours" and where to upload. (It's
  not a security boundary — the Worker independently verifies your identity
  from your Cloudflare Access token regardless of what's in this file. A
  mismatch just gets you a 403, not a security hole.)
- `cloudflared access login` opens an SSO login in your browser once. You'll
  only be asked for this again when your session expires.

Then:

```sh
npm run pull-images   # or: git pull / git checkout, if using plain git
npm run dev
```

## Writing a post with images

Posts live at `src/content/posts/<your-slug>/<post-slug>/index.md`. Your
slug is derived from the local-part of your email (e.g.
`jane.doe@company.com` → `jane-doe`) — no need to look it up, just match the
directory to your own `npm run whoami` email.

Reference images as local filenames, next to the post:

```yaml
---
title: Three weeks in Patagonia
author: jane-doe
pubDate: 2026-07-20
images:
  - src: glacier.jpg
    alt: Perito Moreno glacier
---

![Glacier at sunrise](glacier.jpg)
```

Before pushing/publishing your change, run:

```sh
npm run publish-images
```

This uploads `glacier.jpg`, rewrites both the frontmatter and the inline
reference to the public R2 URL, and writes the rewritten markdown back to
disk — the binary itself never needs to be added to git/jj at all. If an
upload fails, it prints exactly which post/image failed and exits non-zero
rather than leaving a broken reference silently in place. It's safe to run
repeatedly — already-uploaded images are skipped (checked by content hash),
and posts that aren't yours are skipped too (not an error).

## Automatic hooks (git only)

If you commit with plain `git` instead of `jj` in this colocated repo, the
same logic runs automatically: `.githooks/pre-commit` does what
`publish-images` does, but scoped to what's actually staged, and aborts the
commit on failure instead of just exiting non-zero; `.githooks/post-checkout`
and `.githooks/post-merge` do what `pull-images` does, automatically after a
checkout/merge. Both entry points share the same underlying code
(`.githooks/lib/upload-post-images.mjs`, `.githooks/lib/sync-images.mjs`), so
behavior never drifts between the two.

## Architecture

```
contravel/
├── src/                 Astro site (static output, deployed to Cloudflare Pages)
├── worker/              Cloudflare Worker: Access-gated image uploads + R2
├── config/
│   └── hooks.config.json    non-secret Worker/image base URLs, committed
├── .contravel-author.json   LOCAL ONLY, gitignored — your identity for the hooks
└── .githooks/           pre-commit / post-checkout / post-merge, plus the
                        publish-images / pull-images scripts npm run invokes directly
```

- **Reads bypass the Worker entirely.** Individual images are served
  directly from R2's own public custom domain (`images.travel.kabij.pl`),
  which is also what lets Astro's built-in `<Image>` optimization work at
  build time (no auth needed to fetch them).
- **The Worker only guards writes.** `PUT /images/:author/*path` verifies a
  Cloudflare Access JWT and only allows a contractor to write into their own
  author folder. `GET /images/:author` (list) is public — it's just used by
  the pull hook to know what's available, and the objects it lists are
  already public-read anyway.
- Object keys are content-addressed (`<author>/<post-slug>/<name>.<hash><ext>`),
  so a changed image always gets a new URL — caching is always safe, and the
  local pull-hook cache never needs to re-verify a file it already has.
- No contractor email list is stored or committed anywhere. Both the Worker
  and the hook derive an author's slug the same way, purely from the email
  local-part — see `worker/src/authors.ts` / `.githooks/lib/authors.mjs`.

## Manual setup (one-time, done by whoever administers the Cloudflare account)

These are account-level steps outside this repo, using `wrangler`/the
Cloudflare dashboard:

1. `npx wrangler r2 bucket create contravel-images`.
2. In the Cloudflare dashboard, attach a **public custom domain** to the
   bucket (e.g. `images.travel.kabij.pl`) — this is what makes reads public
   and CDN-cached with zero Worker involvement.
3. In Zero Trust → Access → Applications, create an **Access Application**
   for `images-api.travel.kabij.pl`, with a policy scoping which
   contractor identities may authenticate. Copy the Application Audience
   (AUD) tag into `worker/wrangler.toml`'s `CF_ACCESS_AUD`, and confirm
   `CF_ACCESS_TEAM_DOMAIN` matches `https://<team-name>.cloudflareaccess.com`.
   (Access can't protect the default `*.workers.dev` subdomain — attach the
   custom hostname via the Workers "Custom Domains" tab, or uncomment the
   `[[routes]]` block in `wrangler.toml`.)
4. `cd worker && npx wrangler deploy`.
5. Create/connect the Cloudflare Pages project (`npx wrangler pages project
   create contravel-blog`, build command `npm run build`, output `dist`), and
   wire up the real domain.
6. Each contractor runs `cloudflared access login <accessAppUrl>` once, using
   their own SSO identity — nothing per-person to provision beyond the Access
   Policy's allowed identities from step 3.

## Verifying the setup

- `npm run dev` — the seed post should render at `http://localhost:4321`.
- `npm run build` — static build should succeed.
- `cd worker && npx wrangler dev` — run the Worker locally to test the R2 +
  Access flow with `curl` before contractors touch it.
- After `npm install`, `git config core.hooksPath` should print `.githooks`.
