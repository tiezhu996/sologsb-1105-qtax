<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Sheet } from '../../types/sheet'
import type { NeighborEntry } from '../../hooks/useSheetNeighbors'

const props = defineProps<{
  entry?: NeighborEntry
  candidates: Sheet[]
  busy: boolean
}>()

const emit = defineEmits<{
  add: [code: string]
  remove: []
}>()

const draftCode = ref('')

watch(
  () => props.entry?.code,
  () => {
    draftCode.value = ''
  },
)

function submit(): void {
  const code = draftCode.value.trim()
  if (!code) {
    return
  }
  emit('add', code)
}
</script>

<template>
  <article class="neighbor-slot" :class="{ 'neighbor-slot--missing': entry && !entry.sheet }">
    <slot name="direction" />

    <template v-if="entry">
      <template v-if="entry.sheet">
        <h3>{{ entry.sheet.code }}</h3>
        <p>{{ entry.sheet.title }}</p>
        <div class="neighbor-slot__actions">
          <router-link :to="`/sheets/${entry.sheet.id}`">
            <el-button link type="primary">查看图幅</el-button>
          </router-link>
          <el-button
            link
            type="danger"
            data-testid="remove-neighbor"
            :loading="busy"
            @click="emit('remove')"
          >
            撤除关系
          </el-button>
        </div>
      </template>
      <template v-else>
        <h3 class="text-danger">{{ entry.code }}</h3>
        <p>馆藏缺编，需补图后再核接边。</p>
        <div class="neighbor-slot__actions">
          <el-button
            link
            type="danger"
            data-testid="remove-neighbor"
            :loading="busy"
            @click="emit('remove')"
          >
            撤除关系
          </el-button>
        </div>
      </template>
    </template>

    <template v-else>
      <p>该方向未登记邻接关系。</p>
      <div class="neighbor-slot__add">
        <el-select
          v-model="draftCode"
          class="neighbor-slot__select"
          size="small"
          filterable
          allow-create
          default-first-option
          clearable
          :reserve-keyword="false"
          :disabled="busy"
          data-testid="neighbor-code"
          placeholder="选择已入藏图幅或直接填写图号"
          @keyup.enter="submit"
        >
          <el-option
            v-for="candidate in candidates"
            :key="candidate.id"
            :label="`${candidate.code} · ${candidate.title}`"
            :value="candidate.code"
          />
        </el-select>
        <el-button
          size="small"
          type="primary"
          plain
          data-testid="add-neighbor"
          :loading="busy"
          @click="submit"
        >
          登记
        </el-button>
      </div>
    </template>
  </article>
</template>
