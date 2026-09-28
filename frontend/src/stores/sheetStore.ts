import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ScanItem } from '../types/scan'
import type { NeighborDirection, Sheet } from '../types/sheet'
import { createId, db, plain } from '../utils/db'
import { sortByYear } from '../utils/scale'
import { planAddNeighbor, planRemoveNeighbor } from '../utils/neighbors'

export type NewSheet = Omit<Sheet, 'id' | 'neighbors'> & {
  neighbors?: Sheet['neighbors']
}
export type NewScanItem = Omit<ScanItem, 'id'>

export interface NeighborActionResult {
  ok: boolean
  message: string
}

export const useSheetStore = defineStore('sheet', () => {
  const sheets = ref<Sheet[]>([])
  const allScans = ref<ScanItem[]>([])
  const currentSheet = ref<Sheet | null>(null)
  const loading = ref(false)
  const initialized = ref(false)
  let initialization: Promise<void> | null = null

  const currentScans = computed(() =>
    currentSheet.value
      ? allScans.value.filter((scan) => scan.sheetId === currentSheet.value?.id)
      : [],
  )

  async function init(): Promise<void> {
    if (initialized.value) {
      return
    }
    if (!initialization) {
      loading.value = true
      initialization = Promise.all([db.sheets.toArray(), db.scans.toArray()])
        .then(([sheetRows, scanRows]) => {
          sheets.value = sortByYear(sheetRows).reverse()
          allScans.value = scanRows
          initialized.value = true
        })
        .finally(() => {
          loading.value = false
        })
    }
    await initialization
  }

  async function addSheet(input: NewSheet): Promise<Sheet> {
    await init()
    const sheet: Sheet = {
      ...input,
      id: createId('sheet'),
      neighbors: input.neighbors ?? [],
    }
    await db.sheets.add(plain(sheet))
    sheets.value = sortByYear([...sheets.value, sheet]).reverse()
    currentSheet.value = sheet
    return sheet
  }

  async function loadSheet(id: string): Promise<void> {
    await init()
    currentSheet.value = sheets.value.find((sheet) => sheet.id === id) ?? (await db.sheets.get(id)) ?? null
  }

  /**
   * 应用一次邻接变更。两侧图幅在同一个 Dexie 事务内落库：
   * 任一侧保存失败时整个事务回滚，内存状态也不改动，两边都回到原样。
   */
  async function commitNeighborMutation(
    plan: { byId: Map<string, Sheet> } | { error: string },
  ): Promise<NeighborActionResult> {
    if ('error' in plan) {
      return { ok: false, message: plan.error }
    }

    const changed = [...plan.byId.values()]
    try {
      await db.transaction('rw', db.sheets, async () => {
        for (const sheet of changed) {
          await db.sheets.put(plain(sheet))
        }
      })
    } catch {
      return { ok: false, message: '邻接关系保存失败，两侧记录已恢复原状，请重试。' }
    }

    const changedById = new Map(changed.map((sheet) => [sheet.id, sheet]))
    sheets.value = sortByYear(
      sheets.value.map((sheet) => changedById.get(sheet.id) ?? sheet),
    ).reverse()
    if (currentSheet.value && changedById.has(currentSheet.value.id)) {
      currentSheet.value = changedById.get(currentSheet.value.id) ?? currentSheet.value
    }
    return { ok: true, message: '邻接关系已更新。' }
  }

  async function addNeighbor(
    sourceId: string,
    direction: NeighborDirection,
    code: string,
  ): Promise<NeighborActionResult> {
    await init()
    return commitNeighborMutation(planAddNeighbor(sheets.value, sourceId, direction, code))
  }

  async function removeNeighbor(sourceId: string, direction: NeighborDirection): Promise<NeighborActionResult> {
    await init()
    return commitNeighborMutation(planRemoveNeighbor(sheets.value, sourceId, direction))
  }

  async function addScan(input: NewScanItem): Promise<ScanItem> {
    await init()
    const scan: ScanItem = { ...input, id: createId('scan') }
    if (scan.isPrimary) {
      await db.scans.where('sheetId').equals(scan.sheetId).modify({ isPrimary: false })
      allScans.value = allScans.value.map((item) =>
        item.sheetId === scan.sheetId ? { ...item, isPrimary: false } : item,
      )
    }
    await db.scans.add(plain(scan))
    allScans.value = [...allScans.value, scan]
    return scan
  }

  async function setPrimaryScan(scanId: string): Promise<void> {
    const target = allScans.value.find((scan) => scan.id === scanId)
    if (!target) {
      return
    }
    await db.scans.where('sheetId').equals(target.sheetId).modify({ isPrimary: false })
    await db.scans.update(scanId, { isPrimary: true })
    allScans.value = allScans.value.map((scan) => {
      if (scan.sheetId !== target.sheetId) {
        return scan
      }
      return { ...scan, isPrimary: scan.id === scanId }
    })
  }

  function getSheetById(id: string): Sheet | undefined {
    return sheets.value.find((sheet) => sheet.id === id)
  }

  function getSheetByCode(code: string): Sheet | undefined {
    return sheets.value.find((sheet) => sheet.code === code)
  }

  function getScansForSheet(sheetId: string): ScanItem[] {
    return allScans.value
      .filter((scan) => scan.sheetId === sheetId)
      .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary))
  }

  return {
    sheets,
    allScans,
    currentSheet,
    currentScans,
    loading,
    initialized,
    init,
    addSheet,
    loadSheet,
    addNeighbor,
    removeNeighbor,
    addScan,
    setPrimaryScan,
    getSheetById,
    getSheetByCode,
    getScansForSheet,
  }
})
