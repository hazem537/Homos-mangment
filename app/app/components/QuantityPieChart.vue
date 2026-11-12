<script setup lang="ts">
import type { ChartBar } from '~/utils/pieChart'
import { buildPieSlices } from '~/utils/pieChart'
import { formatCompactNumber, formatNumber } from '~/utils/formatNumber'

const props = withDefaults(defineProps<{
  bars: ChartBar[]
  unit?: string
  emptyText?: string
}>(), {
  unit: 'كجم',
  emptyText: 'لا توجد كميات لعرضها'
})

const hoveredKey = defineModel<string | null>('hoveredKey', { default: null })

const pie = computed(() => buildPieSlices(props.bars))
const pieSlices = computed(() => pie.value.slices)
const pieTotal = computed(() => pie.value.total)

const hoveredPie = computed(() =>
  pieSlices.value.find(s => s.key === hoveredKey.value) ?? null
)
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-[minmax(0,16rem)_1fr] lg:items-center">
    <div class="relative mx-auto size-56 sm:size-64">
      <svg
        v-if="pieSlices.length"
        viewBox="0 0 240 240"
        class="size-full drop-shadow-sm"
      >
        <circle
          cx="120"
          cy="120"
          r="100"
          class="fill-elevated"
        />
        <path
          v-for="slice in pieSlices"
          :key="slice.key"
          :d="slice.path"
          :fill="slice.color"
          class="cursor-pointer transition-opacity duration-150"
          :style="{
            opacity: hoveredKey && hoveredKey !== slice.key ? 0.35 : 1
          }"
          stroke="var(--ui-bg)"
          stroke-width="2"
          tabindex="0"
          @mouseenter="hoveredKey = slice.key"
          @mouseleave="hoveredKey = null"
          @focus="hoveredKey = slice.key"
          @blur="hoveredKey = null"
        >
          <title>
            {{ slice.label }} — {{ formatNumber(slice.value) }} {{ unit }} ({{ formatNumber(slice.percent) }}%)
          </title>
        </path>
        <circle
          cx="120"
          cy="120"
          r="52"
          class="fill-[var(--ui-bg)] pointer-events-none"
        />
        <text
          x="120"
          y="108"
          text-anchor="middle"
          class="fill-[var(--ui-text-muted)] text-[10px] pointer-events-none"
        >
          {{ hoveredPie ? hoveredPie.label : 'الإجمالي' }}
        </text>
        <text
          x="120"
          y="128"
          text-anchor="middle"
          class="fill-[var(--ui-text-highlighted)] text-[13px] font-semibold pointer-events-none"
          direction="ltr"
        >
          {{ formatCompactNumber(hoveredPie ? hoveredPie.value : pieTotal) }}
        </text>
        <text
          v-if="hoveredPie"
          x="120"
          y="146"
          text-anchor="middle"
          class="fill-[var(--ui-text-muted)] text-[10px] pointer-events-none"
          direction="ltr"
        >
          {{ formatNumber(hoveredPie.percent) }}%
        </text>
      </svg>

      <div
        v-if="hoveredPie"
        class="pointer-events-none absolute -top-2 left-1/2 z-10 w-max max-w-[14rem] -translate-x-1/2 -translate-y-full rounded-lg border border-default bg-default px-3 py-2 text-center shadow-lg"
      >
        <div class="flex items-center justify-center gap-2">
          <span
            class="size-2.5 shrink-0 rounded-full"
            :style="{ backgroundColor: hoveredPie.color }"
          />
          <p class="text-sm font-semibold text-highlighted">
            {{ hoveredPie.label }}
          </p>
        </div>
        <p
          class="mt-0.5 text-xs tabular-nums text-muted"
          dir="ltr"
        >
          {{ formatCompactNumber(hoveredPie.value) }} {{ unit }} · {{ formatNumber(hoveredPie.percent) }}%
        </p>
      </div>

      <div
        v-else-if="!pieSlices.length"
        class="flex size-full items-center justify-center rounded-full border border-dashed border-default text-sm text-muted"
      >
        {{ emptyText }}
      </div>
    </div>

    <div class="space-y-2.5">
      <div
        v-for="bar in bars"
        :key="bar.key"
        class="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors"
        :class="
          hoveredKey === bar.key
            ? 'border-primary/50 bg-accented'
            : 'border-default/70 bg-default'
        "
        @mouseenter="bar.value > 0.005 ? (hoveredKey = bar.key) : undefined"
        @mouseleave="hoveredKey = null"
      >
        <div class="flex min-w-0 items-center gap-2.5">
          <span
            class="size-3 shrink-0 rounded-full"
            :style="{ backgroundColor: bar.color }"
          />
          <div class="min-w-0">
            <p class="text-sm font-medium text-highlighted truncate">
              {{ bar.label }}
            </p>
            <p class="text-xs text-muted tabular-nums">
              {{
                pieTotal > 0.005
                  ? `${formatNumber((Math.max(0, bar.value) / pieTotal) * 100)}%`
                  : '0%'
              }}
            </p>
          </div>
        </div>
        <p
          class="min-w-0 max-w-[8rem] shrink truncate text-sm font-semibold tabular-nums text-highlighted"
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
  </div>
</template>
