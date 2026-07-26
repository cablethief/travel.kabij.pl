# Work Travel Stories

A blog where our contractors share travel stories. Built with Astro, deployed
to Cloudflare Pages. Images never live in git (or jj) — they sync to
Cloudflare R2 from an `images/` folder next to each post, and the markdown
you write never changes: the same reference always resolves to the right
URL, in dev and in prod alike.

## How it works

- **The blog is public.** Anyone can read the site and its images, no login
  required.
- **Your own images live in `content/posts/<your-slug>/<post-slug>/images/`** —
  right inside the post's own directory. You drop files there directly, no
  tool generates this folder. It's gitignored; R2 is the source of truth for
  what's actually published. Keeping images next to the post (rather than in
  some separate tree) means a plain markdown previewer — VS Code's built-in
  preview, for example — can follow the relative path and show you the
  photo while you're still writing, with no knowledge of how this site
  actually builds.
- **`npm run publish-images` syncs those folders to R2.** One-way, folder
  push: it scans every post that's yours and uploads anything new or
  changed under its `images/` subfolder. It does **not** delete anything
  remotely if you remove a local file — sync only ever adds/updates. This
  needs Cloudflare Access (you authenticate once via `cloudflared`).
- **Your markdown never gets rewritten.** Write `![alt](images/glacier.jpg)`
  inline. A small Astro build-time step (a remark plugin) resolves that
  reference to the real URL when rendering, using nothing but the post's own
  `author` frontmatter and its directory. Nothing ever mutates your source
  file, so there's no "did I forget to run a tool and now my file is wrong"
  state to worry about.
- **`npm run pull-images` downloads other authors' images** into their
  posts' own `images/` subfolders so `npm run dev` has something to render
  locally for posts that aren't yours. This needs **no authentication at
  all** — it derives what to download directly from every checked-out
  post's own content, then fetches straight from R2's public custom domain
  (`images.*`), never touching the Access-gated Worker.
- **If you use plain `git checkout`/`git merge`** (this repo is git-and-jj
  colocated), `.githooks/post-checkout`/`post-merge` run the pull step
  automatically. There's no git-hook equivalent for publishing — images
  live in gitignored folders with no git-trackable trigger to hook, so
  `npm run publish-images` is the one and only way to publish, for
  everyone, regardless of git or jj.

## One-time setup (after cloning)

If you use Nix, `nix develop` (or `direnv allow` with an `.envrc` containing
`use flake`) drops you into a shell with the right Node version, plus
`cloudflared` and `jj`, already on `PATH` — nothing to install by hand.
Otherwise, install Node 24, `cloudflared`, and (if you want it) `jj`
yourself before continuing.

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

Posts live at `content/posts/<your-slug>/<post-slug>/index.md`. Your
slug is derived from the local-part of your email (e.g.
`jane.doe@company.com` → `jane-doe`) — no need to look it up, just match the
directory to your own `npm run whoami` email.

The easiest way to start one:

```sh
npm run new-post -- --title "Three weeks in Patagonia" [--slug custom-slug] [--summary "..."]
```

This creates `content/posts/<your-slug>/<post-slug>/index.md` (slug derived
from the title unless you pass `--slug`) with frontmatter already filled
in, plus an empty `images/` folder next to it ready for photos. It's marked
`draft: true`, so it won't show up on the site until you remove that line —
refuses to run if the folder already exists, so it never overwrites a real
post. You can just as easily create the folder and file by hand instead;
this only saves typing.

Put your images in that `images/` subfolder right inside the post's own
directory:

```
content/posts/jane-doe/patagonia-trip/images/glacier.jpg
content/posts/jane-doe/patagonia-trip/index.md
```

Reference them inline as `images/<filename>`, nothing else needed:

```yaml
---
title: Three weeks in Patagonia
author: jane-doe
pubDate: 2026-07-20
---

![Glacier at sunrise](images/glacier.jpg)
```

