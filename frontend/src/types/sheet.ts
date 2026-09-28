export type SheetScale = '1:5000' | '1:50000'
export type SheetStatus = '待编' | '已编' | '待核'

export const NEIGHBOR_DIRECTIONS = ['东', '南', '西', '北', '东北', '西南'] as const
export type NeighborDirection = (typeof NEIGHBOR_DIRECTIONS)[number]

/** 对向方位：东对西、南对北、东北对西南。 */
export const OPPOSITE_DIRECTION: Record<NeighborDirection, NeighborDirection> = {
  东: '西',
  西: '东',
  南: '北',
  北: '南',
  东北: '西南',
  西南: '东北',
}

/**
 * 带方位的邻接登记。方向以本图幅为基准，
 * 例如 { direction: '东', code: '甲-4' } 表示甲-4 在本图幅东侧。
 * code 允许指向尚未入藏的图幅号，用于缺编提示。
 */
export interface NeighborLink {
  direction: NeighborDirection
  code: string
}

export interface Sheet {
  id: string
  code: string
  title: string
  year: number
  scale: SheetScale
  projection: string
  sheetSizeCm: string
  series: string
  /** 带方位的邻接登记，为邻接关系的唯一事实来源。 */
  neighbors: NeighborLink[]
  /** 旧版按位置排列的图号串，已弃用，仅为兼容旧库保留并同步维护。 */
  neighborCodes?: string[]
  status: SheetStatus
}

export const SHEET_SCALES: SheetScale[] = ['1:5000', '1:50000']
export const SHEET_STATUSES: SheetStatus[] = ['待编', '已编', '待核']
