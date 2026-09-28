import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import type { NeighborDirection, NeighborLink, Sheet } from '../types/sheet'
import { NEIGHBOR_DIRECTIONS } from '../types/sheet'
import { useSheetStore } from '../stores/sheetStore'

export { NEIGHBOR_DIRECTIONS }
export type { NeighborDirection }

export interface NeighborEntry extends NeighborLink {
  sheet?: Sheet
}

export interface NeighborStatus {
  source?: Sheet
  entries: NeighborEntry[]
  missingCodes: string[]
  adjacentCount: number
}

export function useSheetNeighbors(sheetId: MaybeRefOrGetter<string>) {
  const sheetStore = useSheetStore()

  function getNeighborStatus(id: string): NeighborStatus {
    const source = sheetStore.getSheetById(id)
    const entries: NeighborEntry[] = (source?.neighbors ?? []).map((link) => {
      const sheet = sheetStore.getSheetByCode(link.code)
      return {
        ...link,
        ...(sheet ? { sheet } : {}),
      }
    })
    const missingCodes = entries.filter((entry) => !entry.sheet).map((entry) => entry.code)

    return {
      ...(source ? { source } : {}),
      entries,
      missingCodes,
      adjacentCount: entries.length,
    }
  }

  const status = computed(() => getNeighborStatus(toValue(sheetId)))

  return {
    status,
    getNeighborStatus,
  }
}
