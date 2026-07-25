import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: 'https://travel.kabij.pl',
  image: {
    domains: ['images.travel.kabij.pl'],
  },
});
