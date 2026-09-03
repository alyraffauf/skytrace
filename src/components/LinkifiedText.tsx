import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { profilePath } from '../lib/routes'
import { safeHttpUrl } from '../lib/parse'

const linkPattern =
  /(@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}|https?:\/\/[^\s]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s]*)?)/gi
const trailingPunctuation = /[),.!?;:]+$/

type TextPart = { text: string; href?: string; internal?: boolean }

function linkTarget(token: string): Pick<TextPart, 'href' | 'internal'> {
  if (token.startsWith('@')) return { href: profilePath(token.slice(1)), internal: true }
  const candidate = /^https?:\/\//i.test(token) ? token : `https://${token}`
  const href = safeHttpUrl(candidate)
  return href ? { href } : {}
}

export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const parts: TextPart[] = []
  let position = 0

  for (const match of text.matchAll(linkPattern)) {
    const index = match.index
    if (index > position) parts.push({ text: text.slice(position, index) })
    const matchedText = match[0]
    const punctuation = matchedText.match(trailingPunctuation)?.[0] ?? ''
    const linkText = punctuation ? matchedText.slice(0, -punctuation.length) : matchedText
    parts.push({ text: linkText, ...linkTarget(linkText) })
    if (punctuation) parts.push({ text: punctuation })
    position = index + matchedText.length
  }

  if (position < text.length) parts.push({ text: text.slice(position) })

  return (
    <p className={className}>
      {parts.map((part, index) => {
        const key = `${part.text}-${index}`
        const className =
          'underline decoration-zinc-300 underline-offset-2 hover:text-rose-700 hover:decoration-rose-300 dark:decoration-zinc-600 dark:hover:text-rose-300 dark:hover:decoration-rose-700'
        if (part.href && part.internal)
          return (
            <Link key={key} to={part.href} className={className}>
              {part.text}
            </Link>
          )
        if (part.href)
          return (
            <a key={key} href={part.href} target="_blank" rel="noreferrer" className={className}>
              {part.text}
            </a>
          )
        return <Fragment key={key}>{part.text}</Fragment>
      })}
    </p>
  )
}
