import Markdown from 'react-markdown'
import faqMarkdown from '../content/faq.md?raw'
import { blockTargetDid } from '../config/privacy'
import { minimumListBlocking } from '../config/listVisibility'
import { socialProfilePath } from '../lib/links'

function configuredFaqMarkdown(): string {
  const optOutAccountDid = blockTargetDid()
  const minimumBlocking = minimumListBlocking()
  const conditions: Record<string, boolean> = {
    'opt-out-enabled': optOutAccountDid !== undefined,
    'opt-out-disabled': optOutAccountDid === undefined,
    'minimum-enabled': minimumBlocking !== undefined,
    'minimum-disabled': minimumBlocking === undefined,
  }
  const values: Record<string, string> = {
    optOutAccountUrl: optOutAccountDid ? `https://bsky.app${socialProfilePath(optOutAccountDid)}` : '',
    minimumBlocking: minimumBlocking?.toLocaleString() ?? '',
    blockingAccounts: minimumBlocking === 1 ? 'account blocks' : 'accounts block',
  }
  return faqMarkdown
    .replace(/<!-- if ([a-z-]+) -->([\s\S]*?)<!-- endif -->/g, (_match, condition: string, content: string) =>
      conditions[condition] ? content : '',
    )
    .replace(/\{\{(\w+)\}\}/g, (match, name: string) => values[name] ?? match)
}

export function FaqPage() {
  return (
    <article className="faq-content mx-auto w-full max-w-2xl py-10 sm:py-14">
      <title>FAQ — SkyTrace</title>
      <Markdown
        components={{
          h2: ({ children }) => {
            const heading = String(children)
            const id =
              heading === 'How do I opt out?'
                ? 'opt-out'
                : heading
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-|-$/g, '')
            return <h2 id={id}>{children}</h2>
          },
        }}
      >
        {configuredFaqMarkdown()}
      </Markdown>
    </article>
  )
}
