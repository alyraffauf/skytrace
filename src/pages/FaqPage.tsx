import Markdown from 'react-markdown'
import faqMarkdown from '../content/faq.md?raw'
import { blockTargetDid } from '../config/privacy'
import { minimumListBlocking } from '../config/listVisibility'

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
    optOutAccountUrl: optOutAccountDid ? `https://bsky.app/profile/${optOutAccountDid}` : '',
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
    <article className="mx-auto w-full max-w-2xl py-10 sm:py-14 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight sm:[&_h1]:text-4xl [&_h2]:mb-3 [&_h2]:mt-9 [&_h2]:text-lg [&_h2]:font-semibold [&_p]:mt-3 [&_p]:text-sm [&_p]:leading-7 [&_p]:text-zinc-600 dark:[&_p]:text-zinc-400 [&_a]:text-violet-700 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-violet-900 dark:[&_a]:text-violet-400 dark:hover:[&_a]:text-violet-300 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:text-sm [&_li]:leading-7">
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
            return (
              <h2 id={id} className="scroll-mt-16">
                {children}
              </h2>
            )
          },
        }}
      >
        {configuredFaqMarkdown()}
      </Markdown>
    </article>
  )
}
