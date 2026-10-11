<script setup lang="ts">
import {
  formatCompactMoney,
  formatCompactNumber,
  formatMoney,
  formatNumber
} from '~/utils/formatNumber'
import { accountTypeLabel } from '~/utils/accountType'
import type { StatsBar, StatsPieSlice } from '../composables/useSupplierStats'

const {
  loading,
  season,
  productOptions,
  accountTypeOptions,
  selectedProductId,
  selectedAccountTypeId,
  isAllTypesView,
  selectedTypeRow,
  rows,
  totals,
  suppliersForSelectedType,
  typeKgBars,
  typeMoneyBars,
  typeKgPie,
  typeMoneyPie,
  maxTypeKg,
  maxTypeMoney,
  typeColorById,
  barPercent,
  metricColors
} = useSupplierStats()

const chartMetric = useCookie<'kg' | 'money'>('homos-supplier-stats-chart-metric', {
  default: () => 'kg',
  maxAge: 60 * 60 * 24 * 365
})

const chartView = useCookie<'bars' | 'pie'>('homos-supplier-stats-chart-view', {
  default: () => 'bars',
  maxAge: 60 * 60 * 24 * 365
})

const isPieView = computed({
  get: () => chartView.value === 'pie',
  set: (v: boolean) => {
    chartView.value = v ? 'pie' : 'bars'
  }
})

const activeBars = computed(() =>
  chartMetric.value === 'kg' ? typeKgBars.value : typeMoneyBars.value
)
const activePie = computed(() =>
  chartMetric.value === 'kg' ? typeKgPie.value : typeMoneyPie.value
)
const activeMax = computed(() =>
  chartMetric.value === 'kg' ? maxTypeKg.value : maxTypeMoney.value
)

const hoveredPieKey = ref<string | null>(null)
const hoveredPie = computed(() =>
  activePie.value.slices.find(s => s.key === hoveredPieKey.value) ?? null
)

const cellClass = 'max-w-[9.5rem] truncate p-2.5 whitespace-nowrap tabular-nums text-end'
const thClass = 'p-2.5 font-medium whitespace-nowrap'
/** فاصل بصري بين مجموعات الأعمدة (يمين — لا يتأثر بـ dir=ltr على الخلايا) */
const groupBorder = 'border-r-2 border-default'
const groupHead = 'bg-elevated/80'

const summaryCards = computed(() => {
  const row = isAllTypesView.value ? totals.value : selectedTypeRow.value
  if (!row) return [] as {
    label: string
    value: string
    fullValue: string
    unit: string
    hint: string
    fullHint: string
    hintColor?: string
    color: string
  }[]
  return [
    {
      label: 'المشتريات',
      value: formatCompactNumber(row.purchased_kg),
      fullValue: `${formatCompactNumber(row.purchased_kg)} كجم`,
      unit: 'كجم',
      hint: `${formatCompactNumber(row.ardab_total)} أردب`,
      fullHint: `${formatCompactNumber(row.ardab_total)} أردب`,
      color: metricColors.purchased
    },
    {
      label: 'المسلّم',
      value: formatCompactNumber(row.delivered_kg),
      fullValue: `${formatCompactNumber(row.delivered_kg)} كجم`,
      unit: 'كجم',
      hint: `${formatCompactNumber(row.ardab_delivered)} أردب`,
      fullHint: `${formatCompactNumber(row.ardab_delivered)} أردب`,
      color: metricColors.delivered
    },
    {
      label: 'المتبقي',
      value: formatCompactNumber(row.remaining_kg),
      fullValue: `${formatCompactNumber(row.remaining_kg)} كجم`,
      unit: 'كجم',
      hint: `${formatCompactNumber(row.ardab_remaining)} أردب`,
      fullHint: `${formatCompactNumber(row.ardab_remaining)} أردب`,
      color: metricColors.remaining
    },
    {
      label: 'المدفوع',
      value: formatCompactMoney(row.money_paid),
      fullValue: formatCompactMoney(row.money_paid),
      unit: '',
      hint: `مستحق ${formatCompactMoney(row.money_due)}`,
      fullHint: `مستحق ${formatCompactMoney(row.money_due)}`,
      hintColor: metricColors.due,
      color: metricColors.paid
    }
  ]
})

function formatBarValue(bar: StatsBar) {
  return chartMetric.value === 'kg'
    ? `${formatCompactNumber(bar.value)} كجم`
    : formatCompactMoney(bar.value)
}

function formatBarValueFull(bar: StatsBar) {
  return chartMetric.value === 'kg'
    ? `${formatNumber(bar.value)} كجم`
    : formatMoney(bar.value)
}

function qtyText(n: number) {
  return formatCompactNumber(n)
}

