import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'

export function SourceIssues({ issues, retry }: { issues: string[]; retry: () => void }) {
  const sources = new Set(issues).size
  return (
    <Banner
      role="status"
      status="warning"
      container="section"
      title={`${sources} ${sources === 1 ? 'source' : 'sources'} unavailable`}
      endContent={<Button label="Retry" variant="ghost" onClick={retry} />}
    />
  )
}
