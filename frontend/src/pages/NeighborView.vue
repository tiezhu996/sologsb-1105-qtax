<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useSheetStore, type NeighborActionResult } from '../stores/sheetStore'
import {
  useSheetNeighbors,
  type NeighborDirection,
  type NeighborEntry,
} from '../hooks/useSheetNeighbors'
import type { ScanItem } from '../types/scan'
import type { Sheet } from '../types/sheet'
import { OPPOSITE_DIRECTION } from '../types/sheet'
import ScanCard from '../components/common/ScanCard.vue'
import ScaleTag from '../components/common/ScaleTag.vue'
import VacantHint from '../components/common/VacantHint.vue'
import NeighborSlot from '../components/common/NeighborSlot.vue'

const DIRECTION_LABELS: Record<NeighborDirection, string> = {
  东: '东 · EAST',
  南: '南 · SOUTH',
  西: '西 · WEST',
  北: '北 · NORTH',
  东北: '东北 · NE',
  西南: '西南 · SW',
}

const SLOT_CLASS: Record<NeighborDirection, string> = {
  东: 'slot-east',
  南: 'slot-south',
  西: 'slot-west',
  北: 'slot-north',
  东北: 'slot-northeast',
  西南: 'slot-southwest',
}

/**
 * 模板顺序：桌面靠 grid-area 定位，移动端单列时保证中心图幅夹在西、东之间。
 */
const DIRECTIONS_BEFORE_CENTER: NeighborDirection[] = ['北', '西']
const DIRECTIONS_AFTER_CENTER: NeighborDirection[] = ['东', '南', '东北', '西南']

const route = useRoute()
const sheetStore = useSheetStore()
const sheetId = computed(() => String(route.params.id ?? ''))
const { status } = useSheetNeighbors(sheetId)
const source = computed(() => status.value.source)

const busyDirection = ref<NeighborDirection | null>(null)

function entryAt(direction: NeighborDirection): NeighborEntry | undefined {
  return status.value.entries.find((entry) => entry.direction === direction)
}

/** 可登记为邻接的已入藏图幅：排除本图，已在其他方位登记的图仍允许调换方向 */
const candidates = computed<Sheet[]>(() =>
  sheetStore.sheets.filter((sheet) => sheet.id !== sheetId.value),
)

function primaryScan(sheetIdToFind: string): ScanItem | undefined {
  return sheetStore.getScansForSheet(sheetIdToFind).find((scan) => scan.isPrimary)
}

const sourcePrimaryScan = computed(() => (source.value ? primaryScan(source.value.id) : undefined))

async function handleAdd(direction: NeighborDirection, code: string): Promise<void> {
  if (!code.trim()) {
    return
  }
  busyDirection.value = direction
  const targetSheet = sheetStore.getSheetByCode(code.trim())
  let result: NeighborActionResult
  try {
    result = await sheetStore.addNeighbor(sheetId.value, direction, code)
  } finally {
    busyDirection.value = null
  }
  if (result.ok) {
    ElMessage.success(
      targetSheet
        ? `已登记：${code.trim()} 位于本图${direction}侧，对方${OPPOSITE_DIRECTION[direction]}侧已互相对登。`
        : `已保留缺编提示：${code.trim()} 入藏后可在两侧补登邻接关系。`,
    )
  } else {
    ElMessage.error(result.message)
  }
}

async function handleRemove(direction: NeighborDirection): Promise<void> {
  busyDirection.value = direction
  let result: NeighborActionResult
  try {
    result = await sheetStore.removeNeighbor(sheetId.value, direction)
  } finally {
    busyDirection.value = null
  }
  if (result.ok) {
    ElMessage.success('邻接关系已撤除，对向记录一并清理。')
  } else {
    ElMessage.error(result.message)
  }
}

async function initialize(): Promise<void> {
  await sheetStore.init()
}

onMounted(() => {
  void initialize()
})
</script>

<template>
  <section v-if="source" class="page">
    <div class="page-heading">
      <div>
        <span class="page-kicker">NEIGHBOR ASSEMBLY</span>
        <h1>{{ source.code }} 邻接与拼合预览</h1>
        <p>按东、南、西、北、东北、西南六个方位登记邻接；新增已入藏图幅时两侧互相对登，撤除时对向记录一并清理。</p>
      </div>
      <router-link :to="`/sheets/${source.id}`"><el-button>返回图幅详情</el-button></router-link>
    </div>

    <div class="metrics-strip">
      <div class="metric">
        <span>登记邻接图</span>
        <strong>{{ status.adjacentCount }}</strong><small>幅</small>
      </div>
      <div class="metric">
        <span>馆藏齐备</span>
        <strong>{{ status.adjacentCount - status.missingCodes.length }}</strong><small>幅</small>
      </div>
      <div class="metric">
        <span>缺编图幅</span>
        <strong>{{ status.missingCodes.length }}</strong><small>幅</small>
      </div>
    </div>

    <div class="neighbor-map">
      <NeighborSlot
        v-for="direction in DIRECTIONS_BEFORE_CENTER"
        :key="direction"
        :class="SLOT_CLASS[direction]"
        :entry="entryAt(direction)"
        :candidates="candidates"
        :busy="busyDirection === direction"
        @add="(code) => handleAdd(direction, code)"
        @remove="handleRemove(direction)"
      >
        <template #direction>
          <span class="neighbor-slot__direction">{{ DIRECTION_LABELS[direction] }}</span>
        </template>
      </NeighborSlot>

      <article class="neighbor-slot neighbor-slot--center slot-center">
        <span class="neighbor-slot__direction">当前图幅 · CENTER</span>
        <h3>{{ source.code }}</h3>
        <p>{{ source.title }}</p>
        <ScaleTag :year="source.year" :scale="source.scale" />
        <div v-if="sourcePrimaryScan" class="mt-20">
          <ScanCard :scan="sourcePrimaryScan" />
        </div>
        <p v-else class="mt-20">尚未标记主用扫描件。</p>
      </article>

      <NeighborSlot
        v-for="direction in DIRECTIONS_AFTER_CENTER"
        :key="direction"
        :class="SLOT_CLASS[direction]"
        :entry="entryAt(direction)"
        :candidates="candidates"
        :busy="busyDirection === direction"
        @add="(code) => handleAdd(direction, code)"
        @remove="handleRemove(direction)"
      >
        <template #direction>
          <span class="neighbor-slot__direction">{{ DIRECTION_LABELS[direction] }}</span>
        </template>
      </NeighborSlot>
    </div>

    <div v-if="status.missingCodes.length" class="section-title">
      <div>
        <h2>缺编提示</h2>
        <p class="muted">以下邻接图号尚未建立本地图幅卡：{{ status.missingCodes.join('、') }}</p>
      </div>
    </div>
  </section>

  <section v-else class="page">
    <h1>图幅邻接与拼合预览</h1>
    <VacantHint title="未找到该图幅" description="请返回图幅编目台重新选择记录。" />
  </section>
</template>
