import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: 'https://contract.kabij.pl',
  image: {
    domains: ['images.contract.kabij.pl'],
  },
});
