/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { parse } from 'yaml';

// GitHub Pages는 /<repo>/ 하위에서 서빙된다. 로컬 개발은 '/'.
const base = process.env.BASE_PATH ?? '/';

/** config/*.yaml, data/bank/public/*.yaml 을 JS 객체로 import 하기 위한 최소 플러그인 */
function yamlPlugin(): Plugin {
  return {
    name: 'yaml-loader',
    transform(code, id) {
      if (!/\.ya?ml$/.test(id)) return null;
      return { code: `export default ${JSON.stringify(parse(code))};`, map: null };
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    yamlPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'SKCT 수열추리 연습',
        short_name: '수열추리',
        description: 'SKCT 수열추리 틈새 연습',
        lang: 'ko',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#111111',
        theme_color: '#111111',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
