<script setup lang="ts">
import { formatCompactNumber, formatNumber } from '~/utils/formatNumber'

export type MetricSummaryCard = {
  label: string
  value: number
  hint?: string
  unit?: string
}

const props = withDefaults(defineProps<{
  cards: MetricSummaryCard[]
  unit?: string
}>(), {
  unit: 'كجم'
})

const cardUnit = (card: MetricSummaryCard) => card.unit || props.unit
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-3">
    <div
      v-for="card in cards"
      :key="card.label"
      class="rounded-xl border border-default bg-elevated p-4"
    >
      <p class="text-sm font-medium text-muted">
        {{ card.label }}
      </p>
      <FitText
        class="mt-2 font-bold tracking-tight tabular-nums text-highlighted"
        :content-key="`${card.value}:${cardUnit(card)}`"
        :max-px="30"
        :min-px="14"
        :title="`${formatNumber(card.value)} ${cardUnit(card)}`"
      >
        {{ formatCompactNumber(card.value) }}
        <span class="ms-1 font-medium text-muted" style="font-size: 0.55em">
          {{ cardUnit(card) }}
        </span>
      </FitText>
      <p
        v-if="card.hint"
        class="mt-1 text-xs text-muted"
      >
        {{ card.hint }}
      </p>
    </div>
  </div>
</template>
