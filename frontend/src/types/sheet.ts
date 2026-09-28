export type SheetScale = '1:5000' | '1:50000'
export type SheetStatus = '待编' | '已编' | '待核'

/** 邻接方位，互为对向：东↔西、南↔北、东北↔西南 */
export type NeighborDirection = '东' | '南' | '西' | '北' | '东北' | '西南'

export interface NeighborLink {
  /** 邻接图幅号；本馆尚未入藏时只保留图号作为缺编提示 */
  code: string
  /** 该邻接图相对当前图幅的方位 */
  direction: NeighborDirection
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
  /** 带方位的邻接登记，替代旧版按排列位置猜方向的 neighborCodes */
  neighbors: NeighborLink[]
  status: SheetStatus
}

export const SHEET_SCALES: SheetScale[] = ['1:5000', '1:50000']
export const SHEET_STATUSES: SheetStatus[] = ['待编', '已编', '待核']

/** 邻接方位展示顺序（亦为旧版 neighborCodes 按位置猜方向时的次序） */
export const NEIGHBOR_DIRECTIONS: NeighborDirection[] = ['东', '南', '西', '北', '东北', '西南']

/** 对向方位映射：东对西、南对北、东北对西南 */
export const OPPOSITE_DIRECTION: Record<NeighborDirection, NeighborDirection> = {
  东: '西',
  西: '东',
  南: '北',
  北: '南',
  东北: '西南',
  西南: '东北',
}
