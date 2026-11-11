import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'
import type { HTMLAttributes, RefObject } from 'react'
import type { ActorSuggestion } from '../../types'
import { ImageWithFallback } from '../ui/ImageWithFallback'
import { useSuggestionPlacement } from './useSuggestionPlacement'

export function ActorSuggestions({
  anchorRef,
  suggestions,
  isFetching,
  listboxProps,
  getOptionProps,
}: {
  anchorRef: RefObject<HTMLDivElement | null>
  suggestions: ActorSuggestion[]
  isFetching: boolean
  listboxProps: HTMLAttributes<HTMLDivElement>
  getOptionProps: (index: number) => HTMLAttributes<HTMLDivElement>
}) {
  const { popupRef, contentRef, side, maxHeight } = useSuggestionPlacement(anchorRef)
  return (
    <Card
      ref={popupRef}
      padding={0}
      elevation="low"
      className={`absolute inset-x-0 z-50 overflow-y-auto text-left ${side === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'}`}
      style={{ maxHeight }}
    >
      <div ref={contentRef}>
        {suggestions.length > 0 ? (
          <div {...listboxProps} aria-label="Account suggestions" className="py-1">
            {suggestions.map((suggestion, index) => (
              <div
                key={suggestion.did}
                {...getOptionProps(index)}
                className="flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-2 aria-selected:bg-ui-tint"
              >
                <ImageWithFallback
                  src={suggestion.avatar}
                  alt=""
                  fallback="avatar"
                  className="size-8 shrink-0 rounded-ui-full object-cover"
                />
                <span className="min-w-0">
                  {suggestion.displayName && (
                    <Text type="label" display="block" maxLines={1} hasTruncateTooltip={false}>
                      {suggestion.displayName}
                    </Text>
                  )}
                  <Text
                    type={suggestion.displayName ? 'body' : 'label'}
                    color={suggestion.displayName ? 'secondary' : 'primary'}
                    display="block"
                    maxLines={1}
                    hasTruncateTooltip={false}
                  >
                    @{suggestion.handle}
                  </Text>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Text as="p" color="secondary" display="block" className="p-3">
            {isFetching ? 'Searching...' : 'No matching accounts'}
          </Text>
        )}
      </div>
    </Card>
  )
}
