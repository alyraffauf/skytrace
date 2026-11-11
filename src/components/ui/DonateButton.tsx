import { Button, type ButtonProps } from '@astryxdesign/core/Button'
import { HeartIcon } from '@heroicons/react/24/outline'

export function DonateButton({
  label = 'Donate',
  size = 'lg',
  className,
}: {
  label?: string
  size?: ButtonProps['size']
  className?: string
}) {
  return (
    <Button
      label={label}
      href="https://ko-fi.com/alyraffauf"
      target="_blank"
      rel="noreferrer"
      variant="primary"
      size={size}
      icon={<HeartIcon className="size-4" aria-hidden="true" />}
      className={className}
    />
  )
}
