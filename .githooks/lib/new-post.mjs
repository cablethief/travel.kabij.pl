#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { repoRoot } from './git.mjs';
import { MissingIdentityError, readLocalAuthorIdentity } from './identity.mjs';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--title') out.title = argv[++i];
    else if (argv[i] === '--slug') out.slug = argv[++i];
    else if (argv[i] === '--summary') out.summary = argv[++i];
  }
  return out;
}

function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const { title, slug, summary } = parseArgs(process.argv.slice(2));

if (!title) {
  console.error('Usage: npm run new-post -- --title "Three weeks in Patagonia" [--slug custom-slug] [--summary "..."]');
  process.exit(1);
}

let identity;
try {
  identity = readLocalAuthorIdentity();
} catch (err) {
  if (err instanceof MissingIdentityError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

const postSlug = slug ? slugify(slug) : slugify(title);
if (!postSlug) {
  console.error(`Could not derive a folder name from "${title}" — pass one explicitly with --slug.`);
  process.exit(1);
}

const root = repoRoot();
const postDir = path.join(root, 'content', 'posts', identity.slug, postSlug);

if (existsSync(postDir)) {
  console.error(`${path.relative(root, postDir)} already exists — pick a different --slug, or edit that post directly.`);
  process.exit(1);
}

const pubDate = new Date().toISOString().slice(0, 10);
const escapedTitle = title.includes(':') || title.includes('"') ? JSON.stringify(title) : title;

const frontmatterLines = [
  '---',
  `title: ${escapedTitle}`,
  `author: ${identity.slug}`,
  `pubDate: ${pubDate}`,
  'draft: true',
  summary ? `summary: ${JSON.stringify(summary)}` : '# summary: One sentence used as this page\'s meta description.',
  '# tags: [tag1, tag2]',
  '---',
  '',
  'Start writing here.',
  '',
];

mkdirSync(path.join(postDir, 'images'), { recursive: true });
writeFileSync(path.join(postDir, 'index.md'), frontmatterLines.join('\n'));

const relPostFile = path.relative(root, path.join(postDir, 'index.md'));
console.log(`Created ${relPostFile}`);
console.log(`Drop photos in ${path.relative(root, path.join(postDir, 'images'))}/`);
console.log('It\'s marked draft: true, so it won\'t show up on the site until you remove that line.');