This text never changes — no tool ever rewrites it. Because the image is a
real file sitting right next to the post, opening this file in VS Code (or
any markdown previewer) shows the photo immediately — no build step needed
for that part. When you're ready to actually publish:

```sh
npm run publish-images
```

This uploads every new/changed file under your own posts' `images/`
subfolders to R2. It's a plain one-way folder push, not something that reads
your posts for references — it doesn't know or care which files are
mentioned where, it just mirrors what's on disk. Removing a file locally
does **not** delete it from R2 (see below).

**There's no delete command.** If you stop referencing an image or remove
a whole post, the R2 object stays behind — orphaned but harmless (nothing
links to it, and the storage cost is negligible). If you actually need
something gone, delete it from the R2 bucket directly (Cloudflare dashboard
or `wrangler r2 object delete`).

## Automatic hooks (git only)

There's no git-hook equivalent for **publishing** — images live in
gitignored `images/` subfolders, so there's no git-trackable event to hook
into. `npm run publish-images` is always a manual step, for everyone,
regardless of git or jj.

**Pulling** other authors' images is still automatic under plain `git`:
`.githooks/post-checkout` and `.githooks/post-merge` run the same logic as
`npm run pull-images` after a checkout/merge. They don't fire under
`jj commit`/`jj new` (jj has no hook mechanism of its own), so if your
workflow is jj, run `npm run pull-images` manually after pulling.

## Architecture

```
./
├── flake.nix             optional: `nix develop` for Node/cloudflared/jj
├── content/
│   └── posts/
│       └── <author>/<post-slug>/
│           ├── index.md      the actual post (committed)
│           └── images/       gitignored — your own (read-write) or downloaded
│                             copies of another author's (read-only)
├── src/
│   ├── content.config.ts          content-collection schema, points at content/posts/
│   ├── lib/images.ts               resolveImageSrc(): the one place a ref -> URL happens
│   └── remark-resolve-images.mjs  build-time rewrite of inline markdown image refs
├── vite-plugin-content-images.mjs  dev-only: serves /images/<author>/<slug>/<file>
│                                   from content/posts/<author>/<slug>/images/<file>
│                                   (production never uses this — see below)
├── worker/               Cloudflare Worker: Access-gated image uploads + R2
├── config/
│   └── hooks.config.json    non-secret Worker/image base URLs, committed
├── .contravel-author.json   LOCAL ONLY, gitignored — your identity for the hooks
└── .githooks/            post-checkout / post-merge (pull only), plus the
                          new-post / publish-images / pull-images scripts
                          npm run invokes directly
```

- **Images live inside each post's own directory, not a separate tree —
  on purpose.** Beyond being gitignored contributor state (not a real
  static-asset directory), this is specifically so a plain markdown
  previewer can follow the relative `images/glacier.jpg` path with zero
  knowledge of this project. Cloudflare Pages' build never sees any of it
  anyway (fresh clone, nothing there) — production always resolves images
  through R2. The Vite plugin exists purely so `npm run dev` has something
  to render locally, standing in for what Vite's automatic `public/`
  serving would otherwise give for free.
- **Reads bypass the Worker entirely.** Individual images are served
  directly from R2's own public custom domain (`images.travel.kabij.pl`) —
  a plain `GET` by key, no application logic involved.
- **The Worker only guards writes.** `PUT /images/:author/*path` verifies a
  Cloudflare Access JWT and only allows a contractor to write within their
  own author folder. (`DELETE` and `GET` list routes still exist on the
  Worker and are still Access-gated/author-scoped the same way, but nothing
  in this repo's tooling calls them — sync is push-only, see "Writing a post
  with images" above.)
- Object keys are plain (`<author>/<post-slug>/<filename>`, no hash) so a
  filename maps predictably to a URL. Re-uploading the same filename
  overwrites in place, so R2 objects are served with a short, revalidating
  cache (`Cache-Control: public, max-age=300, must-revalidate`) rather than
  cached forever — see `worker/src/images.ts`.
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
