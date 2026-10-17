import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RecordLinksMenu } from '../src/components/records/RecordLinksMenu'
import { did } from './actorFixtures'
import { SOCIAL_APPS } from '../src/config/socialApps'

describe('record links', () => {
  const postUri = `at://${did}/app.bsky.feed.post/3example`

  it('derives record destinations and preserves explicit social destinations', () => {
    const view = render(<RecordLinksMenu recordUri={postUri} label="post" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open links for post' }))
    expect(screen.getByRole('menuitem', { name: /Skythread/ })).toHaveAttribute(
      'href',
      `https://skythread.mackuba.eu/?author=did%3Aplc%3Aewvi7nxzyoun6zhxrhs64oiz&post=3example`,
    )
    for (const app of SOCIAL_APPS) {
      expect(screen.getByRole('menuitem', { name: app.label })).toHaveAttribute(
        'href',
        `${app.origin}/profile/${did}/post/3example`,
      )
    }
    for (const [collection, override, destination] of [
      ['app.bsky.graph.list', undefined, `/profile/${did}/lists/3example`],
      ['app.bsky.graph.listitem', '/profile/list-owner/lists/target', '/profile/list-owner/lists/target'],
      ['app.bsky.graph.block', '/profile/blocked-account', '/profile/blocked-account'],
      ['app.bsky.feed.repost', undefined, undefined],
      ['app.bsky.feed.post', '', undefined],
    ] as const) {
      view.rerender(
        <RecordLinksMenu recordUri={`at://${did}/${collection}/3example`} socialPath={override} label="record" />,
      )
      if (destination)
        expect(screen.getByRole('menuitem', { name: 'Bluesky' })).toHaveAttribute(
          'href',
          `https://bsky.app${destination}`,
        )
      else expect(screen.queryByRole('menuitem', { name: 'Bluesky' })).not.toBeInTheDocument()
    }
    view.rerender(<RecordLinksMenu recordUri={`at://${did}/app.bsky.graph.block/3example`} label="block" />)
    expect(screen.queryByRole('menuitem', { name: /Skythread/ })).not.toBeInTheDocument()
  })
})
