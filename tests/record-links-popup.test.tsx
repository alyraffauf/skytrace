import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { RecordLinksMenu } from '../src/components/records/RecordLinksMenu'
import { SOCIAL_APPS } from '../src/config/socialApps'
import { socialProfilePath } from '../src/lib/links'

const uri = 'at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/app.bsky.feed.post/example'

it.each([
  ['app.bsky.actor.profile', 'self', ''],
  ['app.bsky.feed.post', 'test:post', '/post/test:post'],
  ['app.bsky.graph.list', 'test:list', '/lists/test:list'],
])('uses client-compatible URLs for %s in every social app menu link', (collection, rkey, suffix) => {
  const did = 'did:plc:3355xpqovrs7rngoid6job4m'
  render(
    <RecordLinksMenu
      recordUri={`at://${did}/${collection}/${rkey}`}
      socialPath={collection === 'app.bsky.actor.profile' ? socialProfilePath(did) : undefined}
      label="record"
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Open links for record' }))

  for (const app of SOCIAL_APPS) {
    expect(screen.getByRole('menuitem', { name: app.label })).toHaveAttribute(
      'href',
      `${app.origin}/profile/did:plc:3355xpqovrs7rngoid6job4m${suffix}`,
    )
  }
})

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

it('supports menu keyboard navigation and restores trigger focus on Escape', async () => {
  const { button } = setup()
  const menu = screen.getByRole('menu')
  await waitFor(() => expect(menu).toHaveFocus())
  fireEvent.keyDown(menu, { key: 'ArrowDown' })
  await waitFor(() =>
    expect(menu).toHaveAttribute('aria-activedescendant', screen.getByRole('menuitem', { name: 'PDSls' }).id),
  )
  fireEvent.keyDown(menu, { key: 'End' })
  await waitFor(() =>
    expect(menu).toHaveAttribute('aria-activedescendant', screen.getByRole('menuitem', { name: 'Skythread' }).id),
  )
  fireEvent.keyDown(menu, { key: 'Escape' })
  await waitFor(() => expect(button).toHaveFocus())
  expect(button).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(button)
  expect(screen.getByRole('menu')).toBeVisible()
  fireEvent.click(button)
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

it('dismisses on outside clicks and link selection without locking page scroll', async () => {
  const { button } = setup()
  expect(document.documentElement.style.overflow).not.toBe('hidden')
  await waitFor(() => expect(screen.getByRole('menu')).toHaveFocus())
  const outside = screen.getByText('Outside')
  fireEvent.pointerDown(outside)
  fireEvent.pointerUp(outside)
  expect(button).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(button)
  fireEvent.click(screen.getByRole('menuitem', { name: 'PDSls' }))
  expect(button).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(button)
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Tab' })
  await waitFor(() => expect(button).toHaveAttribute('aria-expanded', 'false'))
})
