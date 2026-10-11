<script setup lang="ts">
import { formatCompactNumber, formatNumber } from '~/utils/formatNumber'

const {
  loading,
  season,
  productOptions,
  accountTypeOptions,
  supplierOptions,
  selectedProductId,
  selectedAccountTypeId,
  selectedSupplierId,
  purchasedKg,
  deliveredKg,
  remainingKg,
  flowBars,
  placeBars,
  pieSlices,
  pieTotal,
  barPercent
} = useDashboardStats()

const chartView = useCookie<'bars' | 'pie'>('homos-dashboard-chart-view', {
  default: () => 'bars',
  maxAge: 60 * 60 * 24 * 365
})

const isPieView = computed({
  get: () => chartView.value === 'pie',
  set: (v: boolean) => {
    chartView.value = v ? 'pie' : 'bars'
  }
})

const hoveredPieKey = ref<string | null>(null)

const hoveredPie = computed(() =>
  pieSlices.value.find(s => s.key === hoveredPieKey.value) ?? null
)

const summaryCards = computed(() => [
  {
    label: 'يجب أن يكون',
    value: purchasedKg.value,
    hint: 'مشتريات',
    tone: 'primary' as const
  },
  {
    label: 'تم الاستلام',
    value: deliveredKg.value,
    hint: 'تسليمات',
    tone: 'success' as const
  },
  {
    label: 'متبقي عند المورد',
    value: remainingKg.value,
    hint: 'لم يُسلَّم بعد',
    tone: 'warning' as const
  }
])
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-2xl font-semibold text-highlighted">
            لوحة التحكم
          </h2>
          <UBadge
            v-if="season"
            variant="subtle"
            size="sm"
            color="warning"
          >
            {{ season.name }}
          </UBadge>
        </div>
        <p class="mt-1 text-muted">
          أين الكمية؟ من المشتريات إلى أماكن التخزين
        </p>
      </div>

      <div
        v-if="!loading"
        class="flex flex-wrap items-end gap-3"
      >
        <UFormField label="نوع الحساب">
          <USelect
            v-model="selectedAccountTypeId"
            :items="accountTypeOptions"
            value-key="value"
            label-key="label"
            class="w-44"
          />
        </UFormField>
        <UFormField label="المورد">
          <USelect
            v-model="selectedSupplierId"
            :items="supplierOptions"
            value-key="value"
            label-key="label"
            class="w-52"
          />
        </UFormField>
        <UFormField label="الصنف">
          <USelect
            v-model="selectedProductId"
            :items="productOptions"
            value-key="value"
            label-key="label"
            class="w-48"
          />
        </UFormField>
      </div>
    </div>

    <CardsSkeleton v-if="loading" :count="3" />

    <UCard
      v-else-if="!season"
      :ui="{ body: 'p-8 text-center text-muted' }"
    >
      لا يوجد موسم نشط — فعّل موسماً من شاشة المواسم أولاً.
    </UCard>

    <template v-else>
      <div class="grid gap-3 sm:grid-cols-3">
        <div
          v-for="card in summaryCards"
          :key="card.label"
          class="rounded-xl border border-default bg-elevated/50 p-4"
        >
          <p class="text-sm font-medium text-muted">
            {{ card.label }}
          </p>
          <p
            class="mt-2 truncate text-2xl font-bold tracking-tight tabular-nums text-highlighted sm:text-3xl"
            dir="ltr"
            :title="`${formatNumber(card.value)} كجم`"
          >
            {{ formatCompactNumber(card.value) }}
            <span class="text-base font-medium text-muted">
              كجم
            </span>
          </p>
          <p class="mt-1 text-xs text-muted">
            {{ card.hint }}
          </p>
        </div>
      </div>

      <UCard>
        <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <h3 class="text-lg font-semibold text-highlighted">
              توزيع الكمية
            </h3>
            <p class="mt-0.5 text-sm text-muted">
              {{ isPieView
                ? 'دائرة أماكن الكمية (مورد / شون / مخازن / مقالي / مبيعات)'
                : 'المطلوب → متبقي عند المورد → المستلم → أماكن الرصيد' }}
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <div class="flex items-center gap-2 rounded-lg border border-default bg-elevated/40 px-3 py-2">
              <UIcon
                name="i-lucide-chart-column"
                class="size-4"
                :class="!isPieView ? 'text-primary' : 'text-muted'"
              />
              <USwitch
                v-model="isPieView"
                size="md"
                color="primary"
              />
              <UIcon
                name="i-lucide-chart-pie"
                class="size-4"
                :class="isPieView ? 'text-primary' : 'text-muted'"
              />
              <span class="text-xs font-medium text-muted whitespace-nowrap">
                {{ isPieView ? 'دائرة' : 'أعمدة' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Bars -->
        <div
          v-if="!isPieView"
          class="space-y-4"
        >
          <div
            v-for="bar in flowBars"
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
                :style="{ width: `${barPercent(bar.kg)}%`, backgroundColor: bar.color }"
              />
            </div>

            <p
              class="truncate text-sm font-semibold tabular-nums text-highlighted sm:text-end"
              dir="ltr"
              :title="`${formatNumber(bar.kg)} كجم`"
            >
              {{ formatCompactNumber(bar.kg) }}
              <span class="font-normal text-muted">
                كجم
              </span>
            </p>
          </div>
        </div>

        <!-- Pie -->
        <div
          v-else
          class="grid gap-6 lg:grid-cols-[minmax(0,16rem)_1fr] lg:items-center"
        >
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
                  opacity:
                    hoveredPieKey && hoveredPieKey !== slice.key ? 0.35 : 1
                }"
                stroke="var(--ui-bg)"
                stroke-width="2"
                @mouseenter="hoveredPieKey = slice.key"
                @mouseleave="hoveredPieKey = null"
                @focus="hoveredPieKey = slice.key"
                @blur="hoveredPieKey = null"
              >
                <title>{{ slice.label }} — {{ formatNumber(slice.kg) }} كجم ({{ formatNumber(slice.percent) }}%)</title>
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
                {{ formatCompactNumber(hoveredPie ? hoveredPie.kg : pieTotal) }}
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
              <p class="mt-0.5 text-xs tabular-nums text-muted" dir="ltr">
                {{ formatCompactNumber(hoveredPie.kg) }} كجم · {{ formatNumber(hoveredPie.percent) }}%
              </p>
            </div>

            <div
              v-else-if="!pieSlices.length"
              class="flex size-full items-center justify-center rounded-full border border-dashed border-default text-sm text-muted"
            >
              لا توجد كميات لعرضها
            </div>
          </div>

          <div class="space-y-2.5">
            <div
              v-for="bar in placeBars"
              :key="bar.key"
              class="flex items-center justify-between gap-3 rounded-lg border bg-elevated/30 px-3 py-2.5 transition-colors"
              :class="
                hoveredPieKey === bar.key
                  ? 'border-primary/50 bg-elevated'
                  : 'border-default/70'
              "
              @mouseenter="bar.kg > 0.005 ? (hoveredPieKey = bar.key) : undefined"
              @mouseleave="hoveredPieKey = null"
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
                        ? `${formatNumber((Math.max(0, bar.kg) / pieTotal) * 100)}%`
                        : '0%'
                    }}
                  </p>
                </div>
              </div>
              <p
                class="min-w-0 max-w-[8rem] shrink truncate text-sm font-semibold tabular-nums text-highlighted"
                dir="ltr"
                :title="`${formatNumber(bar.kg)} كجم`"
              >
                {{ formatCompactNumber(bar.kg) }}
                <span class="font-normal text-muted">
                  كجم
                </span>
              </p>
            </div>
          </div>
        </div>

      </UCard>
    </template>
  </div>
</template>
