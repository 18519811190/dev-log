// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// 部署时可用环境变量覆盖，例如 SITE_URL=https://xxx.github.io BASE_PATH=/dev-log
const SITE_URL = process.env.SITE_URL || 'https://example.github.io';
const BASE_PATH = process.env.BASE_PATH || '/dev-log';

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  base: BASE_PATH,
  trailingSlash: 'ignore',
  integrations: [sitemap()],
  markdown: {
    shikiConfig: {
      theme: 'github-light',
      wrap: true,
    },
  },
});
