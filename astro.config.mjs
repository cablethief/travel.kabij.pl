import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import { remarkResolveImages } from './src/remark-resolve-images.mjs';
import { contentImagesPlugin } from './vite-plugin-content-images.mjs';

export default defineConfig({
  output: 'static',
  site: 'https://travel.kabij.pl',
  markdown: {
    processor: unified({ remarkPlugins: [remarkResolveImages] }),
  },
  vite: {
    plugins: [contentImagesPlugin()],
  },
});
