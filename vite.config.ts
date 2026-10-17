import { defineConfig } from 'vitest/config'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

const compiler = reactCompilerPreset()
// Vitest transforms application modules in its server environment.
compiler.rolldown.applyToEnvironmentHook = () => true

export default defineConfig({
  plugins: [react(), babel({ include: /\/src\/.*\.[jt]sx?$/, presets: [compiler] }), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
})
