import { PhotoIcon, UserIcon } from '@heroicons/react/24/outline'
import { useImageLoadStatus } from '../../hooks/useImageLoadStatus'

type ImageWithFallbackProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  fallback: 'avatar' | 'image'
  alt: string
}

export function ImageWithFallback({
  fallback,
  className = '',
  onError,
  onLoad,
  src,
  alt,
  ...props
}: ImageWithFallbackProps) {
  const { imageRef, failed, loaded, handleLoad, handleError } = useImageLoadStatus(src)

  if (failed || !src) {
    const Icon = fallback === 'avatar' ? UserIcon : PhotoIcon
    const isDecorative = alt === ''
    return (
      <span
        title={props.title}
        role={isDecorative ? undefined : 'img'}
        aria-hidden={isDecorative || undefined}
        aria-label={
          isDecorative ? undefined : alt || (fallback === 'avatar' ? 'Avatar unavailable' : 'Image unavailable')
        }
        className={`grid place-items-center bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500 ${className}`}
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
      alt={alt}
      decoding={props.decoding ?? 'async'}
      data-loaded={loaded || undefined}
      className={`${className} media-image`}
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
