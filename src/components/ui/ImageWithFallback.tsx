import { PhotoIcon, UserIcon } from '@heroicons/react/24/outline'
import { useImageLoadStatus } from '../../hooks/useImageLoadStatus'

type ImageWithFallbackProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  fallback: 'avatar' | 'image'
  fallbackClassName?: string
}

export function ImageWithFallback({
  fallback,
  fallbackClassName = '',
  onError,
  onLoad,
  src,
  ...props
}: ImageWithFallbackProps) {
  const { imageRef, failed, loaded, handleLoad, handleError } = useImageLoadStatus(src)

  if (failed || !src) {
    const Icon = fallback === 'avatar' ? UserIcon : PhotoIcon
    const isDecorative = props.alt === ''
    return (
      <span
        role={isDecorative ? undefined : 'img'}
        aria-hidden={isDecorative || undefined}
        aria-label={
          isDecorative ? undefined : props.alt || (fallback === 'avatar' ? 'Avatar unavailable' : 'Image unavailable')
        }
        className={`grid place-items-center bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500 ${fallbackClassName}`}
      >
        <Icon className="size-1/2" aria-hidden="true" />
      </span>
    )
  }
  return (
    <img
      ref={imageRef}
      {...props}
      src={src}
      decoding={props.decoding ?? 'async'}
      data-loaded={loaded || undefined}
      className={`${props.className ?? ''} media-image`}
      onLoad={(event) => {
        handleLoad()
        onLoad?.(event)
      }}
      onError={(event) => {
        handleError()
        onError?.(event)
      }}
    />
  )
}
