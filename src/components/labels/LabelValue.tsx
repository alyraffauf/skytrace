export function LabelValue({
  value,
  displayName,
  className,
}: {
  value: string
  displayName?: string
  className?: string
}) {
  if (!displayName) return <code className={className}>{value}</code>
  return (
    <span className={className} title={`Raw label: ${value}`}>
      {displayName}
    </span>
  )
}
