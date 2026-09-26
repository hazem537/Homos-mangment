<script setup lang="ts">
import { formatMoney, formatNumber } from '~/utils/formatNumber'
import { accountTypeLabel } from '~/utils/accountType'
import type { SupplierStatsRow } from '../composables/useSupplierStats'

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
  totals
} = useSupplierStats()

const cellClass = 'p-2 whitespace-nowrap tabular-nums text-end'
const thClass = 'p-2 font-medium whitespace-nowrap'

const detailRow = computed(() => selectedTypeRow.value)

function qtyCards(row: SupplierStatsRow) {
  return [
    { label: 'إجمالي الكمية', value: formatNumber(row.purchased_kg), unit: 'كجم', tone: 'default' as const },
    { label: 'المسلّم', value: formatNumber(row.delivered_kg), unit: 'كجم', tone: 'success' as const },
    { label: 'المتبقي', value: formatNumber(row.remaining_kg), unit: 'كجم', tone: 'warning' as const },
    { label: 'إجمالي الأردب', value: formatNumber(row.ardab_total), unit: 'أردب', tone: 'default' as const },
    { label: 'أردب مسلّم', value: formatNumber(row.ardab_delivered), unit: 'أردب', tone: 'success' as const },
    { label: 'أردب متبقي', value: formatNumber(row.ardab_remaining), unit: 'أردب', tone: 'warning' as const }
  ]
}

function moneyCards(row: SupplierStatsRow) {
  return [
    { label: 'إجمالي المبلغ', value: formatMoney(row.purchases_total), tone: 'default' as const },
    { label: 'المدفوع', value: formatMoney(row.money_paid), tone: 'success' as const },
    { label: 'المستحق', value: formatMoney(row.money_due), tone: 'warning' as const },
    { label: 'متوسط سعر الأردب', value: formatMoney(row.avg_price_per_ardab), tone: 'default' as const }
  ]
}

function costCards(row: SupplierStatsRow) {
  return [
    { label: 'إجمالي النولون', value: formatMoney(row.nolon_total), tone: 'default' as const },
    { label: 'إجمالي النثريات', value: formatMoney(row.nathriyat_total), tone: 'default' as const },
    { label: 'إجمالي التكاليف', value: formatMoney(row.cost_total), tone: 'default' as const },
    { label: 'مدفوع نولون+نثريات', value: formatMoney(row.cost_paid), tone: 'success' as const },
    { label: 'متبقي نولون+نثريات', value: formatMoney(row.cost_needed), tone: 'warning' as const }
  ]
}

