import { fileURLToPath } from 'node:url'

// Static export, no server. See ADR-004 — everything expensive happens offline
// at build time and ships as a static asset.
export default defineNuxtConfig({
  compatibilityDate: '2025-07-01',
  devtools: { enabled: false },
  ssr: true,
  nitro: {
    preset: 'static',
    prerender: { crawlLinks: true, routes: ['/'] },
  },
  app: {
    head: {
      title: 'poker-ai — heads-up NLHE against an opponent that shows its working',
      htmlAttrs: { lang: 'en' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        {
          name: 'description',
          content:
            "Heads-up No-Limit Hold'em against an AI that shows what it believes about you, how sure it is, and how much that changed its decision.",
        },
        { name: 'color-scheme', content: 'dark light' },
      ],
    },
  },
  css: ['~/assets/css/main.css'],
  alias: {
    // The pure core: no Vue, no DOM. Runs identically in the browser, in a
    // worker, in vitest and in the offline bench.
    '~core': fileURLToPath(new URL('./src', import.meta.url)),
  },
  vite: {
    worker: { format: 'es' },
  },
  typescript: { strict: true },
})
