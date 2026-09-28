<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useSheetStore } from '../stores/sheetStore'
import { useSheetNeighbors } from '../hooks/useSheetNeighbors'
import type { NeighborDirection } from '../types/sheet'
import type { ScanItem } from '../types/scan'
import NeighborSlotCard from '../components/common/NeighborSlotCard.vue'
import ScanCard from '../components/common/ScanCard.vue'
import ScaleTag from '../components/common/ScaleTag.vue'
import VacantHint from '../components/common/VacantHint.vue'

interface SlotMeta {
  direction: NeighborDirection
  englishLabel: string
  slotClass: string
}

const SLOTS: SlotMeta[] = [
  { direction: '北', englishLabel: 'NORTH', slotClass: 'slot-north' },
  { direction: '西', englishLabel: 'WEST', slotClass: 'slot-west' },
  { direction: '东', englishLabel: 'EAST', slotClass: 'slot-east' },
  { direction: '南', englishLabel: 'SOUTH', slotClass: 'slot-south' },
  { direction: '东北', englishLabel: 'NE', slotClass: 'slot-northeast' },
  { direction: '西南', englishLabel: 'SW', slotClass: 'slot-southwest' },
]

const route = useRoute()
const sheetStore = useSheetStore()
const sheetId = computed(() => String(route.params.id ?? ''))
const { status } = useSheetNeighbors(sheetId)
const source = computed(() => status.value.source)

const savingDirection = ref<NeighborDirection | null>(null)

function entryAt(direction: NeighborDirection) {
  const entry = status.value.entries.find((item) => item.direction === direction)
  return entry ? { code: entry.code, sheet: entry.sheet } : undefined
}

const candidateSheets = computed(() =>
  source.value
    ? sheetStore.sheets.filter((sheet) => sheet.id !== source.value?.id)
    : [],
)

function primaryScan(sheetIdToFind: string): ScanItem | undefined {
  return sheetStore.getScansForSheet(sheetIdToFind).find((scan) => scan.isPrimary)
}

const sourcePrimaryScan = computed(() => (source.value ? primaryScan(source.value.id) : undefined))

async function handleAdd(direction: NeighborDirection, code: string): Promise<void> {
  if (!source.value) {
    return
  }
  savingDirection.value = direction
  try {
    await sheetStore.setNeighbor(source.value.id, direction, code)
    ElMessage.success(`已在${direction}方登记「${code.trim()}」，对侧对向关系同步登记。`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '邻接关系保存失败，两边登记已恢复原样。')
  } finally {
    savingDirection.value = null
  }
}

async function handleRemove(direction: NeighborDirection): Promise<void> {
  if (!source.value) {
    return
  }
  const entry = entryAt(direction)
  savingDirection.value = direction
  try {
    await sheetStore.removeNeighbor(source.value.id, direction)
    ElMessage.success(`已撤除${direction}方邻接${entry ? `「${entry.code}」` : ''}，对侧对向记录一并清理。`)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '邻接关系撤除失败。')
  } finally {
    savingDirection.value = null
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
        <p>按东、南、西、北、东北、西南方位直接登记或撤除邻接；两侧对向关系同步维护，保存失败两边回退。</p>
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
      <template v-for="slot in SLOTS" :key="slot.direction">
        <NeighborSlotCard
          class="neighbor-map__slot"
          :class="slot.slotClass"
          :direction="slot.direction"
          :english-label="slot.englishLabel"
          :entry="entryAt(slot.direction)"
          :candidate-sheets="candidateSheets"
          :saving="savingDirection === slot.direction"
          @add="handleAdd"
          @remove="handleRemove"
        />
      </template>

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
