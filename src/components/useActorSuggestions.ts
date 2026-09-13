import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { queryKeys } from '../data/queryKeys'
import { searchActorsTypeahead } from '../data/xrpc'

export function useActorSuggestions({ input, hasFocus }: { input: string; hasFocus: boolean }) {
  const [debouncedInput, setDebouncedInput] = useState('')

  const typeaheadQuery = input.trim().replace(/^@/, '')
  const canSuggest =
    typeaheadQuery.length >= 2 && !typeaheadQuery.startsWith('did:') && !/^https?:\/\//i.test(typeaheadQuery)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedInput(canSuggest ? typeaheadQuery : ''), 180)
    return () => window.clearTimeout(timer)
  }, [canSuggest, typeaheadQuery])

  const suggestionsQuery = useQuery({
    queryKey: queryKeys.actorSuggestions(debouncedInput),
    queryFn: ({ signal }) => searchActorsTypeahead(debouncedInput, signal),
    enabled: hasFocus && debouncedInput.length >= 2,
    staleTime: 5 * 60_000,
  })
  const suggestions = suggestionsQuery.data ?? []
  const canShowSuggestions =
    hasFocus &&
    canSuggest &&
    debouncedInput === typeaheadQuery &&
    (suggestionsQuery.isFetching || suggestionsQuery.isSuccess)

  return { suggestions, isFetching: suggestionsQuery.isFetching, canShowSuggestions }
}
