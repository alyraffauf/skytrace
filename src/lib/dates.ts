const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function formatDate(value?: string): string | undefined {
  return format(value, dateFormatter)
}

export function formatDateTime(value?: string): string | undefined {
  return format(value, dateTimeFormatter)
}

function format(value: string | undefined, formatter: Intl.DateTimeFormat): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : formatter.format(date)
}
