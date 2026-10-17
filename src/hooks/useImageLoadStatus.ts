import { useLayoutEffect, useRef, useState } from 'react'

export function useImageLoadStatus(src: string | undefined) {
  const imageRef = useRef<HTMLImageElement>(null)
  const [status, setStatus] = useState({ src, failed: false, loaded: false })
  const failed = status.src === src && status.failed
  const loaded = status.src === src && status.loaded

  useLayoutEffect(() => {
    const image = imageRef.current
    if (!src || !image?.complete) return
    setStatus({ src, failed: image.naturalWidth === 0, loaded: image.naturalWidth > 0 })
  }, [src])

  function handleLoad() {
    setStatus({ src, failed: false, loaded: true })
  }

  function handleError() {
    setStatus({ src, failed: true, loaded: false })
  }

  return { imageRef, failed, loaded, handleLoad, handleError }
}
