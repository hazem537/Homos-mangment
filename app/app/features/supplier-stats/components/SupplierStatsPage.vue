<script setup lang="ts">
import {
  formatMoney,
  formatNumber,
  signedTone
} from '~/utils/formatNumber'
import { accountTypeLabel } from '~/utils/accountType'
import type { SupplierDetailRow } from '../utils/fetchSupplierStats'

const {
  initialLoading,
  isRefreshing,
  season,
  productOptions,
  accountTypeOptions,
  selectedProductId,
  selectedAccountTypeId,
  search,
  hasActiveFilters,
  resetFilters,
  isAllTypesView,
  selectedTypeRow,
  rows,
  totals,
  supplierRows,
  supplierTotals,
  openType,
  backToTypes
} = useSupplierStats()

const cellClass = 'p-2.5 whitespace-nowrap tabular-nums text-end text-base font-semibold'
const thClass = 'p-2.5 font-medium whitespace-nowrap'
const groupBorder = 'border-r-2 border-default'
const groupHead = 'bg-elevated/80'
const stickyActions
  = 'sticky left-0 z-20 w-28 bg-elevated group-hover:bg-muted/60 shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.18)] dark:shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.45)]'
const stickyActionsHead
  = 'sticky left-0 z-30 w-28 bg-accented shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.18)] dark:shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.45)]'

const signedClass = (n: number | null | undefined) => {
  const tone = signedTone(n)
  if (tone === 'error') return 'text-error'
  if (tone === 'warning') return 'text-warning'
  return 'text-success'
}

const quantityCell = (kg: number, ardab: number) =>
  `${formatNumber(kg)} (${formatNumber(ardab)})`

