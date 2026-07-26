---
title: How to add a post to this blog
author: michaelkruger
pubDate: 2026-07-26
summary: A worked example of writing a post and publishing a photo, for anyone contributing here.
---

This post is itself the example. If you're adding a story, here's the whole
flow.

## 1. Create your post

Posts live at `content/posts/<your-slug>/<post-slug>/index.md`. Your slug
is the local part of your email — `jane.doe@company.com` becomes `jane-doe`.
This post's own path is `content/posts/michaelkruger/how-posting-works/index.md`.

Frontmatter needs a `title`, `author` (must match your slug), and `pubDate`.
`summary` is optional (used as this page's meta description).

## 2. Drop your photos in an `images/` folder next to the post

Photos go in an `images/` subfolder right inside your post's own directory —
this post's picture lives at
`content/posts/michaelkruger/how-posting-works/images/drop-photos-here.png`.
It's gitignored, so it never gets committed; only the reference to it does.

Putting it right next to the post (rather than off in some separate images
tree) means a plain markdown previewer — VS Code's built-in preview, for
example — can follow the relative path and show you the photo while you're
still writing, with zero knowledge of how this site actually gets built.

![A generated placeholder image standing in for a real travel photo](images/drop-photos-here.png)

Reference a photo as `images/<filename>` inline, like above. That's it — no
URL, no upload step baked into the text. What you write here never changes,
no matter what happens next.

## 3. Publish the photos

```sh
npm run publish-images
```

This uploads anything new or changed under your own posts' `images/`
folders to R2. It needs you to be logged in via `cloudflared access login`
first. It's a plain one-way push — it doesn't delete anything remotely,
even if you later remove a file locally.

## 4. Commit and push the text

```sh
jj commit -m "Add my post"
jj bookmark set main -r @-
jj git push --remote origin --bookmark main
```

Only the markdown ever gets committed — the photo itself is gitignored.
Pushing to `main` triggers the site to rebuild and deploy automatically.

That's the whole loop: write text, drop photos in the post's own `images/`
folder, `publish-images`, commit, push.
