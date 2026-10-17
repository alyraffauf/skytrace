// @vitest-environment node
import { expect, it } from 'vitest'
import { labelDisplayName } from '../src/lib/labels/names'

it('uses the labeler-provided name with locale fallback', () => {
  const definitions = [
    {
      identifier: 'many-replies',
      locales: [
        { lang: 'en', name: 'Frequent replier' },
        { lang: 'fr', name: 'Répond souvent' },
      ],
    },
  ]

  expect(labelDisplayName('many-replies', definitions, ['fr-CA'])).toBe('Répond souvent')
  expect(labelDisplayName('many-replies', definitions, ['de'])).toBe('Frequent replier')
  expect(labelDisplayName('graphic-media', undefined, ['en'])).toBe('Graphic Media')
  expect(labelDisplayName('unknown-label', undefined, ['en'])).toBeUndefined()
})