function supplierDetailTo(row: SupplierDetailRow) {
  return `/suppliers/${row.supplier_id}/${row.product_id || selectedProductId.value}`
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-highlighted">
          إحصائيات الموردين
        </h1>
        <p class="mt-1 text-sm text-muted">
          <template v-if="season">
            {{ season.name }} — جدول تفاعلي حسب الصنف والنوع
          </template>
          <template v-else>
            لا يوجد موسم نشط
          </template>
        </p>
      </div>

      <UButton
        v-if="!isAllTypesView"
        color="neutral"
        variant="outline"
        size="sm"
        icon="i-lucide-arrow-right"
        @click="backToTypes"
      >
        كل الأنواع
      </UButton>
    </div>

    <SupplierStatsFilters
      v-model:search="search"
      v-model:product-id="selectedProductId"
      v-model:account-type-id="selectedAccountTypeId"
      :product-options="productOptions"
      :account-type-options="accountTypeOptions"
      :disabled="initialLoading"
      :refreshing="isRefreshing"
      :show-reset="hasActiveFilters"
      :show-search="!isAllTypesView"
      @reset="resetFilters"
    />

    <div v-if="initialLoading">
      <TableSkeleton />
    </div>

    <div
      v-else-if="!season"
      class="rounded-lg bg-elevated/60 p-6 text-center text-sm text-muted"
    >
      فعّل موسماً من شاشة المواسم أولاً.
    </div>

    <div
      v-else
      class="relative transition-opacity duration-200"
      :class="isRefreshing ? 'opacity-50 pointer-events-none' : 'opacity-100'"
      :aria-busy="isRefreshing"
    >
      <div
        v-if="isRefreshing"
        class="pointer-events-none absolute inset-x-0 top-8 z-10 flex justify-center"
      >
        <div class="flex items-center gap-2 rounded-full border border-default bg-default/90 px-3 py-1.5 text-sm text-muted shadow-sm backdrop-blur-sm">
          <UIcon
            name="i-lucide-loader-circle"
            class="size-4 animate-spin text-primary"
          />
          تحديث البيانات…
        </div>
      </div>

      <UCard
        v-if="isAllTypesView"
        :ui="{ root: 'overflow-hidden', body: 'p-0 sm:p-0' }"
      >
        <div class="overflow-x-auto">
          <table
            dir="rtl"
            class="w-max min-w-full border-separate border-spacing-0 text-center text-sm"
          >
            <thead class="bg-accented text-muted">
              <tr>
                <th
                  :class="[thClass, 'sticky start-0 z-10 bg-accented text-start']"
                  rowspan="2"
                >
                  نوع الحساب
                </th>
                <th
                  :class="[thClass, groupHead, groupBorder]"
                  colspan="3"
                >
                  الكمية
                </th>
                <th
                  :class="[thClass, groupHead, groupBorder]"
                  colspan="4"
                >
                  النقدية
                </th>
                <th :class="[thClass, groupHead, groupBorder]">
                  مصروفات الشونة
                </th>
                <th :class="[thClass, groupHead, groupBorder]">
                  متوسط الأردب
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
              <tr class="bg-accented/80">
                <th :class="[thClass, groupBorder]">
                  مشترى
                </th>
                <th :class="thClass">
                  مستلم
                </th>
                <th :class="thClass">
                  متبقي
                </th>
                <th :class="[thClass, groupBorder]">
                  مشتريات
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
                class="group cursor-pointer border-t border-default hover:bg-muted/60"
                @click="openType(row.account_type_id)"
              >
                <td class="sticky start-0 z-10 whitespace-nowrap bg-elevated p-2.5 text-start font-medium group-hover:bg-muted/60">
                  {{ accountTypeLabel(row.account_type_name) }}
                </td>
                <td
                  :class="[cellClass, groupBorder]"
                  dir="ltr"
                >
                  {{ quantityCell(row.purchased_kg, row.ardab_total) }}
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                >
                  {{ quantityCell(row.delivered_kg, row.ardab_delivered) }}
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                >
                  {{ quantityCell(row.remaining_kg, row.ardab_remaining) }}
                </td>
                <td
                  :class="[cellClass, groupBorder]"
                  dir="ltr"
                >
                  {{ formatMoney(row.purchases_total) }}
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                >
                  {{ formatMoney(row.money_paid) }}
                </td>
                <td
                  :class="[cellClass, signedClass(row.money_due)]"
                  dir="ltr"
                >
                  {{ formatMoney(row.money_due) }}
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                >
                  {{ formatMoney(row.commission_total) }}
                </td>
                <td
                  :class="[cellClass, groupBorder]"
                  dir="ltr"
                >
                  {{ formatMoney(row.warehouse_costs_total) }}
                </td>
                <td
                  :class="[cellClass, groupBorder]"
                  dir="ltr"
                >
                  {{ formatMoney(row.avg_price_per_ardab) }}
                </td>
                <td
                  :class="[cellClass, groupBorder]"
                  dir="ltr"
                >
                  {{ formatMoney(row.nolon_total) }}
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                >
                  {{ formatMoney(row.nathriyat_total) }}
                </td>
                <td
                  :class="[cellClass, groupBorder]"
                  dir="ltr"
                >
                  {{ formatMoney(row.cost_paid) }}
                </td>
                <td
                  :class="[cellClass, signedClass(row.cost_needed)]"
                  dir="ltr"
                >
                  {{ formatMoney(row.cost_needed) }}
                </td>
              </tr>

              <tr
                v-if="!rows.length"
                class="border-t border-default"
              >
                <td
                  colspan="14"
                  class="p-8 text-center text-muted"
                >
                  لا توجد بيانات لهذا الصنف
                </td>
              </tr>

              <tr
                v-else
                class="border-t-2 border-default bg-elevated/40 font-semibold"
              >
                <td class="sticky start-0 z-10 whitespace-nowrap bg-elevated/40 p-2.5 text-start">
                  {{ totals.account_type_name }}
                </td>
                <td
                  :class="[cellClass, groupBorder]"
                  dir="ltr"
                >
                  {{ quantityCell(totals.purchased_kg, totals.ardab_total) }}
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                >
                  {{ quantityCell(totals.delivered_kg, totals.ardab_delivered) }}
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                >
                  {{ quantityCell(totals.remaining_kg, totals.ardab_remaining) }}
                </td>
                <td
                  :class="[cellClass, groupBorder]"
                  dir="ltr"
                >
                  {{ formatMoney(totals.purchases_total) }}
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                >
                  {{ formatMoney(totals.money_paid) }}
                </td>
                <td
                  :class="[cellClass, signedClass(totals.money_due)]"
                  dir="ltr"
                >
                  {{ formatMoney(totals.money_due) }}
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                >
                  {{ formatMoney(totals.commission_total) }}
                </td>
                <td
                  :class="[cellClass, groupBorder]"
                  dir="ltr"
                >
                  {{ formatMoney(totals.warehouse_costs_total) }}
                </td>
                <td
                  :class="[cellClass, groupBorder]"
                  dir="ltr"
                >
                  {{ formatMoney(totals.avg_price_per_ardab) }}
                </td>
                <td
                  :class="[cellClass, groupBorder]"
                  dir="ltr"
                >
                  {{ formatMoney(totals.nolon_total) }}
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                >
                  {{ formatMoney(totals.nathriyat_total) }}
                </td>
                <td
                  :class="[cellClass, groupBorder]"
                  dir="ltr"
                >
                  {{ formatMoney(totals.cost_paid) }}
                </td>
                <td
                  :class="[cellClass, signedClass(totals.cost_needed)]"
                  dir="ltr"
                >
                  {{ formatMoney(totals.cost_needed) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>

      <UCard
        v-else
        :ui="{ root: 'overflow-hidden', body: 'p-0 sm:p-0' }"
      >
        <div class="flex items-center justify-between gap-3 border-b border-default px-4 py-3">
          <div>
            <p class="text-sm font-medium text-highlighted">
              {{ accountTypeLabel(selectedTypeRow?.account_type_name || '—') }}
            </p>
            <p class="text-xs text-muted">
              اضغط على المورد لفتح كشف الحساب
            </p>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table
            dir="rtl"
            class="w-max min-w-full border-separate border-spacing-0 text-center text-sm"
          >
            <thead class="bg-accented text-muted">
              <tr>
                <th
                  :class="[thClass, 'sticky start-0 z-10 bg-accented text-start']"
                  rowspan="2"
                >
                  المورد
                </th>
                <th
                  :class="[thClass, groupHead, groupBorder]"
                  colspan="4"
                >
                  الكمية
                </th>
                <th
                  :class="[thClass, groupHead, groupBorder]"
                  colspan="3"
                >
                  النقدية
                </th>
                <th :class="[thClass, groupHead, groupBorder]">
                  متوسط الأردب
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
                  دفع النولون
                </th>
                <th
                  :class="stickyActionsHead"
                  rowspan="2"
                >
                  عرض
                </th>
              </tr>
              <tr class="bg-accented/80">
                <th :class="[thClass, groupBorder]">
                  كيلو
                </th>
                <th :class="thClass">
                  أردب
                </th>
                <th :class="thClass">
                  مستلم
                </th>
                <th :class="thClass">
                  باقي
                </th>
                <th :class="[thClass, groupBorder]">
                  إجمالي السعر
                </th>
                <th :class="thClass">
                  تحويلات
                </th>
                <th :class="thClass">
                  الباقي
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
                  دفعة
                </th>
                <th :class="thClass">
                  الباقي
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="s in supplierRows"
                :key="`${s.supplier_id}-${s.product_id}`"
                class="group border-t border-default hover:bg-muted/60"
              >
                <td class="sticky start-0 z-10 whitespace-nowrap bg-elevated p-2.5 text-start font-medium group-hover:bg-muted/60">
                  <NuxtLink
                    :to="supplierDetailTo(s)"
                    class="hover:text-primary hover:underline"
                  >
                    {{ s.supplier_name }}
                  </NuxtLink>
                </td>
                <td
                  :class="[cellClass, groupBorder]"
                  dir="ltr"
                >
                  {{ formatNumber(s.purchased_kg) }}
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                >
                  {{ formatNumber(s.ardab_total) }}
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                >
                  {{ formatNumber(s.delivered_kg) }}
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                >
                  {{ formatNumber(s.remaining_kg) }}
                </td>
                <td
                  :class="[cellClass, groupBorder]"
                  dir="ltr"
                >
                  {{ formatMoney(s.purchases_total) }}
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                >
                  {{ formatMoney(s.money_paid) }}
                </td>
                <td
                  :class="[cellClass, signedClass(s.money_due)]"
                  dir="ltr"
                >
                  {{ formatMoney(s.money_due) }}
                </td>
                <td
                  :class="[cellClass, groupBorder]"
                  dir="ltr"
                >
                  {{ formatMoney(s.avg_price_per_ardab) }}
                </td>
                <td
                  :class="[cellClass, groupBorder]"
                  dir="ltr"
                >
                  {{ formatMoney(s.nolon_total) }}
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                >
                  {{ formatMoney(s.nathriyat_total) }}
                </td>
                <td
                  :class="[cellClass, groupBorder]"
                  dir="ltr"
                >
                  {{ formatMoney(s.nolon_paid) }}
                </td>
                <td
                  :class="[cellClass, signedClass(s.nolon_remaining)]"
                  dir="ltr"
                >
                  {{ formatMoney(s.nolon_remaining) }}
                </td>
                <td :class="[stickyActions, 'p-2.5']">
                  <UButton
                    size="sm"
                    variant="ghost"
                    icon="i-lucide-eye"
                    :to="supplierDetailTo(s)"
                  />
                </td>
              </tr>

              <tr
                v-if="!supplierRows.length"
                class="border-t border-default"
              >
                <td
                  colspan="14"
                  class="p-8 text-center text-muted"
                >
                  لا يوجد موردون مطابقون
                </td>
              </tr>

              <tr
                v-else
                class="border-t-2 border-default bg-elevated/40 font-semibold"
              >
                <td class="sticky start-0 z-10 whitespace-nowrap bg-elevated/40 p-2.5 text-start">
                  الإجمالي
                </td>
                <td
                  :class="[cellClass, groupBorder]"
                  dir="ltr"
                >
                  {{ formatNumber(supplierTotals.purchased_kg) }}
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                >
                  {{ formatNumber(supplierTotals.ardab_total) }}
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                >
                  {{ formatNumber(supplierTotals.delivered_kg) }}
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                >
                  {{ formatNumber(supplierTotals.remaining_kg) }}
                </td>
                <td
                  :class="[cellClass, groupBorder]"
                  dir="ltr"
                >
                  {{ formatMoney(supplierTotals.purchases_total) }}
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                >
                  {{ formatMoney(supplierTotals.money_paid) }}
                </td>
                <td
                  :class="[cellClass, signedClass(supplierTotals.money_due)]"
                  dir="ltr"
                >
                  {{ formatMoney(supplierTotals.money_due) }}
                </td>
                <td
                  :class="[cellClass, groupBorder]"
                  dir="ltr"
                >
                  {{ formatMoney(supplierTotals.avg_price_per_ardab) }}
                </td>
                <td
                  :class="[cellClass, groupBorder]"
                  dir="ltr"
                >
                  {{ formatMoney(supplierTotals.nolon_total) }}
                </td>
                <td
                  :class="cellClass"
                  dir="ltr"
                >
                  {{ formatMoney(supplierTotals.nathriyat_total) }}
                </td>
                <td
                  :class="[cellClass, groupBorder]"
                  dir="ltr"
                >
                  {{ formatMoney(supplierTotals.nolon_paid) }}
                </td>
                <td
                  :class="[cellClass, signedClass(supplierTotals.nolon_remaining)]"
                  dir="ltr"
                >
                  {{ formatMoney(supplierTotals.nolon_remaining) }}
                </td>
                <td :class="[stickyActions, 'p-2.5']" />
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
    </div>
  </div>
</template>
