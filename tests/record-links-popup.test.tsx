import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { RecordLinksMenu } from '../src/components/records/RecordLinksMenu'

const uri = 'at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/app.bsky.feed.post/example'
function setup() {
  const view = render(
    <>
      <RecordLinksMenu recordUri={uri} socialPath="/profile/example/post/example" label="post" />
      <button>Outside</button>
    </>,
  )
  const button = screen.getByRole('button', { name: 'Open links for post' })
  fireEvent.click(button)
  return { ...view, button }
}

it('focuses the first link on every opening and restores trigger focus on Escape', () => {
  const { button } = setup()
  expect(screen.getByRole('link', { name: 'PDSls' })).toHaveFocus()
  act(() => screen.getByRole('link', { name: 'Skythread' }).focus())
  expect(button).toHaveAttribute('aria-expanded', 'true')
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(button).toHaveFocus()
  expect(button).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(button)
  expect(screen.getByRole('link', { name: 'PDSls' })).toHaveFocus()
  fireEvent.click(button)
  expect(screen.queryByRole('link', { name: 'PDSls' })).not.toBeInTheDocument()
})

it('dismisses on outside pointer and focus events, and link selection', () => {
  const { button } = setup()
  fireEvent.pointerDown(screen.getByRole('link', { name: 'PDSls' }))
  expect(button).toHaveAttribute('aria-expanded', 'true')
  fireEvent.pointerDown(screen.getByText('Outside'))
  expect(button).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(button)
  act(() => screen.getByText('Outside').focus())
  expect(button).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(button)
  fireEvent.click(screen.getByRole('link', { name: 'PDSls' }))
  expect(button).toHaveAttribute('aria-expanded', 'false')
})

it('positions within viewport edges and repositions on resize and captured scroll', () => {
  vi.stubGlobal('innerWidth', 390)
  vi.stubGlobal('innerHeight', 600)
  let top = 570
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-record-links')
      ? ({ width: 160, height: 200 } as DOMRect)
      : ({ right: 390, top, bottom: top + 30 } as DOMRect)
  })
  const { button } = setup()
  const popup = document.getElementById(button.getAttribute('aria-controls')!)!
  expect(popup).toHaveStyle({ visibility: 'visible' })
  expect(parseFloat(popup.style.left)).toBeGreaterThanOrEqual(0)
  expect(parseFloat(popup.style.left) + 160).toBeLessThanOrEqual(390)
  expect(parseFloat(popup.style.top)).toBeGreaterThanOrEqual(0)
  expect(parseFloat(popup.style.top) + 200).toBeLessThanOrEqual(top)
  top = 10
  fireEvent.resize(window)
  const resizedTop = parseFloat(popup.style.top)
  expect(resizedTop).toBeGreaterThanOrEqual(top + 30)
  expect(resizedTop + 200).toBeLessThanOrEqual(600)
  top = 100
  fireEvent.scroll(button.parentElement!)
  expect(parseFloat(popup.style.top)).toBeGreaterThan(resizedTop)
  expect(parseFloat(popup.style.top)).toBeGreaterThanOrEqual(top + 30)
  expect(parseFloat(popup.style.top) + 200).toBeLessThanOrEqual(600)
})
