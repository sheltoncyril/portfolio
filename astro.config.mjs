import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://sheltoncyril.io',
  integrations: [sitemap()],
});
