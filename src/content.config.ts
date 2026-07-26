import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  // id becomes "<author-slug>/<post-slug>" (the "/index.md" suffix stripped),
  // matching the on-disk posts/<author-slug>/<post-slug>/index.md layout.
  loader: glob({
    pattern: '**/index.md',
    base: './content/posts',
    generateId: ({ entry }) => entry.replace(/\/index\.md$/, ''),
  }),
  schema: z.object({
    title: z.string(),
    author: z.string(),
    pubDate: z.coerce.date(),
    draft: z.boolean().default(false),
    tags: z.array(z.string()).default([]),
    summary: z.string().optional(),
  }),
});

export const collections = { posts };
