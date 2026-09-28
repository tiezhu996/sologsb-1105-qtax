import type { NeighborDirection, NeighborLink, Sheet } from '../types/sheet'
import { OPPOSITE_DIRECTION } from '../types/sheet'

export interface NeighborMutation {
  /** 需要落库的图幅（已按新关系替换好邻接表） */
  byId: Map<string, Sheet>
}

/**
 * 以当前图幅的视角登记某方位的邻接图幅。
 *
 * - 目标图幅已入藏时，两边互相登记：本侧记为 direction，对侧在对向方位回登。
 * - 目标图幅尚未入藏时，只在本侧保留图号，继续作为缺编提示。
 * - 原方位若指向其他图幅，或对侧对向方位已被占用，先清理旧关系再登记，
 *   避免出现互相指错方位的悬空记录；无法安全覆盖时返回错误。
 */
export function planAddNeighbor(
  sheets: Sheet[],
  sourceId: string,
  direction: NeighborDirection,
  rawCode: string,
): NeighborMutation | { error: string } {
  const code = rawCode.trim()
  const source = sheets.find((sheet) => sheet.id === sourceId)
  if (!source) {
    return { error: '未找到当前图幅，无法登记邻接关系。' }
  }
  if (!code) {
    return { error: '请填写邻接图幅号。' }
  }
  if (code === source.code) {
    return { error: '图幅不能与自身登记邻接关系。' }
  }
  if (!NEIGHBOR_DIRECTION_SET.has(direction)) {
    return { error: '邻接方位不合法。' }
  }

  const byId = new Map(sheets.map((sheet) => [sheet.id, cloneSheet(sheet)]))
  const workingSource = byId.get(sourceId)
  if (!workingSource) {
    return { error: '未找到当前图幅，无法登记邻接关系。' }
  }

  const target = [...byId.values()].find((sheet) => sheet.code === code)
  const backDirection = OPPOSITE_DIRECTION[direction]

  // 同一图号已登记在其他方位：先撤掉旧方位及其对向回登，相当于调换方向。
  const sameCodeOld = workingSource.neighbors.find((link) => link.code === code)
  if (sameCodeOld && sameCodeOld.direction !== direction) {
    detachBacklink(byId, workingSource, code, OPPOSITE_DIRECTION[sameCodeOld.direction])
    workingSource.neighbors = workingSource.neighbors.filter((link) => link.code !== code)
  }

  // 目标方位上原有的邻接图：撤掉它对本侧的对向回登，相当于替换。
  const occupant = workingSource.neighbors.find(
    (link) => link.direction === direction && link.code !== code,
  )
  if (occupant) {
    detachBacklink(byId, workingSource, occupant.code, backDirection)
  }

  if (target) {
    if (target.id !== sourceId) {
      const backOccupant = target.neighbors.find(
        (link) => link.direction === backDirection && link.code !== workingSource.code,
      )
      if (backOccupant) {
        return {
          error: `${code} 的${backDirection}方位已登记「${backOccupant.code}」，请先撤除该关系后再调换。`,
        }
      }

      // 目标图若已把本图登记在别的方位，先从旧方位撤下，再按对向方位回登。
      target.neighbors = target.neighbors.filter((link) => link.code !== workingSource.code)
      target.neighbors = upsertLink(target.neighbors, { code: workingSource.code, direction: backDirection })
    }

    // 目标图自身的旧邻接若有指向本图却不在对向方位的错位记录，上面已顺带清理。
    workingSource.neighbors = upsertLink(workingSource.neighbors, { code, direction })
  } else {
    // 尚未入藏：本侧保留缺编提示，不产生对向记录。
    workingSource.neighbors = upsertLink(workingSource.neighbors, { code, direction })
  }

  return { byId }
}

/**
 * 撤除当前图幅某方位的邻接关系。
 * 目标图幅已入藏时，对向方位的回登记录一并清理；缺编记录仅移除本侧提示。
 */
export function planRemoveNeighbor(
  sheets: Sheet[],
  sourceId: string,
  direction: NeighborDirection,
): NeighborMutation | { error: string } {
  const source = sheets.find((sheet) => sheet.id === sourceId)
  if (!source) {
    return { error: '未找到当前图幅，无法撤除邻接关系。' }
  }

  const link = source.neighbors.find((item) => item.direction === direction)
  if (!link) {
    return { error: '该方位尚未登记邻接关系。' }
  }

  const byId = new Map(sheets.map((sheet) => [sheet.id, cloneSheet(sheet)]))
  const workingSource = byId.get(sourceId)
  if (!workingSource) {
    return { error: '未找到当前图幅，无法撤除邻接关系。' }
  }

  workingSource.neighbors = workingSource.neighbors.filter((item) => item.direction !== direction)
  detachBacklink(byId, workingSource, link.code, OPPOSITE_DIRECTION[direction])

  return { byId }
}

/**
 * 撤除某邻接图对本图的对向回登。
 * 仅清理确切指向本图图号的记录，避免误删同方位的其他关系。
 */
function detachBacklink(
  byId: Map<string, Sheet>,
  source: Sheet,
  neighborCode: string,
  backDirection: NeighborDirection,
): void {
  const neighbor = [...byId.values()].find((sheet) => sheet.code === neighborCode)
  if (!neighbor || neighbor.id === source.id) {
    return
  }
  neighbor.neighbors = neighbor.neighbors.filter(
    (link) => !(link.direction === backDirection && link.code === source.code),
  )
}

function upsertLink(links: NeighborLink[], next: NeighborLink): NeighborLink[] {
  const rest = links.filter((link) => link.direction !== next.direction)
  return [...rest, next]
}

function cloneSheet(sheet: Sheet): Sheet {
  return { ...sheet, neighbors: sheet.neighbors.map((link) => ({ ...link })) }
}

const NEIGHBOR_DIRECTION_SET = new Set<NeighborDirection>([
  '东',
  '南',
  '西',
  '北',
  '东北',
  '西南',
])
