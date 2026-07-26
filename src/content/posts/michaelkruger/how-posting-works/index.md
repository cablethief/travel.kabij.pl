---
title: How to add a post to this blog
author: michaelkruger
pubDate: 2026-07-26
summary: A worked example of writing a post and publishing a photo, for anyone contributing to Contravel.
coverImage: drop-photos-here.png
---

This post is itself the example. If you're adding a story to Contravel, here's
the whole flow.

## 1. Create your post

Posts live at `src/content/posts/<your-slug>/<post-slug>/index.md`. Your slug
is the local part of your email — `jane.doe@company.com` becomes `jane-doe`.
This post's own path is `src/content/posts/michaelkruger/how-posting-works/index.md`.

Frontmatter needs a `title`, `author` (must match your slug), and `pubDate`.
`coverImage` and `summary` are optional.

## 2. Drop your photos in the matching folder

Photos go in `public/images/<your-slug>/<post-slug>/` — same slug, same
post-slug, just under `public/images/` instead of `src/content/posts/`. This
post's picture lives at
`public/images/michaelkruger/how-posting-works/drop-photos-here.png`.

![A generated placeholder image standing in for a real travel photo](drop-photos-here.png)

Reference a photo by its plain filename, either inline like above or as
`coverImage` in frontmatter for the listing-page thumbnail. That's it — no
URL, no upload step baked into the text. The filename you write here never
changes, no matter what happens next.

## 3. Publish the photos

```sh
npm run publish-images
```

This uploads anything new or changed under your own `public/images/<your-slug>/`
to R2. It needs you to be logged in via `cloudflared access login` first. It's
a plain one-way push — it doesn't delete anything remotely, even if you later
remove a file locally.

## 4. Commit and push the text

```sh
jj commit -m "Add my post"
jj bookmark set main -r @-
jj git push --remote origin --bookmark main
```

Only the markdown ever gets committed — the photo itself is gitignored.
Pushing to `main` triggers the site to rebuild and deploy automatically.

That's the whole loop: write text, drop photos in the matching folder,
`publish-images`, commit, push.
