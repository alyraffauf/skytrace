import { expect, it } from 'vitest'
import { calculateSuggestionPlacement } from '../src/components/actors/useSuggestionPlacement'

it('opens a tall suggestion list above the home search when it will not fit below', () => {
  expect(
    calculateSuggestionPlacement({
      anchorTop: 474,
      anchorBottom: 530,
      contentHeight: 458,
      viewportTop: 0,
      viewportBottom: 844,
    }),
  ).toEqual({ side: 'above', maxHeight: 320 })
})

it('keeps short suggestions below the input when they fit', () => {
  expect(
    calculateSuggestionPlacement({
      anchorTop: 474,
      anchorBottom: 530,
      contentHeight: 66,
      viewportTop: 0,
      viewportBottom: 844,
    }),
  ).toEqual({ side: 'below', maxHeight: 298 })
})

it('opens below a header search rather than clipping it above the viewport', () => {
  expect(
    calculateSuggestionPlacement({
      anchorTop: 8,
      anchorBottom: 40,
      contentHeight: 458,
      viewportTop: 0,
      viewportBottom: 844,
    }),
  ).toEqual({ side: 'below', maxHeight: 320 })
})

it('caps the list to the visible viewport when a keyboard or zoom reduces the space', () => {
  expect(
    calculateSuggestionPlacement({
      anchorTop: 300,
      anchorBottom: 356,
      contentHeight: 458,
      viewportTop: 120,
      viewportBottom: 480,
    }),
  ).toEqual({ side: 'above', maxHeight: 164 })
})

it('never returns a negative height when the anchor is outside the visible viewport', () => {
  expect(
    calculateSuggestionPlacement({
      anchorTop: 100,
      anchorBottom: 156,
      contentHeight: 458,
      viewportTop: 105,
      viewportBottom: 160,
    }),
  ).toEqual({ side: 'below', maxHeight: 0 })
})
