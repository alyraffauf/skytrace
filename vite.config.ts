import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const siteOrigin = new URL(process.env.SITE_URL ?? process.env.CF_PAGES_URL ?? 'http://localhost:5173').origin

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'site-origin',
      transformIndexHtml(html) {
        return html.replaceAll('__SITE_ORIGIN__', siteOrigin)
      },
    },
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
})
