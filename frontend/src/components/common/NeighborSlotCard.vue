<script setup lang="ts">
import { computed, ref } from 'vue'
import { OPPOSITE_DIRECTION, type NeighborDirection, type Sheet } from '../../types/sheet'

const props = defineProps<{
  direction: NeighborDirection
  englishLabel: string
  entry?: { code: string; sheet?: Sheet }
  candidateSheets: Sheet[]
  saving?: boolean
}>()

const emit = defineEmits<{
  add: [direction: NeighborDirection, code: string]
  remove: [direction: NeighborDirection]
}>()

const editing = ref(false)
const draftCode = ref('')

const isMissing = computed(() => Boolean(props.entry && !props.entry.sheet))

const oppositeText = computed(() => OPPOSITE_DIRECTION[props.direction])

const options = computed(() =>
  props.candidateSheets.map((sheet) => ({
    value: sheet.code,
    label: `${sheet.code} · ${sheet.title}`,
  })),
)

function startAdd(): void {
  draftCode.value = ''
  editing.value = true
}

function confirmAdd(): void {
  const code = draftCode.value.trim()
  if (!code) {
    return
  }
  emit('add', props.direction, code)
  editing.value = false
  draftCode.value = ''
}

function cancelAdd(): void {
  editing.value = false
  draftCode.value = ''
}

function confirmRemove(): void {
  emit('remove', props.direction)
}
</script>

<template>
  <article
    class="neighbor-slot"
    :class="{
      'neighbor-slot--missing': isMissing,
      'neighbor-slot--empty': !entry,
    }"
  >
    <div class="neighbor-slot__head">
      <span class="neighbor-slot__direction">{{ direction }} · {{ englishLabel }}</span>
      <el-button
        v-if="entry"
        link
        type="danger"
        size="small"
        :loading="saving"
        @click="confirmRemove"
      >
        撤除
      </el-button>
      <el-button
        v-else-if="!editing"
        link
        type="primary"
        size="small"
        @click="startAdd"
      >
        登记
      </el-button>
    </div>

    <template v-if="entry">
      <template v-if="entry.sheet">
        <h3>{{ entry.sheet.code }}</h3>
        <p>{{ entry.sheet.title }}</p>
        <div class="neighbor-slot__actions">
          <router-link :to="`/sheets/${entry.sheet.id}`">
            <el-button link type="primary">查看图幅</el-button>
          </router-link>
        </div>
      </template>
      <template v-else>
        <h3 class="text-danger">{{ entry.code }}</h3>
        <p>馆藏缺编，需补图后再核接边。</p>
      </template>
    </template>

    <template v-else-if="editing">
      <p class="neighbor-slot__hint">登记后对侧将自动记为「{{ oppositeText }}」方。</p>
      <el-select
        v-model="draftCode"
        class="neighbor-slot__select"
        filterable
        allow-create
        default-first-option
        :placeholder="`选择或填写${direction}方图幅号`"
        no-data-text="无匹配，可直接输入图号登记缺编"
      >
        <el-option v-for="option in options" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <div class="neighbor-slot__actions">
        <el-button size="small" type="primary" :loading="saving" @click="confirmAdd">保存登记</el-button>
        <el-button size="small" :disabled="saving" @click="cancelAdd">取消</el-button>
      </div>
    </template>

    <p v-else>该方向未登记邻接关系。</p>
  </article>
</template>
