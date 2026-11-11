import { defineTheme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'

export const skytraceTheme = defineTheme({
  name: 'skytrace',
  extends: neutralTheme,
  tokens: {
    '--color-background-body': ['#ffffff', '#09090b'],
    '--color-accent': ['#7c3aed', '#a78bfa'],
    '--color-accent-muted': [
      'color-mix(in srgb, var(--color-accent) 12%, transparent)',
      'color-mix(in srgb, var(--color-accent) 24%, transparent)',
    ],
    '--color-on-accent': ['#ffffff', '#18181b'],
    '--color-text-accent': ['#6d28d9', '#c4b5fd'],
    '--color-icon-accent': 'var(--color-text-accent)',
    '--font-family-body': 'Inter, ui-sans-serif, system-ui, sans-serif',
    '--font-family-heading': 'var(--font-family-body)',
  },
  localTokens: {
    '--color-brand-mark': ['#8b5cf6', '#a78bfa'],
    '--color-background-media': '#000000',
    '--text-search-size': '1rem',
    '--text-search-leading': '1.5',
    '--shadow-search': '0 10px 35px -22px color-mix(in srgb, var(--color-accent) 45%, transparent)',
  },
  components: {
    text: {
      'color:error': { color: 'var(--color-text-error)' },
    },
  },
})