function toneClass(tone: 'default' | 'success' | 'warning') {
  if (tone === 'success') return 'border-success/30 bg-success/5'
  if (tone === 'warning') return 'border-warning/30 bg-warning/5'
  return 'border-default bg-elevated/40'
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
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
          حسب نوع الحساب لصنف واحد في الموسم النشط
        </p>
      </div>
      <div
        v-if="!loading"
        class="flex flex-wrap items-center gap-2"
      >
        <USelect
          v-model="selectedProductId"
          :items="productOptions"
          value-key="value"
          label-key="label"
          class="w-48"
          placeholder="الصنف"
        />
        <USelect
          v-model="selectedAccountTypeId"
          :items="accountTypeOptions"
          value-key="value"
          label-key="label"
          class="w-44"
          placeholder="نوع الحساب"
        />
      </div>
    </div>

    <div v-if="loading">
      <TableSkeleton :cols="8" />
    </div>

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

    <!-- All types: comparison table -->
    <UCard
      v-else-if="isAllTypesView"
      :ui="{ body: 'p-0' }"
    >
      <div class="homos-scroll overflow-x-auto">
        <table dir="rtl" class="w-max min-w-full text-sm text-center">
          <thead class="bg-elevated/60 text-muted">
            <tr>
              <th :class="thClass + ' text-start'" rowspan="2">
                نوع الحساب
              </th>
              <th :class="thClass" colspan="3">
                الكمية (كجم)
              </th>
              <th :class="thClass" colspan="3">
                الأردب
              </th>
              <th :class="thClass" colspan="3">
                النقدية
              </th>
              <th :class="thClass">
                متوسط سعر الأردب
              </th>
              <th :class="thClass" colspan="2">
                التكاليف
              </th>
              <th :class="thClass" colspan="2">
                دفع التكاليف
              </th>
            </tr>
            <tr>
              <th :class="thClass">
                الكل
              </th>
              <th :class="thClass">
                مسلّم
              </th>
              <th :class="thClass">
                متبقي
              </th>
              <th :class="thClass">
                الكل
              </th>
              <th :class="thClass">
                مسلّم
              </th>
              <th :class="thClass">
                متبقي
              </th>
              <th :class="thClass">
                الكل
              </th>
              <th :class="thClass">
                مدفوع
              </th>
              <th :class="thClass">
                مستحق
              </th>
              <th :class="thClass">
                —
              </th>
              <th :class="thClass">
                نولون
              </th>
              <th :class="thClass">
                نثريات
              </th>
              <th :class="thClass">
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
              class="border-t border-default hover:bg-elevated/30 cursor-pointer"
              @click="selectedAccountTypeId = row.account_type_id"
            >
              <td class="p-2 text-start font-medium whitespace-nowrap">
                {{ accountTypeLabel(row.account_type_name) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatNumber(row.purchased_kg) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatNumber(row.delivered_kg) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatNumber(row.remaining_kg) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatNumber(row.ardab_total) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatNumber(row.ardab_delivered) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatNumber(row.ardab_remaining) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatMoney(row.purchases_total) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatMoney(row.money_paid) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatMoney(row.money_due) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatMoney(row.avg_price_per_ardab) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatMoney(row.nolon_total) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatMoney(row.nathriyat_total) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatMoney(row.cost_paid) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatMoney(row.cost_needed) }}
              </td>
            </tr>
            <tr class="border-t-2 border-default bg-elevated/40 font-semibold">
              <td class="p-2 text-start whitespace-nowrap">
                {{ totals.account_type_name }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatNumber(totals.purchased_kg) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatNumber(totals.delivered_kg) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatNumber(totals.remaining_kg) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatNumber(totals.ardab_total) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatNumber(totals.ardab_delivered) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatNumber(totals.ardab_remaining) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatMoney(totals.purchases_total) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatMoney(totals.money_paid) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatMoney(totals.money_due) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatMoney(totals.avg_price_per_ardab) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatMoney(totals.nolon_total) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatMoney(totals.nathriyat_total) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatMoney(totals.cost_paid) }}
              </td>
              <td :class="cellClass" dir="ltr">
                {{ formatMoney(totals.cost_needed) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="border-t border-default px-4 py-2 text-xs text-muted">
        اضغط على صف نوع لعرض التفاصيل
      </p>
    </UCard>

    <!-- Single type: grouped cards -->
    <template v-else-if="detailRow">
      <div class="flex flex-wrap items-center gap-2">
        <UBadge
          variant="subtle"
          color="primary"
          size="lg"
        >
          {{ accountTypeLabel(detailRow.account_type_name) }}
        </UBadge>
        <UButton
          size="sm"
          variant="ghost"
          color="neutral"
          icon="i-lucide-layout-list"
          @click="selectedAccountTypeId = 'all'"
        >
          عرض كل الأنواع
        </UButton>
      </div>

      <section class="space-y-3">
        <h3 class="text-sm font-semibold text-highlighted">
          الكمية
        </h3>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="card in qtyCards(detailRow)"
            :key="card.label"
            class="rounded-lg border p-4"
            :class="toneClass(card.tone)"
          >
            <p class="text-xs text-muted">
              {{ card.label }}
            </p>
            <p class="mt-1 text-xl font-semibold tabular-nums text-highlighted" dir="ltr">
              {{ card.value }}
              <span class="text-sm font-normal text-muted">
                {{ card.unit }}
              </span>
            </p>
          </div>
        </div>
      </section>

      <section class="space-y-3">
        <h3 class="text-sm font-semibold text-highlighted">
          النقدية
        </h3>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div
            v-for="card in moneyCards(detailRow)"
            :key="card.label"
            class="rounded-lg border p-4"
            :class="toneClass(card.tone)"
          >
            <p class="text-xs text-muted">
              {{ card.label }}
            </p>
            <p class="mt-1 text-xl font-semibold tabular-nums text-highlighted" dir="ltr">
              {{ card.value }}
            </p>
          </div>
        </div>
      </section>

      <section class="space-y-3">
        <h3 class="text-sm font-semibold text-highlighted">
          النولون والنثريات
        </h3>
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="card in costCards(detailRow)"
            :key="card.label"
            class="rounded-lg border p-4"
            :class="toneClass(card.tone)"
          >
            <p class="text-xs text-muted">
              {{ card.label }}
            </p>
            <p class="mt-1 text-xl font-semibold tabular-nums text-highlighted" dir="ltr">
              {{ card.value }}
            </p>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>
