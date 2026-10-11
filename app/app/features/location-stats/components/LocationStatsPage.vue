<script setup lang="ts">
import {
  formatCompactMoney,
  formatCompactNumber,
  formatMoney,
  formatNumber
} from '~/utils/formatNumber'
import { accountTypeLabel } from '~/utils/accountType'
import type { LocationStatsDisplayRow } from '../composables/useLocationStats'

const {
  loading,
  season,
  filteredRows,
  kindTotals,
  totals,
  showWasteColumns,
  productOptions,
  kindOptions,
  accountTypeOptions,
  selectedProductId,
  selectedKind,
  selectedAccountTypeId,
  selectKind,
  isKindDimmed,
  warehouseWasteEnabled,
  warehouseWasteRatio,
  meklaWasteEnabled,
  meklaWasteRatio,
  ardabPrice,
  setWarehouseWasteRatio,
  setMeklaWasteRatio,
  setArdabPrice
} = useLocationStats()

const cellClass = 'max-w-[9.5rem] truncate p-2 whitespace-nowrap tabular-nums text-end'
const thClass = 'p-2 font-medium whitespace-nowrap'

function kindBadgeColor(kind: LocationStatsDisplayRow['kind']) {
  if (kind === 'warehouse') return 'warning' as const
  if (kind === 'store') return 'primary' as const
  return 'secondary' as const
}

function rowKey(row: LocationStatsDisplayRow) {
  return `${row.kind}:${row.id}:${row.product_id || 'none'}:${row.status_id || 'none'}`
}

