import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ScanItem } from '../types/scan'
import {
  OPPOSITE_DIRECTION,
  type NeighborDirection,
  type NeighborLink,
  type Sheet,
} from '../types/sheet'
import { createId, db, plain } from '../utils/db'
import { sortByYear } from '../utils/scale'

export type NewSheet = Omit<Sheet, 'id' | 'neighbors' | 'neighborCodes'> & {
  neighbors?: NeighborLink[]
}
export type NewScanItem = Omit<ScanItem, 'id'>

/** 去除空号、去重并按固定方位顺序排列邻接登记。 */
export function normalizeNeighbors(links: NeighborLink[] | undefined): NeighborLink[] {
  const seen = new Set<string>()
  const result: NeighborLink[] = []
  for (const link of links ?? []) {
    const code = link?.code?.trim()
    const direction = link?.direction
    if (!code || !direction || !OPPOSITE_DIRECTION[direction]) {
      continue
    }
    const key = `${direction}::${code}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push({ direction, code })
  }
  const order: NeighborDirection[] = ['东', '南', '西', '北', '东北', '西南']
  return result.sort((left, right) => order.indexOf(left.direction) - order.indexOf(right.direction))
}

function neighborCodesOf(sheet: Sheet): string[] {
  return sheet.neighbors.map((link) => link.code)
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
          // 兼容旧库 / 旧导出：neighbors 缺失时回退到按位置排列的 neighborCodes。
          sheets.value = sortByYear(sheetRows.map(hydrateSheet)).reverse()
          allScans.value = scanRows
          initialized.value = true
        })
        .finally(() => {
          loading.value = false
        })
    }
    await initialization
  }

  function hydrateSheet(raw: Sheet): Sheet {
    let neighbors = normalizeNeighbors(raw.neighbors)
    // 旧库 / 旧导出可能只有按位置排列的 neighborCodes，沿用旧位置映射回填。
    if (neighbors.length === 0 && raw.neighborCodes?.length) {
      const order: NeighborDirection[] = ['东', '南', '西', '北', '东北', '西南']
      neighbors = normalizeNeighbors(
        raw.neighborCodes.map((code, index) => ({
          direction: order[index] ?? order[0],
          code,
        })),
      )
    }
    return {
      ...raw,
      neighbors,
      neighborCodes: neighbors.map((link) => link.code),
    }
  }

  async function addSheet(input: NewSheet): Promise<Sheet> {
    await init()
    const neighbors = normalizeNeighbors(input.neighbors)
    const sheet: Sheet = {
      ...input,
      id: createId('sheet'),
      neighbors,
      neighborCodes: neighborCodesOf({ neighbors } as Sheet),
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

  /**
   * 在 sourceId 的 direction 方位登记邻接图 code。
   * 两张图在同一事务内互相登记（对向方位自动对应）；
   * 若被登记图已入藏，其对向方位若已登记别的邻接图会拒绝，避免误把南北写反；
   * 任一写入失败，事务回滚，两边都保持原样。
   */
  async function setNeighbor(sourceId: string, direction: NeighborDirection, rawCode: string): Promise<Sheet> {
    await init()
    const code = rawCode.trim()
    const opposite = OPPOSITE_DIRECTION[direction]
    if (!code) {
      throw new Error('请填写邻接图幅号。')
    }
    const source = sheets.value.find((sheet) => sheet.id === sourceId)
    if (!source) {
      throw new Error('未找到当前图幅。')
    }
    if (code === source.code) {
      throw new Error('图幅不能与自身登记邻接。')
    }
    const target = sheets.value.find((sheet) => sheet.code === code)

    // 以当前内存为快照，先在副本上把两边的邻接表算好，再在事务内整批落库。
    const working = new Map<string, Sheet>()
    for (const sheet of sheets.value) {
      working.set(sheet.id, {
        ...sheet,
        neighbors: normalizeNeighbors(sheet.neighbors),
      })
    }
    const nextSource = working.get(sourceId)!
    const previousAtDirection = nextSource.neighbors.find((link) => link.direction === direction)
    if (previousAtDirection?.code === code) {
      // 关系已存在且方位相同，无需处理。
      return nextSource
    }

    if (target) {
      const nextTarget = working.get(target.id)!
      const occupied = nextTarget.neighbors.find(
        (link) => link.direction === opposite && link.code !== source.code,
      )
      if (occupied) {
        throw new Error(`该图幅的${opposite}方已登记「${occupied.code}」，请先在对侧撤除后再登记。`)
      }
      // 对侧已在别的方位登记本图，而本图并没有同一条旧关系要调换：
      // 这通常意味着两侧方向相矛盾（如一侧记东、另一侧误记南），拒绝以免把方向悄悄改反。
      const reverseAtOtherDirection = nextTarget.neighbors.find(
        (link) => link.code === source.code && link.direction !== opposite,
      )
      const sourceOwnsLink = nextSource.neighbors.some((link) => link.code === code)
      if (reverseAtOtherDirection && !sourceOwnsLink) {
        throw new Error(
          `「${code}」已在其${reverseAtOtherDirection.direction}方登记本图，方向与本次登记不符，请先撤除旧关系再登记。`,
        )
      }
    }

    // 本图：撤掉该方位旧登记，撤掉该图号在其他方位的旧登记，再挂新关系。
    nextSource.neighbors = nextSource.neighbors.filter(
      (link) => link.direction !== direction && link.code !== code,
    )
    nextSource.neighbors = normalizeNeighbors([...nextSource.neighbors, { direction, code }])

    if (target) {
      const nextTarget = working.get(target.id)!
      // 对向图：撤掉对向方位旧登记，撤掉本图号在其他方位的旧登记，再挂对向关系。
      nextTarget.neighbors = nextTarget.neighbors.filter(
        (link) => link.direction !== opposite && link.code !== source.code,
      )
      nextTarget.neighbors = normalizeNeighbors([
        ...nextTarget.neighbors,
        { direction: opposite, code: source.code },
      ])
    }

    // 本图该方位原挂的图幅若已入藏，它指向本图的对向记录随撤关系一起清理。
    if (previousAtDirection && previousAtDirection.code !== code) {
      const oldNeighbor = [...working.values()].find((sheet) => sheet.code === previousAtDirection.code)
      if (oldNeighbor && oldNeighbor.id !== target?.id) {
        oldNeighbor.neighbors = oldNeighbor.neighbors.filter(
          (link) => !(link.direction === opposite && link.code === source.code),
        )
      }
    }

    // 同一图号若原挂在别的方位，上面 nextTarget 已统一按新对向方位重挂，旧反向登记同步清除。

    const changedIds = new Set<string>([sourceId])
    if (target) {
      changedIds.add(target.id)
    }
    if (previousAtDirection) {
      const oldNeighbor = sheets.value.find((sheet) => sheet.code === previousAtDirection.code)
      if (oldNeighbor) {
        changedIds.add(oldNeighbor.id)
      }
    }

    try {
      await db.transaction('rw', db.sheets, async () => {
        for (const id of changedIds) {
          const row = working.get(id)!
          row.neighborCodes = row.neighbors.map((link) => link.code)
          await db.sheets.put(plain(row))
        }
      })
    } catch (error) {
      // 事务失败（含上面校验之外的约束错误）时不动内存，两边保持原样。
      throw error instanceof Error ? error : new Error('邻接关系保存失败，两边登记已恢复原样。')
    }

    // 事务成功后再同步内存状态。
    const refreshed = new Map((await db.sheets.toArray()).map((row) => [row.id, hydrateSheet(row)]))
    sheets.value = sortByYear(
      sheets.value.map((sheet) => refreshed.get(sheet.id) ?? sheet),
    ).reverse()
    const updated = refreshed.get(sourceId)
    if (updated) {
      currentSheet.value = updated
    }
    return updated!
  }

  /**
   * 撤除 sourceId 在 direction 方位的邻接登记；
   * 若对侧图幅已入藏，其指向本图的对向记录一并清理。
   */
  async function removeNeighbor(sourceId: string, direction: NeighborDirection): Promise<void> {
    await init()
    const source = sheets.value.find((sheet) => sheet.id === sourceId)
    const link = source?.neighbors.find((item) => item.direction === direction)
    if (!source || !link) {
      return
    }

    await db.transaction('rw', db.sheets, async () => {
      const rows = await db.sheets.toArray()
      const opposite = OPPOSITE_DIRECTION[direction]

      const sourceRow = rows.find((row) => row.id === sourceId)
      if (!sourceRow) {
        return
      }
      const nextSource: Sheet = {
        ...sourceRow,
        neighbors: normalizeNeighbors(sourceRow.neighbors).filter(
          (item) => item.direction !== direction,
        ),
      }
      nextSource.neighborCodes = nextSource.neighbors.map((item) => item.code)
      await db.sheets.put(plain(nextSource))

      // 对向图幅已入藏：清掉它指向本图的对向记录。
      const targetRow = rows.find((row) => row.code === link.code)
      if (targetRow) {
        const nextTarget: Sheet = {
          ...targetRow,
          neighbors: normalizeNeighbors(targetRow.neighbors).filter(
            (item) => !(item.direction === opposite && item.code === source.code),
          ),
        }
        nextTarget.neighborCodes = nextTarget.neighbors.map((item) => item.code)
        await db.sheets.put(plain(nextTarget))
      }
    })

    const refreshed = new Map((await db.sheets.toArray()).map((row) => [row.id, hydrateSheet(row)]))
    sheets.value = sortByYear(
      sheets.value.map((sheet) => refreshed.get(sheet.id) ?? sheet),
    ).reverse()
    if (currentSheet.value?.id === sourceId) {
      currentSheet.value = refreshed.get(sourceId) ?? currentSheet.value
    }
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
    addScan,
    setPrimaryScan,
    setNeighbor,
    removeNeighbor,
    getSheetById,
    getSheetByCode,
    getScansForSheet,
  }
})
