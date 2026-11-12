<script setup lang="ts">
import type { ChartBar } from '~/utils/pieChart'
import { barPercentOfMax } from '~/utils/pieChart'
import { formatCompactNumber, formatNumber } from '~/utils/formatNumber'

const props = withDefaults(defineProps<{
  bars: ChartBar[]
  unit?: string
  valueKeyLabel?: string
}>(), {
  unit: 'كجم'
})

const maxValue = computed(() =>
  Math.max(...props.bars.map(b => b.value), 0.001)
)
</script>

<template>
  <div class="space-y-4">
    <div
      v-for="bar in bars"
      :key="bar.key"
      class="grid grid-cols-1 gap-1.5 sm:grid-cols-[11rem_1fr_7.5rem] sm:items-center sm:gap-3"
    >
      <div class="min-w-0">
        <p class="text-sm font-medium text-highlighted truncate">
          {{ bar.label }}
        </p>
        <p
          v-if="bar.hint"
          class="text-xs text-muted truncate"
        >
          {{ bar.hint }}
        </p>
      </div>

      <div class="h-8 rounded-lg bg-elevated overflow-hidden ring-1 ring-default/60">
        <div
          class="h-full rounded-lg transition-all duration-500 ease-out"
          :style="{
            width: `${barPercentOfMax(bar.value, maxValue)}%`,
            backgroundColor: bar.color
          }"
        />
      </div>

      <p
        class="truncate text-sm font-semibold tabular-nums text-highlighted sm:text-end"
        dir="ltr"
        :title="`${formatNumber(bar.value)} ${unit}`"
      >
        {{ formatCompactNumber(bar.value) }}
        <span class="font-normal text-muted">
          {{ unit }}
        </span>
      </p>
    </div>
  </div>
</template>
