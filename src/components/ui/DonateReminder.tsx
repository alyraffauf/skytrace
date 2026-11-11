import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout'
import { Text } from '@astryxdesign/core/Text'
import { DonateButton } from './DonateButton'
import { useDonateReminder } from '../../hooks/useDonateReminder'

export function DonateReminder() {
  const { visible, dismiss } = useDonateReminder()
  if (!visible) return null

  function handleOpenChange(open: boolean) {
    if (!open) dismiss()
  }

  return (
    <Dialog isOpen={visible} onOpenChange={handleOpenChange}>
      <Layout
        height="auto"
        header={<DialogHeader title="Love SkyTrace?" onOpenChange={handleOpenChange} />}
        content={
          <LayoutContent isScrollable={false}>
            <Text color="secondary">
              It&apos;s free and open source, but maintaining it takes time and servers cost money.
            </Text>
          </LayoutContent>
        }
        footer={
          <LayoutFooter>
            <div className="flex justify-end">
              <DonateButton label="Support on Ko-fi" size="md" />
            </div>
          </LayoutFooter>
        }
      />
    </Dialog>
  )
}
