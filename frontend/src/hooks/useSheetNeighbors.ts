import { computed, toValue, type MaybeRefOrGetter } from 'vue'
import {
  NEIGHBOR_DIRECTIONS,
  type NeighborDirection,
  type NeighborLink,
  type Sheet,
} from '../types/sheet'
import { useSheetStore } from '../stores/sheetStore'

export { NEIGHBOR_DIRECTIONS }
export type { NeighborDirection }

export interface NeighborEntry {
  code: string
  direction: NeighborDirection
  sheet?: Sheet
}

export interface NeighborStatus {
  source?: Sheet
  entries: NeighborEntry[]
  missingCodes: string[]
  adjacentCount: number
}

/**
 * 兼容旧数据：优先读取带方位的 neighbors；
 * 缺失时退回按位置排列的 neighborCodes（东、南、西、北、东北、西南）。
 */
export function resolveNeighborLinks(sheet: Sheet | undefined): NeighborLink[] {
  if (!sheet) {
    return []
  }
  if (Array.isArray(sheet.neighbors) && sheet.neighbors.length > 0) {
    return sheet.neighbors
  }
  return (sheet.neighborCodes ?? []).map((code, index) => ({
    direction: NEIGHBOR_DIRECTIONS[index] ?? NEIGHBOR_DIRECTIONS[0],
    code,
  }))
}

export function useSheetNeighbors(sheetId: MaybeRefOrGetter<string>) {
  const sheetStore = useSheetStore()

  function getNeighborStatus(id: string): NeighborStatus {
    const source = sheetStore.getSheetById(id)
    const links = resolveNeighborLinks(source)
    const entries = links.map((link) => {
      const sheet = sheetStore.getSheetByCode(link.code)
      return {
        code: link.code,
        direction: link.direction,
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