const tableColspan = computed(() => (showWasteColumns.value ? 9 : 7))
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-2xl font-semibold text-highlighted">
            إحصائيات المخازن
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
          أرصدة الشون والمخازن والمقالي في الموسم النشط
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
            placeholder="نوع الحساب"
          />
        </UFormField>
        <UFormField label="الصنف">
          <USelect
            v-model="selectedProductId"
            :items="productOptions"
            value-key="value"
            label-key="label"
            class="w-48"
            placeholder="الصنف"
          />
        </UFormField>
        <UFormField label="تصنيف المكان">
          <USelect
            v-model="selectedKind"
            :items="kindOptions"
            value-key="value"
            label-key="label"
            class="w-40"
            placeholder="تصنيف المكان"
          />
        </UFormField>
      </div>
    </div>

    <div v-if="loading">
      <TableSkeleton :cols="6" />
    </div>

    <UCard
      v-else-if="!season"
      :ui="{ body: 'p-8 text-center text-muted' }"
    >
      لا يوجد موسم نشط — فعّل موسماً من شاشة المواسم أولاً.
    </UCard>

    <template v-else>
      <div class="grid grid-cols-3 gap-3 xl:grid-cols-4">
        <div
          v-for="card in kindTotals"
          :key="card.kind"
          role="button"
          tabindex="0"
          class="group relative overflow-hidden rounded-xl border p-3 sm:p-4 flex flex-col gap-3 transition-all duration-200 cursor-pointer"
          :class="[
            selectedKind === card.kind
              ? 'border-primary/50 bg-primary/5 shadow-sm ring-1 ring-primary/20 opacity-100'
              : isKindDimmed(card.kind)
                ? 'border-default bg-elevated/40 opacity-40 hover:opacity-70'
                : 'border-default bg-elevated/50 opacity-100 hover:border-default/80 hover:bg-elevated/70'
          ]"
          @click="selectKind(card.kind)"
          @keydown.enter.prevent="selectKind(card.kind)"
          @keydown.space.prevent="selectKind(card.kind)"
        >
          <div
            class="pointer-events-none absolute inset-x-0 top-0 h-0.5"
            :class="{
              'bg-warning/70': card.kind === 'warehouse',
              'bg-primary/70': card.kind === 'store',
              'bg-secondary/70': card.kind === 'mekla'
            }"
          />

          <div class="min-w-0">
            <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <p class="text-xs font-medium tracking-wide text-muted">
                {{ card.label }}
              </p>
              <span
                class="truncate text-xs text-muted tabular-nums"
                dir="ltr"
                :title="`${formatNumber(card.waste_enabled ? card.net_ardab : card.ardab_total)} أردب`"
              >
                {{ formatCompactNumber(card.waste_enabled ? card.net_ardab : card.ardab_total) }} أردب
              </span>
            </div>
            <p
              class="mt-2 truncate text-xl font-semibold tracking-tight tabular-nums text-highlighted sm:text-2xl"
              dir="ltr"
              :title="`${formatNumber(card.waste_enabled ? card.net_kg : card.kg_total)} كجم`"
            >
              {{ formatCompactNumber(card.waste_enabled ? card.net_kg : card.kg_total) }}
              <span class="text-sm font-normal text-muted">
                كجم
              </span>
            </p>
          </div>

          <!-- Waste controls: do not toggle kind selection -->
          <div
            v-if="card.kind === 'warehouse'"
            class="relative z-10 mt-auto flex items-center gap-2.5 rounded-lg border border-default/70 bg-default px-3 py-2.5"
            @click.stop
          >
            <USwitch
              v-model="warehouseWasteEnabled"
              size="lg"
              color="warning"
            />
            <span class="shrink-0 text-xs font-medium text-muted">
              هدر
            </span>
            <UInput
              :model-value="warehouseWasteRatio"
              :disabled="!warehouseWasteEnabled"
              inputmode="decimal"
              dir="ltr"
              size="md"
              placeholder="0"
              class="min-w-0 flex-1"
              :ui="{ base: 'tabular-nums text-center' }"
              :class="!warehouseWasteEnabled && 'opacity-40'"
              @update:model-value="setWarehouseWasteRatio(String($event ?? ''))"
            />
            <span
              class="shrink-0 text-xs text-muted"
              :class="!warehouseWasteEnabled && 'opacity-40'"
            >
              %
            </span>
          </div>

          <div
            v-else-if="card.kind === 'mekla'"
            class="relative z-10 mt-auto flex items-center gap-2.5 rounded-lg border border-default/70 bg-default px-3 py-2.5"
            @click.stop
          >
            <USwitch
              v-model="meklaWasteEnabled"
              size="lg"
              color="secondary"
            />
            <span class="shrink-0 text-xs font-medium text-muted">
              هدر
            </span>
            <UInput
              :model-value="meklaWasteRatio"
              :disabled="!meklaWasteEnabled"
              inputmode="decimal"
              dir="ltr"
              size="md"
              placeholder="0"
              class="min-w-0 flex-1"
              :ui="{ base: 'tabular-nums text-center' }"
              :class="!meklaWasteEnabled && 'opacity-40'"
              @update:model-value="setMeklaWasteRatio(String($event ?? ''))"
            />
            <span
              class="shrink-0 text-xs text-muted"
              :class="!meklaWasteEnabled && 'opacity-40'"
            >
              %
            </span>
          </div>
        </div>

        <div
          role="button"
          tabindex="0"
          class="col-span-3 xl:col-span-1 relative overflow-hidden rounded-2xl border-2 border-primary/40 bg-gradient-to-br from-primary/15 via-primary/8 to-elevated/40 p-5 flex flex-col gap-4 shadow-md transition-all duration-200 cursor-pointer"
          :class="selectedKind === 'all'
            ? 'opacity-100 ring-2 ring-primary/25'
            : 'opacity-40 hover:opacity-70'"
          @click="selectedKind = 'all'"
          @keydown.enter.prevent="selectedKind = 'all'"
          @keydown.space.prevent="selectedKind = 'all'"
        >
          <div class="pointer-events-none absolute -start-8 -top-8 size-28 rounded-full bg-primary/10 blur-2xl" />
          <div class="pointer-events-none absolute -end-6 -bottom-6 size-24 rounded-full bg-primary/10 blur-2xl" />

          <div class="relative min-w-0">
            <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <p class="text-sm font-semibold tracking-wide text-highlighted">
                الإجمالي الصافي
              </p>
              <span
                class="truncate text-sm text-muted tabular-nums"
                dir="ltr"
                :title="`${formatNumber(totals.net_ardab)} أردب`"
              >
                {{ formatCompactNumber(totals.net_ardab) }} أردب
              </span>
            </div>
            <p
              class="mt-3 truncate text-3xl font-bold tracking-tight tabular-nums text-highlighted sm:text-4xl"
              dir="ltr"
              :title="`${formatNumber(totals.net_kg)} كجم`"
            >
              {{ formatCompactNumber(totals.net_kg) }}
              <span class="text-lg font-medium text-muted">
                كجم
              </span>
            </p>
          </div>

          <div
            class="relative z-10 mt-auto space-y-3"
            @click.stop
          >
            <div class="flex items-center gap-3 rounded-xl border border-primary/25 bg-default/80 px-3.5 py-3 shadow-sm backdrop-blur-sm">
              <span class="shrink-0 text-sm font-semibold text-muted">
                سعر الأردب
              </span>
              <UInput
                :model-value="ardabPrice"
                inputmode="decimal"
                dir="ltr"
                size="lg"
                placeholder="0"
                class="min-w-0 flex-1"
                :ui="{ base: 'tabular-nums text-center text-base font-semibold' }"
                @update:model-value="setArdabPrice(String($event ?? ''))"
              />
              <span class="shrink-0 text-sm text-muted">
                جنيه
              </span>
            </div>

            <div class="rounded-xl border border-primary/20 bg-primary/10 px-3.5 py-3">
              <p class="text-sm font-medium text-muted">
                قيمة المخزون
              </p>
              <p
                class="mt-1 truncate text-xl font-bold tracking-tight tabular-nums text-primary sm:text-2xl"
                dir="ltr"
                :title="formatMoney(totals.total_price)"
              >
                {{ formatCompactMoney(totals.total_price) }}
              </p>
            </div>

            <p
              v-if="totals.waste_kg > 0"
              class="inline-flex w-fit max-w-full items-center truncate rounded-lg bg-warning/10 px-2.5 py-1 text-sm text-warning tabular-nums"
              dir="ltr"
              :title="`${formatNumber(totals.waste_kg)} كجم`"
            >
              إجمالي الهدر {{ formatCompactNumber(totals.waste_kg) }} كجم
            </p>
          </div>
        </div>
      </div>

      <UCard :ui="{ body: 'p-0' }">
        <div class="homos-scroll overflow-x-auto">
          <table
            dir="rtl"
            class="w-max min-w-full text-sm text-center"
          >
            <thead class="bg-elevated/60 text-muted">
              <tr>
                <th :class="thClass + ' text-start'">
                  النوع
                </th>
                <th :class="thClass + ' text-start'">
                  الاسم
                </th>
                <th :class="thClass">
                  نوع الحساب
                </th>
                <th :class="thClass">
                  الصنف
                </th>
                <th :class="thClass">
                  الحالة
                </th>
                <th :class="thClass">
                  الرصيد (كجم)
                </th>
                <th :class="thClass">
                  الرصيد (أردب)
                </th>
                <th
                  v-if="showWasteColumns"
                  :class="thClass"
                >
                  الهدر (كجم)
                </th>
                <th
                  v-if="showWasteColumns"
                  :class="thClass"
                >
                  الصافي (كجم)
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in filteredRows"
                :key="rowKey(row)"
                class="border-t border-default hover:bg-elevated/30"
              >
                <td class="p-2 text-start whitespace-nowrap">
                  <UBadge
                    variant="subtle"
                    size="lg"
                    :color="kindBadgeColor(row.kind)"
                  >
                    {{ row.kind_label }}
                  </UBadge>
                </td>
                <td class="p-2 text-start font-medium whitespace-nowrap">
                  <NuxtLink
                    :to="row.detail_path"
                    class="text-highlighted hover:underline"
                  >
                    {{ row.name }}
                  </NuxtLink>
                </td>
                <td class="p-2 whitespace-nowrap">
                  {{ row.kind === 'warehouse' ? accountTypeLabel(row.account_type_name) : '—' }}
                </td>
                <td class="p-2 whitespace-nowrap">
                  {{ row.product_name || '—' }}
                </td>
                <td class="p-2 whitespace-nowrap">
                  {{ row.status_name || '—' }}
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                  :title="formatNumber(row.kg_total)"
                >
                  {{ formatCompactNumber(row.kg_total) }}
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                  :title="formatNumber(row.ardab_total)"
                >
                  {{ formatCompactNumber(row.ardab_total) }}
                </td>
                <td
                  v-if="showWasteColumns"
                  :class="[cellClass, row.waste_applied ? 'text-warning' : '']"
                  dir="ltr"
                  :title="row.kind === 'store' ? undefined : formatNumber(row.waste_kg)"
                >
                  {{ row.kind === 'store' ? '—' : formatCompactNumber(row.waste_kg) }}
                </td>
                <td
                  v-if="showWasteColumns"
                  :class="cellClass"
                  dir="ltr"
                  :title="formatNumber(row.net_kg)"
                >
                  {{ formatCompactNumber(row.net_kg) }}
                </td>
              </tr>
              <tr
                v-if="!filteredRows.length"
                class="border-t border-default"
              >
                <td
                  :colspan="tableColspan"
                  class="p-8 text-center text-muted"
                >
                  لا توجد أرصدة مطابقة للفلتر
                </td>
              </tr>
              <tr
                v-else
                class="border-t-2 border-default bg-elevated/40 font-semibold"
              >
                <td
                  class="p-2 text-start whitespace-nowrap"
                  colspan="5"
                >
                  الإجمالي
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                  :title="formatNumber(totals.kg_total)"
                >
                  {{ formatCompactNumber(totals.kg_total) }}
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                  :title="formatNumber(totals.ardab_total)"
                >
                  {{ formatCompactNumber(totals.ardab_total) }}
                </td>
                <td
                  v-if="showWasteColumns"
                  :class="cellClass + ' text-warning'"
                  dir="ltr"
                  :title="formatNumber(totals.waste_kg)"
                >
                  {{ formatCompactNumber(totals.waste_kg) }}
                </td>
                <td
                  v-if="showWasteColumns"
                  :class="cellClass"
                  dir="ltr"
                  :title="formatNumber(totals.net_kg)"
                >
                  {{ formatCompactNumber(totals.net_kg) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
    </template>
  </div>
</template>
