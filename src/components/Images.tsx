import { PhotoIcon, UserIcon } from '@heroicons/react/24/outline'
import { useLayoutEffect, useRef, useState } from 'react'

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
  const imageRef = useRef<HTMLImageElement>(null)
  const [status, setStatus] = useState({ src, failed: false, loaded: false })
  const failed = status.src === src && status.failed
  const loaded = status.src === src && status.loaded

  useLayoutEffect(() => {
    const image = imageRef.current
    if (!src || !image?.complete) return
    setStatus({ src, failed: image.naturalWidth === 0, loaded: image.naturalWidth > 0 })
  }, [src])

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
      className={`${props.className ?? ''} media-image ${loaded ? 'media-image-loaded' : ''}`}
      onLoad={(event) => {
        setStatus({ src, failed: false, loaded: true })
        onLoad?.(event)
      }}
      onError={(event) => {
        setStatus({ src, failed: true, loaded: false })
        onError?.(event)
      }}
    />
  )
}