function moneyText(n: number) {
  return formatCompactMoney(n)
}

function openType(typeId: string) {
  selectedAccountTypeId.value = typeId
}

function pieSliceOpacity(slice: StatsPieSlice) {
  if (!hoveredPieKey.value) return 1
  return hoveredPieKey.value === slice.key ? 1 : 0.35
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-2xl font-semibold text-highlighted">
            إحصائيات الموردين
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
          مقارنة الأنواع والتفاصيل حسب الصنف في الموسم النشط
        </p>
      </div>

      <div
        v-if="!loading"
        class="flex flex-wrap items-end gap-3"
      >
        <UFormField label="الصنف">
          <USelect
            v-model="selectedProductId"
            :items="productOptions"
            value-key="value"
            label-key="label"
            class="w-48"
          />
        </UFormField>
        <UFormField label="نوع الحساب">
          <USelect
            v-model="selectedAccountTypeId"
            :items="accountTypeOptions"
            value-key="value"
            label-key="label"
            class="w-44"
          />
        </UFormField>
      </div>
    </div>

    <CardsSkeleton
      v-if="loading"
      :count="4"
    />

    <UCard
      v-else-if="!season"
      :ui="{ body: 'p-8 text-center text-muted' }"
    >
      لا يوجد موسم نشط — فعّل موسماً من شاشة المواسم أولاً.
    </UCard>

    <UCard
      v-else-if="!productOptions.length"
      :ui="{ body: 'p-8 text-center text-muted' }"
    >
      لا توجد أصناف — أضف صنفاً أولاً.
    </UCard>

    <template v-else>
      <!-- Summary — نظرة عامة لكل الأنواع فقط -->
      <div
        v-if="isAllTypesView"
        class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <div
          v-for="card in summaryCards"
          :key="card.label"
          class="rounded-xl border border-default bg-elevated/40 p-4"
        >
          <div class="flex items-center gap-2">
            <span
              class="size-2.5 rounded-full"
              :style="{ backgroundColor: card.color }"
            />
            <p class="text-sm font-medium text-muted">
              {{ card.label }}
            </p>
          </div>
          <p
            class="mt-2 truncate text-xl font-bold tracking-tight tabular-nums text-highlighted sm:text-2xl"
            dir="ltr"
            :title="card.fullValue"
          >
            {{ card.value }}
            <span
              v-if="card.unit"
              class="text-sm font-medium text-muted"
            >
              {{ card.unit }}
            </span>
          </p>
          <p
            class="mt-1 truncate text-xs"
            :class="card.hintColor ? 'font-medium' : 'text-muted'"
            :style="card.hintColor ? { color: card.hintColor } : undefined"
            dir="ltr"
            :title="card.fullHint"
          >
            {{ card.hint }}
          </p>
        </div>
      </div>

      <!-- All types overview -->
      <template v-if="isAllTypesView">
        <UCard>
          <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 class="text-lg font-semibold text-highlighted">
                مقارنة الأنواع
              </h3>
              <p class="mt-0.5 text-sm text-muted">
                اضغط على نوع للانتقال إلى التفاصيل
              </p>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <div class="flex rounded-lg border border-default bg-elevated/40 p-1">
                <button
                  type="button"
                  class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                  :class="chartMetric === 'kg'
                    ? 'bg-default text-highlighted shadow-sm'
                    : 'text-muted hover:text-highlighted'"
                  @click="chartMetric = 'kg'"
                >
                  الكمية
                </button>
                <button
                  type="button"
                  class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                  :class="chartMetric === 'money'
                    ? 'bg-default text-highlighted shadow-sm'
                    : 'text-muted hover:text-highlighted'"
                  @click="chartMetric = 'money'"
                >
                  النقدية
                </button>
              </div>

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
              </div>
            </div>
          </div>

          <!-- Bars -->
          <div
            v-if="!isPieView"
            class="space-y-3"
          >
            <div
              v-if="chartMetric === 'money'"
              class="mb-1 flex flex-wrap items-center gap-4 px-2 text-xs text-muted"
            >
              <span class="inline-flex items-center gap-1.5">
                <span
                  class="size-2.5 rounded-sm"
                  :style="{ backgroundColor: metricColors.paid }"
                />
                مدفوع
              </span>
              <span class="inline-flex items-center gap-1.5">
                <span
                  class="size-2.5 rounded-sm"
                  :style="{ backgroundColor: metricColors.due }"
                />
                مستحق
              </span>
            </div>

            <button
              v-for="bar in activeBars"
              :key="bar.key"
              type="button"
              class="group grid w-full grid-cols-1 gap-1.5 rounded-lg p-2 text-start transition-colors hover:bg-elevated/50 sm:grid-cols-[9rem_1fr_auto] sm:items-center sm:gap-3"
              @click="openType(bar.key.replace(/^money-/, ''))"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-highlighted">
                  {{ bar.label }}
                </p>
              </div>

              <!-- كمية: لون واحد · نقدية: مدفوع/مستحق -->
              <div class="relative min-w-0">
                <div
                  v-if="chartMetric === 'kg'"
                  class="h-7 overflow-hidden rounded-lg bg-elevated ring-1 ring-default/60"
                >
                  <div
                    class="h-full rounded-lg transition-all duration-500 ease-out"
                    :style="{
                      width: `${barPercent(bar.value, activeMax)}%`,
                      backgroundColor: bar.color
                    }"
                  />
                </div>

                <template v-else>
                  <div
                    class="flex h-7 overflow-hidden rounded-lg bg-elevated ring-1 ring-default/60"
                    :style="{ width: `${barPercent(bar.value, activeMax)}%`, minWidth: bar.value > 0.005 ? '2.5rem' : '0' }"
                  >
                    <div
                      class="h-full transition-all duration-500 ease-out"
                      :style="{
                        width: `${bar.value > 0.005 ? (Math.max(0, bar.paid || 0) / bar.value) * 100 : 0}%`,
                        backgroundColor: metricColors.paid
                      }"
                    />
                    <div
                      class="h-full transition-all duration-500 ease-out"
                      :style="{
                        width: `${bar.value > 0.005 ? (Math.max(0, bar.due || 0) / bar.value) * 100 : 0}%`,
                        backgroundColor: metricColors.due
                      }"
                    />
                  </div>
                  <div
                    class="pointer-events-none absolute start-1/2 top-0 z-20 w-max -translate-x-1/2 -translate-y-[calc(100%+6px)] rounded-lg border border-default bg-default px-3 py-2 opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                  >
                    <div class="flex items-center gap-3 text-xs">
                      <span class="inline-flex items-center gap-1.5 tabular-nums" dir="ltr">
                        <span
                          class="size-2 rounded-sm"
                          :style="{ backgroundColor: metricColors.paid }"
                        />
                        <span class="text-muted">
                          مدفوع
                        </span>
                        <span
                          class="font-semibold text-highlighted"
                          :title="formatMoney(bar.paid || 0)"
                        >
                          {{ moneyText(bar.paid || 0) }}
                        </span>
                      </span>
                      <span class="text-muted">
                        ·
                      </span>
                      <span class="inline-flex items-center gap-1.5 tabular-nums" dir="ltr">
                        <span
                          class="size-2 rounded-sm"
                          :style="{ backgroundColor: metricColors.due }"
                        />
                        <span class="text-muted">
                          مستحق
                        </span>
                        <span
                          class="font-semibold text-highlighted"
                          :title="formatMoney(bar.due || 0)"
                        >
                          {{ moneyText(bar.due || 0) }}
                        </span>
                      </span>
                    </div>
                  </div>
                </template>
              </div>

              <div class="min-w-0 max-w-[14rem] sm:text-end">
                <p
                  class="truncate text-sm font-semibold tabular-nums text-highlighted"
                  dir="ltr"
                  :title="formatBarValueFull(bar)"
                >
                  {{ formatBarValue(bar) }}
                </p>
                <p
                  v-if="chartMetric === 'kg'"
                  class="mt-0.5 truncate text-[11px] tabular-nums text-muted"
                  dir="ltr"
                  :title="`مسلّم ${formatNumber(bar.delivered || 0)} · متبقي ${formatNumber(bar.remaining || 0)}`"
                >
                  <span class="text-success">
                    مسلّم {{ qtyText(bar.delivered || 0) }}
                  </span>
                  <span class="mx-1">
                    ·
                  </span>
                  <span class="text-error">
                    متبقي {{ qtyText(bar.remaining || 0) }}
                  </span>
                </p>
                <p
                  v-else
                  class="mt-0.5 truncate text-[11px] tabular-nums opacity-0 transition-opacity group-hover:opacity-100"
                  dir="ltr"
                  :title="`${formatMoney(bar.paid || 0)} / ${formatMoney(bar.due || 0)}`"
                >
                  <span :style="{ color: metricColors.paid }">
                    {{ moneyText(bar.paid || 0) }}
                  </span>
                  <span class="mx-1 text-muted">
                    /
                  </span>
                  <span :style="{ color: metricColors.due }">
                    {{ moneyText(bar.due || 0) }}
                  </span>
                </p>
              </div>
            </button>
          </div>

          <!-- Pie -->
          <div
            v-else
            class="grid gap-6 lg:grid-cols-[minmax(0,16rem)_1fr] lg:items-center"
          >
            <div class="relative mx-auto size-56 sm:size-64">
              <svg
                v-if="activePie.slices.length"
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
                  v-for="slice in activePie.slices"
                  :key="slice.key"
                  :d="slice.path"
                  :fill="slice.color"
                  class="cursor-pointer transition-opacity duration-150"
                  :style="{ opacity: pieSliceOpacity(slice) }"
                  stroke="var(--ui-bg)"
                  stroke-width="2"
                  @mouseenter="hoveredPieKey = slice.key"
                  @mouseleave="hoveredPieKey = null"
                  @click="openType(slice.key.replace(/^money-/, ''))"
                />
                <circle
                  cx="120"
                  cy="120"
                  r="52"
                  class="pointer-events-none fill-[var(--ui-bg)]"
                />
                <text
                  x="120"
                  y="110"
                  text-anchor="middle"
                  class="pointer-events-none fill-[var(--ui-text-muted)] text-[10px]"
                >
                  {{ hoveredPie ? hoveredPie.label : 'الإجمالي' }}
                </text>
                <text
                  x="120"
                  y="130"
                  text-anchor="middle"
                  class="pointer-events-none fill-[var(--ui-text-highlighted)] text-[12px] font-semibold"
                  direction="ltr"
                >
                  {{
                    chartMetric === 'kg'
                      ? formatCompactNumber(hoveredPie ? hoveredPie.value : activePie.total)
                      : formatCompactMoney(hoveredPie ? hoveredPie.value : activePie.total)
                  }}
                </text>
                <text
                  v-if="hoveredPie"
                  x="120"
                  y="148"
                  text-anchor="middle"
                  class="pointer-events-none fill-[var(--ui-text-muted)] text-[10px]"
                  direction="ltr"
                >
                  {{ formatNumber(hoveredPie.percent) }}%
                </text>
              </svg>
              <div
                v-else
                class="flex size-full items-center justify-center rounded-full border border-dashed border-default text-sm text-muted"
              >
                لا توجد بيانات
              </div>
            </div>

            <div class="space-y-2">
              <button
                v-for="bar in activeBars"
                :key="bar.key"
                type="button"
                class="flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-start transition-colors hover:bg-elevated/50"
                :class="hoveredPieKey === bar.key
                  ? 'border-primary/40 bg-elevated'
                  : 'border-default/70 bg-elevated/20'"
                @mouseenter="bar.value > 0.005 ? (hoveredPieKey = bar.key) : undefined"
                @mouseleave="hoveredPieKey = null"
                @click="openType(bar.key.replace(/^money-/, ''))"
              >
                <div class="flex min-w-0 items-center gap-2.5">
                  <span
                    class="size-3 shrink-0 rounded-full"
                    :style="{ backgroundColor: bar.color }"
                  />
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-highlighted">
                      {{ bar.label }}
                    </p>
                    <p class="text-xs text-muted tabular-nums">
                      {{
                        activePie.total > 0.005
                          ? `${formatNumber((Math.max(0, bar.value) / activePie.total) * 100)}%`
                          : '0%'
                      }}
                    </p>
                  </div>
                </div>
                <div class="min-w-0 max-w-[12rem] shrink text-end">
                  <p
                    class="truncate text-sm font-semibold tabular-nums text-highlighted"
                    dir="ltr"
                    :title="formatBarValueFull(bar)"
                  >
                    {{ formatBarValue(bar) }}
                  </p>
                  <p
                    v-if="chartMetric === 'kg'"
                    class="mt-0.5 truncate text-[11px] tabular-nums"
                    dir="ltr"
                    :title="`مسلّم ${formatNumber(bar.delivered || 0)} · متبقي ${formatNumber(bar.remaining || 0)}`"
                  >
                    <span class="text-success">
                      مسلّم {{ qtyText(bar.delivered || 0) }}
                    </span>
                    <span class="mx-1 text-muted">
                      ·
                    </span>
                    <span class="text-error">
                      متبقي {{ qtyText(bar.remaining || 0) }}
                    </span>
                  </p>
                  <p
                    v-else
                    class="mt-0.5 truncate text-[11px] tabular-nums"
                    dir="ltr"
                    :title="`مدفوع ${formatMoney(bar.paid || 0)} · مستحق ${formatMoney(bar.due || 0)}`"
                  >
                    <span :style="{ color: metricColors.paid }">
                      مدفوع {{ moneyText(bar.paid || 0) }}
                    </span>
                    <span class="mx-1 text-muted">
                      ·
                    </span>
                    <span :style="{ color: metricColors.due }">
                      مستحق {{ moneyText(bar.due || 0) }}
                    </span>
                  </p>
                </div>
              </button>
            </div>
          </div>
        </UCard>

        <!-- Detailed table -->
        <UCard :ui="{ body: 'p-0' }">
          <div class="flex items-center justify-between gap-3 border-b border-default px-4 py-3">
            <div>
              <h3 class="font-semibold text-highlighted">
                الجدول التفصيلي
              </h3>
              <p class="text-xs text-muted">
                كل المقاييس لكل نوع حساب
              </p>
            </div>
          </div>
          <div class="homos-scroll overflow-x-auto">
            <table
              dir="rtl"
              class="w-max min-w-full border-separate border-spacing-0 text-sm text-center"
            >
              <thead class="text-muted">
                <tr>
                  <th
                    :class="[thClass, 'sticky start-0 z-10 bg-elevated text-start']"
                    rowspan="2"
                  >
                    نوع الحساب
                  </th>
                  <th
                    :class="[thClass, groupHead, groupBorder]"
                    colspan="3"
                  >
                    الكمية
                    <span class="font-normal text-muted">
                      كجم (أردب)
                    </span>
                  </th>
                  <th
                    :class="[thClass, groupHead, groupBorder]"
                    colspan="4"
                  >
                    النقدية
                  </th>
                  <th :class="[thClass, groupHead, groupBorder]">
                    متوسط سعر الأردب
                  </th>
                  <th
                    :class="[thClass, groupHead, groupBorder]"
                    colspan="2"
                  >
                    التكاليف
                  </th>
                  <th
                    :class="[thClass, groupHead, groupBorder]"
                    colspan="2"
                  >
                    دفع التكاليف
                  </th>
                </tr>
                <tr class="bg-elevated/50">
                  <th :class="[thClass, groupBorder]">
                    الكل
                  </th>
                  <th :class="thClass">
                    مسلّم
                  </th>
                  <th :class="thClass">
                    متبقي
                  </th>
                  <th :class="[thClass, groupBorder]">
                    الكل
                  </th>
                  <th :class="thClass">
                    مدفوع
                  </th>
                  <th :class="thClass">
                    مستحق
                  </th>
                  <th :class="thClass">
                    عمولة
                  </th>
                  <th :class="[thClass, groupBorder]">
                    —
                  </th>
                  <th :class="[thClass, groupBorder]">
                    نولون
                  </th>
                  <th :class="thClass">
                    نثريات
                  </th>
                  <th :class="[thClass, groupBorder]">
                    مدفوع
                  </th>
                  <th :class="thClass">
                    متبقي
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in rows"
                  :key="row.account_type_id"
                  class="cursor-pointer border-t border-default hover:bg-elevated/30"
                  @click="openType(row.account_type_id)"
                >
                  <td class="sticky start-0 z-10 whitespace-nowrap bg-[var(--ui-bg)] p-2.5 text-start font-medium">
                    <div class="flex items-center gap-2">
                      <span
                        class="size-2.5 shrink-0 rounded-full"
                        :style="{ backgroundColor: typeColorById.get(row.account_type_id) }"
                      />
                      {{ accountTypeLabel(row.account_type_name) }}
                    </div>
                  </td>
                  <!-- الكمية -->
                  <td
                    :class="[cellClass, groupBorder]"
                    dir="ltr"
                  >
                    {{ formatCompactNumber(row.purchased_kg) }}
                    <span class="text-muted">
                      ({{ formatCompactNumber(row.ardab_total) }})
                    </span>
                  </td>
                  <td
                    :class="cellClass"
                    dir="ltr"
                  >
                    {{ formatCompactNumber(row.delivered_kg) }}
                    <span class="text-muted">
                      ({{ formatCompactNumber(row.ardab_delivered) }})
                    </span>
                  </td>
                  <td
                    :class="cellClass"
                    dir="ltr"
                  >
                    {{ formatCompactNumber(row.remaining_kg) }}
                    <span class="text-muted">
                      ({{ formatCompactNumber(row.ardab_remaining) }})
                    </span>
                  </td>
                  <!-- النقدية -->
                  <td
                    :class="[cellClass, groupBorder]"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(row.purchases_total) }}
                  </td>
                  <td
                    :class="cellClass"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(row.money_paid) }}
                  </td>
                  <td
                    :class="cellClass"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(row.money_due) }}
                  </td>
                  <td
                    :class="cellClass"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(row.commission_total) }}
                  </td>
                  <!-- متوسط -->
                  <td
                    :class="[cellClass, groupBorder]"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(row.avg_price_per_ardab) }}
                  </td>
                  <!-- التكاليف -->
                  <td
                    :class="[cellClass, groupBorder]"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(row.nolon_total) }}
                  </td>
                  <td
                    :class="cellClass"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(row.nathriyat_total) }}
                  </td>
                  <!-- دفع التكاليف -->
                  <td
                    :class="[cellClass, groupBorder]"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(row.cost_paid) }}
                  </td>
                  <td
                    :class="cellClass"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(row.cost_needed) }}
                  </td>
                </tr>
                <tr class="border-t-2 border-default bg-elevated/40 font-semibold">
                  <td class="sticky start-0 z-10 whitespace-nowrap bg-elevated/40 p-2.5 text-start">
                    {{ totals.account_type_name }}
                  </td>
                  <td
                    :class="[cellClass, groupBorder]"
                    dir="ltr"
                  >
                    {{ formatCompactNumber(totals.purchased_kg) }}
                    <span class="font-normal text-muted">
                      ({{ formatCompactNumber(totals.ardab_total) }})
                    </span>
                  </td>
                  <td
                    :class="cellClass"
                    dir="ltr"
                  >
                    {{ formatCompactNumber(totals.delivered_kg) }}
                    <span class="font-normal text-muted">
                      ({{ formatCompactNumber(totals.ardab_delivered) }})
                    </span>
                  </td>
                  <td
                    :class="cellClass"
                    dir="ltr"
                  >
                    {{ formatCompactNumber(totals.remaining_kg) }}
                    <span class="font-normal text-muted">
                      ({{ formatCompactNumber(totals.ardab_remaining) }})
                    </span>
                  </td>
                  <td
                    :class="[cellClass, groupBorder]"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(totals.purchases_total) }}
                  </td>
                  <td
                    :class="cellClass"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(totals.money_paid) }}
                  </td>
                  <td
                    :class="cellClass"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(totals.money_due) }}
                  </td>
                  <td
                    :class="cellClass"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(totals.commission_total) }}
                  </td>
                  <td
                    :class="[cellClass, groupBorder]"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(totals.avg_price_per_ardab) }}
                  </td>
                  <td
                    :class="[cellClass, groupBorder]"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(totals.nolon_total) }}
                  </td>
                  <td
                    :class="cellClass"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(totals.nathriyat_total) }}
                  </td>
                  <td
                    :class="[cellClass, groupBorder]"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(totals.cost_paid) }}
                  </td>
                  <td
                    :class="cellClass"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(totals.cost_needed) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
      </template>

      <!-- Type detail -->
      <template v-else-if="selectedTypeRow">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge
            variant="subtle"
            color="primary"
            size="lg"
          >
            {{ accountTypeLabel(selectedTypeRow.account_type_name) }}
          </UBadge>
          <UButton
            size="sm"
            variant="ghost"
            color="neutral"
            icon="i-lucide-arrow-right"
            @click="selectedAccountTypeId = 'all'"
          >
            كل الأنواع
          </UButton>
        </div>

        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <!-- الكمية -->
          <UCard>
            <div class="mb-3 flex items-center gap-2">
              <span
                class="size-2.5 rounded-full"
                :style="{ backgroundColor: metricColors.purchased }"
              />
              <h3 class="text-sm font-semibold text-highlighted">
                الكمية
              </h3>
            </div>
            <div class="space-y-3">
              <div class="rounded-lg border border-default/70 bg-elevated/30 p-3">
                <p class="text-xs text-muted">
                  المشتريات
                </p>
                <p
                  class="mt-1 text-lg font-semibold tabular-nums text-highlighted"
                  dir="ltr"
                >
                  {{ formatCompactNumber(selectedTypeRow.purchased_kg) }}
                  <span class="text-sm font-normal text-muted">
                    كجم
                  </span>
                </p>
                <p class="mt-0.5 text-xs text-muted tabular-nums" dir="ltr">
                  ({{ formatCompactNumber(selectedTypeRow.ardab_total) }} أردب)
                </p>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div class="rounded-lg border border-success/25 bg-success/5 p-3">
                  <p class="text-xs text-muted">
                    مسلّم
                  </p>
                  <p
                    class="mt-1 font-semibold tabular-nums text-highlighted"
                    dir="ltr"
                  >
                    {{ formatCompactNumber(selectedTypeRow.delivered_kg) }}
                  </p>
                  <p class="mt-0.5 text-[11px] text-muted tabular-nums" dir="ltr">
                    ({{ formatCompactNumber(selectedTypeRow.ardab_delivered) }})
                  </p>
                </div>
                <div class="rounded-lg border border-warning/25 bg-warning/5 p-3">
                  <p class="text-xs text-muted">
                    متبقي
                  </p>
                  <p
                    class="mt-1 font-semibold tabular-nums text-highlighted"
                    dir="ltr"
                  >
                    {{ formatCompactNumber(selectedTypeRow.remaining_kg) }}
                  </p>
                  <p class="mt-0.5 text-[11px] text-muted tabular-nums" dir="ltr">
                    ({{ formatCompactNumber(selectedTypeRow.ardab_remaining) }})
                  </p>
                </div>
              </div>
            </div>
          </UCard>

          <!-- النقدية -->
          <UCard>
            <div class="mb-3 flex items-center gap-2">
              <span
                class="size-2.5 rounded-full"
                :style="{ backgroundColor: metricColors.paid }"
              />
              <h3 class="text-sm font-semibold text-highlighted">
                النقدية والمدفوعات
              </h3>
            </div>
            <div class="space-y-3">
              <div class="rounded-lg border border-default/70 bg-elevated/30 p-3">
                <p class="text-xs text-muted">
                  إجمالي المبلغ
                </p>
                <p
                  class="mt-1 text-lg font-semibold tabular-nums text-highlighted"
                  dir="ltr"
                >
                  {{ formatCompactMoney(selectedTypeRow.purchases_total) }}
                </p>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div class="rounded-lg border border-success/25 bg-success/5 p-3">
                  <p class="text-xs text-muted">
                    مدفوع
                  </p>
                  <p
                    class="mt-1 font-semibold tabular-nums text-highlighted"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(selectedTypeRow.money_paid) }}
                  </p>
                </div>
                <div class="rounded-lg border border-warning/25 bg-warning/5 p-3">
                  <p class="text-xs text-muted">
                    مستحق
                  </p>
                  <p
                    class="mt-1 font-semibold tabular-nums text-highlighted"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(selectedTypeRow.money_due) }}
                  </p>
                </div>
              </div>
              <div class="rounded-lg border border-default/70 bg-elevated/30 p-3">
                <div class="flex items-center justify-between gap-2">
                  <p class="text-xs text-muted">
                    عمولة
                  </p>
                  <p
                    class="font-semibold tabular-nums text-highlighted"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(selectedTypeRow.commission_total) }}
                  </p>
                </div>
              </div>
            </div>
          </UCard>

          <!-- التكاليف -->
          <UCard>
            <div class="mb-3 flex items-center gap-2">
              <span
                class="size-2.5 rounded-full"
                :style="{ backgroundColor: metricColors.cost }"
              />
              <h3 class="text-sm font-semibold text-highlighted">
                النولون والنثريات
              </h3>
            </div>
            <div class="space-y-3">
              <div class="grid grid-cols-2 gap-2">
                <div class="rounded-lg border border-default/70 bg-elevated/30 p-3">
                  <p class="text-xs text-muted">
                    نولون
                  </p>
                  <p
                    class="mt-1 font-semibold tabular-nums text-highlighted"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(selectedTypeRow.nolon_total) }}
                  </p>
                </div>
                <div class="rounded-lg border border-default/70 bg-elevated/30 p-3">
                  <p class="text-xs text-muted">
                    نثريات
                  </p>
                  <p
                    class="mt-1 font-semibold tabular-nums text-highlighted"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(selectedTypeRow.nathriyat_total) }}
                  </p>
                </div>
              </div>
              <div class="rounded-lg border border-default/70 bg-elevated/30 p-3">
                <p class="text-xs text-muted">
                  إجمالي التكاليف
                </p>
                <p
                  class="mt-1 text-lg font-semibold tabular-nums text-highlighted"
                  dir="ltr"
                >
                  {{ formatCompactMoney(selectedTypeRow.cost_total) }}
                </p>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div class="rounded-lg border border-success/25 bg-success/5 p-3">
                  <p class="text-xs text-muted">
                    مدفوع
                  </p>
                  <p
                    class="mt-1 font-semibold tabular-nums text-highlighted"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(selectedTypeRow.cost_paid) }}
                  </p>
                </div>
                <div class="rounded-lg border border-warning/25 bg-warning/5 p-3">
                  <p class="text-xs text-muted">
                    متبقي
                  </p>
                  <p
                    class="mt-1 font-semibold tabular-nums text-highlighted"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(selectedTypeRow.cost_needed) }}
                  </p>
                </div>
              </div>
            </div>
          </UCard>

          <!-- المتوسط -->
          <UCard>
            <div class="mb-3 flex items-center gap-2">
              <span
                class="size-2.5 rounded-full"
                :style="{ backgroundColor: metricColors.commission }"
              />
              <h3 class="text-sm font-semibold text-highlighted">
                المتوسط
              </h3>
            </div>
            <div class="flex h-[calc(100%-1.75rem)] flex-col justify-between gap-3">
              <div class="rounded-lg border border-default/70 bg-elevated/30 p-4">
                <p class="text-xs text-muted">
                  متوسط سعر الأردب
                </p>
                <p
                  class="mt-2 text-2xl font-bold tracking-tight tabular-nums text-highlighted"
                  dir="ltr"
                >
                  {{ formatCompactMoney(selectedTypeRow.avg_price_per_ardab) }}
                </p>
                <p class="mt-2 text-xs leading-relaxed text-muted">
                  يشمل المشتريات + العمولة + النولون + النثريات ÷ إجمالي الأردب
                </p>
              </div>
              <div class="rounded-lg border border-default/70 bg-elevated/30 p-3">
                <p class="text-xs text-muted">
                  إجمالي الأردب
                </p>
                <p
                  class="mt-1 text-lg font-semibold tabular-nums text-highlighted"
                  dir="ltr"
                >
                  {{ formatCompactNumber(selectedTypeRow.ardab_total) }}
                  <span class="text-sm font-normal text-muted">
                    أردب
                  </span>
                </p>
              </div>
            </div>
          </UCard>
        </div>

        <UCard :ui="{ body: 'p-0' }">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-default px-4 py-3">
            <div>
              <h3 class="font-semibold text-highlighted">
                تفصيل الموردين
              </h3>
              <p class="text-xs text-muted">
                {{ suppliersForSelectedType.length }} مورد ضمن هذا النوع
              </p>
            </div>
          </div>

          <div
            v-if="!suppliersForSelectedType.length"
            class="p-8 text-center text-sm text-muted"
          >
            لا يوجد موردون بهذا النوع لهذا الصنف في الموسم النشط.
          </div>

          <div
            v-else
            class="homos-scroll overflow-x-auto"
          >
            <table
              dir="rtl"
              class="w-max min-w-full border-separate border-spacing-0 text-sm text-center"
            >
              <thead class="text-muted">
                <tr>
                  <th
                    :class="[thClass, 'text-start bg-elevated']"
                    rowspan="2"
                  >
                    المورد
                  </th>
                  <th
                    :class="[thClass, groupHead, groupBorder]"
                    colspan="3"
                  >
                    الكمية
                    <span class="font-normal text-muted">
                      كجم (أردب)
                    </span>
                  </th>
                  <th
                    :class="[thClass, groupHead, groupBorder]"
                    colspan="4"
                  >
                    النقدية
                  </th>
                  <th :class="[thClass, groupHead, groupBorder]">
                    التكاليف
                  </th>
                </tr>
                <tr class="bg-elevated/50">
                  <th :class="[thClass, groupBorder]">
                    مشتريات
                  </th>
                  <th :class="thClass">
                    مسلّم
                  </th>
                  <th :class="thClass">
                    متبقي
                  </th>
                  <th :class="[thClass, groupBorder]">
                    المبلغ
                  </th>
                  <th :class="thClass">
                    مدفوع
                  </th>
                  <th :class="thClass">
                    مستحق
                  </th>
                  <th :class="thClass">
                    عمولة
                  </th>
                  <th :class="[thClass, groupBorder]">
                    متبقي
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="s in suppliersForSelectedType"
                  :key="s.supplier_id"
                  class="border-t border-default hover:bg-elevated/30"
                >
                  <td class="whitespace-nowrap p-2.5 text-start">
                    <NuxtLink
                      :to="`/suppliers/${s.supplier_id}`"
                      class="font-medium text-primary hover:underline"
                    >
                      {{ s.supplier_name }}
                    </NuxtLink>
                  </td>
                  <td
                    :class="[cellClass, groupBorder]"
                    dir="ltr"
                  >
                    {{ formatCompactNumber(s.purchased_kg) }}
                    <span class="text-muted">
                      ({{ formatCompactNumber(s.ardab_total) }})
                    </span>
                  </td>
                  <td
                    :class="cellClass"
                    dir="ltr"
                  >
                    {{ formatCompactNumber(s.delivered_kg) }}
                    <span class="text-muted">
                      ({{ formatCompactNumber(s.ardab_delivered) }})
                    </span>
                  </td>
                  <td
                    :class="cellClass"
                    dir="ltr"
                  >
                    {{ formatCompactNumber(s.remaining_kg) }}
                    <span class="text-muted">
                      ({{ formatCompactNumber(s.ardab_remaining) }})
                    </span>
                  </td>
                  <td
                    :class="[cellClass, groupBorder]"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(s.purchases_total) }}
                  </td>
                  <td
                    :class="cellClass"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(s.money_paid) }}
                  </td>
                  <td
                    :class="cellClass"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(s.money_due) }}
                  </td>
                  <td
                    :class="cellClass"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(s.commission_total) }}
                  </td>
                  <td
                    :class="[cellClass, groupBorder]"
                    dir="ltr"
                  >
                    {{ formatCompactMoney(s.cost_needed) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
      </template>
    </template>
  </div>
</template>
