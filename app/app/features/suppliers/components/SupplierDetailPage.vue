<script setup lang="ts">
import { formatMoney, formatNumber, signedTone } from '~/utils/formatNumber'
import { accountTypeLabel } from '~/utils/accountType'

const props = defineProps<{
  supplierId: string
}>()

const {
  loading,
  saving,
  supplier,
  activeSeason,
  filteredPurchases,
  filteredTransfers,
  filteredDeliveries,
  selectedProductId,
  selectedProductName,
  selectedProductRemainingKg,
  onSelectedProductChange,
  isPurchaseCreating,
  isTransferCreating,
  isDeliveryCreating,
  supplierEditModalOpen,
  purchaseForm,
  transferForm,
  deliveryForm,
  supplierEditForm,
  supplierDetailStats,
  purchaseTotals,
  purchaseRunningAvgOf,
  computedPurchaseRunningAvg,
  transferTotals,
  deliveryTotals,
  deliveryKgRunningOf,
  deliveryCreateKgRunning,
  deliveryKgRemainingFinal,
  deliveryMaxKgAllowed,
  canAddTransfer,
  canAddDelivery,
  paymentModalOpen,
  paymentDelivery,
  paymentKind,
  paymentForm,
  paymentRemaining,
  computedPurchaseArdab,
  computedPurchaseTotal,
  warehouseOptions,
  storeOptions,
  deliveryDestinationOptions,
  productOptions,
  sectionOptions,
  onDeliveryWarehouseChange,
  onDeliveryDestinationChange,
  transferKindOptions,
  transferKindLabel,
  deliveryCostKindLabel,
  nolonRestOf,
  nathriyatRestOf,
  deliveryCostBundleOf,
  deliveryFormCostBundle,
  paymentsOf,
  openDeliveryPay,
  saveDeliveryPayment,
  softDeleteDeliveryPayment,
  openPurchaseCreate,
  openPurchaseEdit,
  cancelPurchaseInline,
  isPurchaseRowEditing,
  openTransferCreate,
  openTransferEdit,
  cancelTransferInline,
  isTransferRowEditing,
  openDeliveryCreate,
  openDeliveryEdit,
  cancelDeliveryInline,
  isDeliveryRowEditing,
  openSupplierEdit,
  saveSupplierEdit,
  savePurchase,
  saveTransfer,
  saveDelivery,
  softDeletePurchase,
  softDeleteTransfer,
  softDeleteDelivery,
  setPurchaseDecimal,
  setTransferDecimal,
  setDeliveryDecimal,
  setPaymentDecimal,
  nolonManualOverride,
  nolonRatePerTon
} = useSupplierDetail(() => props.supplierId)

const cellInputUi = { base: 'px-1.5 py-1.5 text-base rounded-sm tabular-nums text-end' }
/** Shared body row height so empty pads match data rows */
const ledgerRowClass = 'h-14'
/** Panel title bar (المشتريات / التحويلات / التسليمات) */
const ledgerPanelHeaderClass =
  'flex h-12 shrink-0 items-center gap-2.5 whitespace-nowrap border-b border-default bg-gradient-to-b from-elevated to-elevated/70 px-3.5'
/** Outer frame for each of the three ledger tables */
const ledgerPanelClass =
  'flex h-full min-h-0 w-max shrink-0 flex-col overflow-hidden border-e-2 border-default bg-default last:border-e-0'
/** Title text inside each ledger panel */
const ledgerPanelTitleClass =
  'text-[0.95rem] font-semibold tracking-wide text-highlighted'
/** Scroll areas (vertical panels + horizontal ledger strip) */
const ledgerScrollClass = 'homos-scroll'
/** Shared table typography for all three ledgers */
const ledgerTableClass =
  'h-full w-max border-collapse text-base text-center whitespace-nowrap tabular-nums'
/** Table column header cells — same height across all three ledgers */
const ledgerThClass =
  'h-11 border-e border-default/50 p-2.5 text-base font-medium align-middle last:border-e-0'
/** Notes / البيان — wrap inside cell so table border expands around content */
const ledgerNotesTdClass =
  'max-w-[12rem] p-2 align-middle text-start text-muted whitespace-normal break-words'
const ledgerNotesThClass =
  'h-11 max-w-[12rem] border-e border-default/50 p-2.5 text-base font-medium align-middle last:border-e-0'
/** Empty grid cells that fill leftover height above totals */
const ledgerFillTdClass =
  'h-full min-h-12 border-t border-e border-default/40 bg-elevated/20 p-0 last:border-e-0'
/** Totals cells — same columns as body, frozen at bottom */
const ledgerTotalTdClass =
  'border-t-2 border-e border-default bg-elevated p-2.5 text-base last:border-e-0'
/** Compact padding for supplier header stats cards (override Card default p-4 sm:p-6) */
const statsCardUi = { body: 'p-2 sm:p-2.5' }

const onPurchaseKey = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    void savePurchase()
  } else if (e.key === 'Escape') {
    cancelPurchaseInline()
  }
}

const onTransferKey = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    void saveTransfer()
  } else if (e.key === 'Escape') {
    cancelTransferInline()
  }
}

const onDeliveryKey = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    void saveDelivery()
  } else if (e.key === 'Escape') {
    cancelDeliveryInline()
  }
}
</script>

<template>
  <div class="flex h-[calc(100dvh-3.5rem-3rem)] min-h-0 flex-col gap-4">
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2">
        <UButton
          to="/suppliers"
          variant="ghost"
          color="neutral"
          icon="i-lucide-arrow-right"
          size="sm"
          aria-label="رجوع"
        />
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="truncate text-2xl font-semibold tracking-tight text-highlighted">
              {{ supplier?.name || 'كشف المورد' }}
            </h2>
            <UBadge
              v-if="supplier"
              variant="subtle"
              size="sm"
              color="warning"
            >
              {{ accountTypeLabel(supplier.account_type_name) }}
            </UBadge>
          </div>
          <p v-if="supplier?.notes" class="mt-1 truncate text-sm text-muted">
            {{ supplier.notes }}
          </p>
        </div>
      </div>

      <div
        v-if="supplier && activeSeason"
        class="flex flex-wrap items-center gap-2"
      >
        <USelect
          v-model="selectedProductId"
          :items="productOptions"
          value-key="value"
          label-key="label"
          class="w-48"
          placeholder="اختر الصنف"
          @update:model-value="onSelectedProductChange"
        />
        <p class="text-sm text-muted tabular-nums whitespace-nowrap" dir="ltr">
          متبقي:
          <span class="font-medium text-highlighted">{{ formatNumber(selectedProductRemainingKg) }}</span>
          كجم
        </p>
      </div>

      <UButton
        v-if="supplier"
        icon="i-lucide-pencil"
        variant="outline"
        color="neutral"
        size="sm"
        @click="openSupplierEdit"
      >
        تعديل
      </UButton>
    </div>

    <div v-if="loading">
      <SupplierDetailSkeleton />
    </div>

    <template v-else-if="!supplier">
      <UCard>
        <p class="text-center text-muted py-6">
          المورد غير موجود
        </p>
      </UCard>
    </template>

    <template v-else>
      <div class="flex min-h-0 flex-1 flex-col gap-4">
      <div v-if="!activeSeason" class="shrink-0 rounded-lg bg-elevated/60 p-3 text-muted text-center text-sm">
        لا يوجد موسم نشط — فعّل موسماً من شاشة المواسم أولاً.
      </div>

      <div
        v-if="activeSeason"
        class="shrink-0 overflow-x-auto tabular-nums py-1"
      >
        <div class="flex flex-nowrap items-stretch gap-x-6">
          <!-- Group 1: quantities (per product) -->
          <div class="flex flex-nowrap items-stretch gap-1.5 shrink-0">
            <UCard class="min-w-28" :ui="statsCardUi">
              <p class="text-xs font-medium text-muted">
                كجم
              </p>
              <p class="mt-0.5 text-base font-semibold tracking-tight text-highlighted" dir="ltr">
                {{ formatNumber(supplierDetailStats.kg) }}
              </p>
              <p
                v-if="selectedProductName !== '—'"
                class="mt-0.5 max-w-28 truncate text-[0.7rem] text-muted"
              >
                {{ selectedProductName }}
              </p>
            </UCard>
            <UCard class="min-w-28" :ui="statsCardUi">
              <p class="text-xs font-medium text-muted">
                أردب
              </p>
              <p class="mt-0.5 text-base font-semibold tracking-tight text-highlighted" dir="ltr">
                {{ formatNumber(supplierDetailStats.ardab) }}
              </p>
            </UCard>
          </div>

          <!-- Group 2: prices (per product) -->
          <div class="flex flex-nowrap items-stretch gap-1.5 shrink-0">
            <UCard class="min-w-32" :ui="statsCardUi">
              <p class="text-xs font-medium text-muted">
                متوسط الأردب
              </p>
              <p
                class="mt-0.5 text-base font-semibold tracking-tight text-highlighted"
                dir="ltr"
                title="(مشتريات + نولون + نثريات) ÷ أردب لهذا الصنف"
              >
                {{ formatMoney(supplierDetailStats.avgPrice) }}
              </p>
            </UCard>
            <UCard class="min-w-28" :ui="statsCardUi">
              <p class="text-xs font-medium text-muted">
                آخر سعر
              </p>
              <p class="mt-0.5 text-base font-semibold tracking-tight text-highlighted" dir="ltr">
                {{ formatMoney(supplierDetailStats.lastPrice) }}
              </p>
            </UCard>
          </div>

          <!-- Group 3: money + cost (supplier-wide except التكلفة) -->
          <div class="flex flex-nowrap items-stretch gap-1.5 shrink-0">
            <UCard class="min-w-36" :ui="statsCardUi">
              <p class="text-xs font-medium text-muted">
                التكلفة
              </p>
              <p
                class="mt-0.5 text-base font-semibold tracking-tight text-highlighted"
                dir="ltr"
                title="مشتريات + نولون + نثريات لهذا الصنف"
              >
                {{ formatMoney(supplierDetailStats.costTotal) }}
              </p>
            </UCard>
            <UCard class="min-w-32" :ui="statsCardUi">
              <p class="text-xs font-medium text-muted">
                إجمالي المدفوع
              </p>
              <p class="mt-0.5 text-base font-semibold tracking-tight text-highlighted" dir="ltr">
                {{ formatMoney(supplierDetailStats.paidTotal) }}
              </p>
            </UCard>
            <UCard class="min-w-32" :ui="statsCardUi">
              <p class="text-xs font-medium text-muted">
                مستحق المورد
              </p>
              <div class="mt-0.5">
                <UBadge size="md" :color="signedTone(supplierDetailStats.supplierDue)" variant="subtle">
                  <span dir="ltr">{{ formatMoney(supplierDetailStats.supplierDue) }}</span>
                </UBadge>
              </div>
            </UCard>
            <UCard class="min-w-36" :ui="statsCardUi">
              <p class="text-xs font-medium text-muted">
                مستحق نولون/نثريات
              </p>
              <div class="mt-0.5">
                <UBadge size="md" :color="signedTone(supplierDetailStats.deliveryCostsDue)" variant="subtle">
                  <span dir="ltr">{{ formatMoney(supplierDetailStats.deliveryCostsDue) }}</span>
                </UBadge>
              </div>
            </UCard>
            <UCard class="min-w-36" :ui="statsCardUi">
              <p class="text-xs font-medium text-muted">
                الإجمالي المستحق
              </p>
              <div class="mt-0.5">
                <UBadge size="md" :color="signedTone(supplierDetailStats.grandDue)" variant="subtle">
                  <span dir="ltr">{{ formatMoney(supplierDetailStats.grandDue) }}</span>
                </UBadge>
              </div>
            </UCard>
          </div>
        </div>
      </div>

      <!-- Excel-style ledger: fill remaining height; scroll Y per panel, X across panels -->
      <div
        v-if="activeSeason"
        class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border-2 border-default bg-default"
      >
        <div :class="['flex min-h-0 flex-1 overflow-x-auto overscroll-x-contain', ledgerScrollClass]">
          <div class="flex h-full min-h-0 w-max min-w-full items-stretch">
          <!-- Purchases panel -->
          <section :class="ledgerPanelClass">
            <div :class="ledgerPanelHeaderClass">
              <UButton
                icon="i-lucide-plus"
                size="xs"
                square
                aria-label="إضافة شراء"
                :disabled="!activeSeason || isPurchaseCreating"
                @click="openPurchaseCreate"
              />
              <div class="flex min-w-0 items-center gap-2">
                <span class="h-4 w-1 shrink-0 rounded-full bg-warning" />
                <p :class="ledgerPanelTitleClass">
                  المشتريات
                </p>
                <UBadge size="sm" variant="subtle" color="warning">
                  {{ filteredPurchases.length }}
                </UBadge>
              </div>
            </div>
            <div :class="['min-h-0 flex-1 overflow-y-auto overflow-x-hidden', ledgerScrollClass]">
              <table dir="rtl" :class="ledgerTableClass">
                <thead class="sticky top-0 z-[2] bg-elevated text-muted shadow-sm">
                  <tr>
                    <th :class="ledgerThClass">
                      التاريخ
                    </th>
                    <th :class="ledgerThClass">
                      كجم
                    </th>
                    <th :class="ledgerThClass">
                      أردب
                    </th>
                    <th :class="ledgerThClass">
                      سعر
                    </th>
                    <th :class="ledgerThClass">
                      متوسط
                    </th>
                    <th :class="ledgerThClass">
                      الإجمالي
                    </th>
                    <th :class="ledgerThClass" />
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-if="isPurchaseCreating"
                    class="border-t border-primary/30 bg-primary/5"
                    @keydown="onPurchaseKey"
                  >
                    <td class="p-1">
                      <UInput
                        v-model="purchaseForm.purchase_date"
                        type="date"
                        size="sm"
                        class="w-34"
                        dir="ltr"
                        :ui="cellInputUi"
                      />
                    </td>
                    <td class="p-1">
                      <DecimalInput
                        class="w-24"
                        :model-value="purchaseForm.quantity_kg"
                        placeholder="كجم"
                        @update:model-value="setPurchaseDecimal('quantity_kg', $event)"
                      />
                    </td>
                    <td class="p-1.5 text-muted tabular-nums text-end" dir="ltr">
                      {{ formatNumber(computedPurchaseArdab) }}
                    </td>
                    <td class="p-1">
                      <DecimalInput
                        class="w-24"
                        :model-value="purchaseForm.price_per_ardab"
                        placeholder="سعر"
                        @update:model-value="setPurchaseDecimal('price_per_ardab', $event)"
                      />
                    </td>
                    <td class="p-1.5 text-muted tabular-nums text-end" dir="ltr" title="متوسط مرجح بعد هذا الصف">
                      {{ formatMoney(computedPurchaseRunningAvg) }}
                    </td>
                    <td class="p-1.5 font-medium tabular-nums text-end" dir="ltr">
                      {{ formatMoney(computedPurchaseTotal) }}
                    </td>
                    <td class="p-1">
                      <div class="flex justify-center gap-0.5">
                        <UButton
                          size="xs"
                          variant="soft"
                          icon="i-lucide-check"
                          :loading="saving"
                          @click="savePurchase"
                        />
                        <UButton
                          size="xs"
                          variant="ghost"
                          color="neutral"
                          icon="i-lucide-x"
                          :disabled="saving"
                          @click="cancelPurchaseInline"
                        />
                      </div>
                    </td>
                  </tr>

                  <template v-for="row in filteredPurchases" :key="row.id">
                    <tr
                      v-if="isPurchaseRowEditing(row)"
                      class="border-t border-primary/30 bg-primary/5"
                      @keydown="onPurchaseKey"
                    >
                      <td class="p-1">
                        <UInput
                          v-model="purchaseForm.purchase_date"
                          type="date"
                          size="sm"
                          class="w-34"
                          dir="ltr"
                          :ui="cellInputUi"
                        />
                      </td>
                      <td class="p-1">
                        <DecimalInput
                          class="w-24"
                          :model-value="purchaseForm.quantity_kg"
                          @update:model-value="setPurchaseDecimal('quantity_kg', $event)"
                        />
                      </td>
                      <td class="p-1.5 text-muted tabular-nums text-end" dir="ltr">
                        {{ formatNumber(computedPurchaseArdab) }}
                      </td>
                      <td class="p-1">
                        <DecimalInput
                          class="w-24"
                          :model-value="purchaseForm.price_per_ardab"
                          @update:model-value="setPurchaseDecimal('price_per_ardab', $event)"
                        />
                      </td>
                      <td class="p-1.5 text-muted tabular-nums text-end" dir="ltr" title="متوسط مرجح بعد هذا الصف">
                        {{ formatMoney(computedPurchaseRunningAvg) }}
                      </td>
                      <td class="p-1.5 font-medium tabular-nums text-end" dir="ltr">
                        {{ formatMoney(computedPurchaseTotal) }}
                      </td>
                      <td class="p-1">
                        <div class="flex justify-center gap-0.5">
                          <UButton
                            size="xs"
                            variant="soft"
                            icon="i-lucide-check"
                            :loading="saving"
                            @click="savePurchase"
                          />
                          <UButton
                            size="xs"
                            variant="ghost"
                            color="neutral"
                            icon="i-lucide-x"
                            :disabled="saving"
                            @click="cancelPurchaseInline"
                          />
                        </div>
                      </td>
                    </tr>
                    <tr
                      v-else
                      :class="['border-t border-default hover:bg-elevated/40', ledgerRowClass]"
                    >
                      <td class="p-2 align-middle tabular-nums text-end" dir="ltr">
                        {{ row.purchase_date }}
                      </td>
                      <td class="p-2 align-middle tabular-nums text-end" dir="ltr">
                        {{ formatNumber(row.quantity_kg) }}
                      </td>
                      <td class="p-2 align-middle tabular-nums text-end" dir="ltr">
                        {{ formatNumber(row.ardab) }}
                      </td>
                      <td class="p-2 align-middle tabular-nums text-end" dir="ltr">
                        {{ formatMoney(row.price_per_ardab) }}
                      </td>
                      <td class="p-2 align-middle text-muted tabular-nums text-end" dir="ltr" title="متوسط مرجح حتى هذا الشراء">
                        {{ formatMoney(purchaseRunningAvgOf(row.id)) }}
                      </td>
                      <td class="p-2 align-middle tabular-nums text-end" dir="ltr">
                        {{ formatMoney(row.total_price) }}
                      </td>
                      <td class="p-1 align-middle">
                        <div class="flex justify-center gap-0.5">
                          <UButton
                            size="xs"
                            variant="ghost"
                            icon="i-lucide-pencil"
                            @click="openPurchaseEdit(row)"
                          />
                          <UButton
                            size="xs"
                            variant="ghost"
                            color="error"
                            icon="i-lucide-trash-2"
                            :disabled="saving"
                            @click="softDeletePurchase(row)"
                          />
                        </div>
                      </td>
                    </tr>
                  </template>

                  <tr v-if="!filteredPurchases.length && !isPurchaseCreating">
                    <td colspan="7" class="border-t border-default p-6 text-center text-muted">
                      لا توجد مشتريات لهذا الصنف — اضغط +
                    </td>
                  </tr>

                  <!-- Empty bordered grid filling leftover height -->
                  <tr class="h-full" aria-hidden="true">
                    <td
                      v-for="i in 7"
                      :key="`purchase-fill-${i}`"
                      :class="ledgerFillTdClass"
                    />
                  </tr>
                </tbody>
                <tfoot class="sticky bottom-0 z-[2]">
                  <tr class="font-semibold shadow-[0_-4px_12px_-6px_rgba(0,0,0,0.18)] dark:shadow-[0_-4px_12px_-6px_rgba(0,0,0,0.45)]">
                    <td :class="[ledgerTotalTdClass, 'text-muted']">
                      <UTooltip text="صف مجاميع المشتريات لهذا الصنف في الموسم النشط">
                        <span class="cursor-help border-b border-dotted border-muted">الإجمالي</span>
                      </UTooltip>
                    </td>
                    <td :class="[ledgerTotalTdClass, 'tabular-nums text-end']" dir="ltr">
                      <UTooltip text="مجموع كميات المشتريات بالكجم">
                        <span class="cursor-help border-b border-dotted border-muted">
                          {{ formatNumber(purchaseTotals.kg) }}
                        </span>
                      </UTooltip>
                    </td>
                    <td :class="[ledgerTotalTdClass, 'tabular-nums text-end']" dir="ltr">
                      <UTooltip text="مجموع الأردب = كجم ÷ معامل الأردب">
                        <span class="cursor-help border-b border-dotted border-muted">
                          {{ formatNumber(purchaseTotals.ardab) }}
                        </span>
                      </UTooltip>
                    </td>
                    <td :class="ledgerTotalTdClass" />
                    <td :class="[ledgerTotalTdClass, 'tabular-nums text-end']" dir="ltr">
                      <UTooltip text="متوسط سعر الأردب المرجح لمشتريات هذا الصنف">
                        <span class="cursor-help border-b border-dotted border-muted">
                          {{ formatMoney(purchaseTotals.avgPrice) }}
                        </span>
                      </UTooltip>
                    </td>
                    <td :class="[ledgerTotalTdClass, 'tabular-nums text-end']" dir="ltr">
                      <UTooltip text="مجموع قيمة المشتريات بالجنيه">
                        <span class="cursor-help border-b border-dotted border-muted">
                          {{ formatMoney(purchaseTotals.price) }}
                        </span>
                      </UTooltip>
                    </td>
                    <td :class="ledgerTotalTdClass" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <!-- Transfers / payments panel -->
          <section :class="ledgerPanelClass">
            <div :class="ledgerPanelHeaderClass">
              <UButton
                icon="i-lucide-plus"
                size="xs"
                square
                aria-label="إضافة تحويل"
                :disabled="!activeSeason || !canAddTransfer || isTransferCreating"
                @click="openTransferCreate"
              />
              <div class="flex min-w-0 items-center gap-2">
                <span class="h-4 w-1 shrink-0 rounded-full bg-warning" />
                <p :class="ledgerPanelTitleClass">
                  التحويلات
                </p>
                <UBadge size="sm" variant="subtle" color="warning">
                  {{ filteredTransfers.length }}
                </UBadge>
              </div>
            </div>
            <div :class="['min-h-0 flex-1 overflow-y-auto overflow-x-hidden', ledgerScrollClass]">
              <table dir="rtl" :class="ledgerTableClass">
                <thead class="sticky top-0 z-[2] bg-elevated text-muted shadow-sm">
                  <tr>
                    <th :class="ledgerThClass">
                      التاريخ
                    </th>
                    <th :class="ledgerThClass">
                      النوع
                    </th>
                    <th :class="ledgerThClass">
                      المبلغ
                    </th>
                    <th :class="ledgerNotesThClass">
                      البيان
                    </th>
                    <th :class="ledgerThClass" />
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-if="isTransferCreating"
                    class="border-t border-primary/30 bg-primary/5"
                    @keydown="onTransferKey"
                  >
                    <td class="p-1">
                      <UInput
                        v-model="transferForm.transfer_date"
                        type="date"
                        size="sm"
                        class="w-34"
                        dir="ltr"
                        :ui="cellInputUi"
                      />
                    </td>
                    <td class="p-1">
                      <USelect
                        v-model="transferForm.kind"
                        :items="transferKindOptions"
                        value-key="value"
                        label-key="label"
                        size="sm"
                        class="w-28"
                      />
                    </td>
                    <td class="p-1">
                      <DecimalInput
                        class="w-24"
                        :model-value="transferForm.amount"
                        placeholder="مبلغ"
                        @update:model-value="setTransferDecimal('amount', $event)"
                      />
                    </td>
                    <td class="p-1">
                      <UInput
                        v-model="transferForm.notes"
                        size="sm"
                        class="w-32"
                        placeholder="بيان"
                        :ui="cellInputUi"
                      />
                    </td>
                    <td class="p-1">
                      <div class="flex justify-center gap-0.5">
                        <UButton
                          size="xs"
                          variant="soft"
                          icon="i-lucide-check"
                          :loading="saving"
                          @click="saveTransfer"
                        />
                        <UButton
                          size="xs"
                          variant="ghost"
                          color="neutral"
                          icon="i-lucide-x"
                          :disabled="saving"
                          @click="cancelTransferInline"
                        />
                      </div>
                    </td>
                  </tr>

                  <template v-for="row in filteredTransfers" :key="row.id">
                    <tr
                      v-if="isTransferRowEditing(row)"
                      class="border-t border-primary/30 bg-primary/5"
                      @keydown="onTransferKey"
                    >
                      <td class="p-1">
                        <UInput
                          v-model="transferForm.transfer_date"
                          type="date"
                          size="sm"
                          class="w-34"
                          dir="ltr"
                          :ui="cellInputUi"
                        />
                      </td>
                      <td class="p-1">
                        <USelect
                          v-model="transferForm.kind"
                          :items="transferKindOptions"
                          value-key="value"
                          label-key="label"
                          size="sm"
                          class="w-28"
                        />
                      </td>
                      <td class="p-1">
                        <DecimalInput
                          class="w-24"
                          :model-value="transferForm.amount"
                          @update:model-value="setTransferDecimal('amount', $event)"
                        />
                      </td>
                      <td class="p-1">
                        <UInput
                          v-model="transferForm.notes"
                          size="sm"
                          class="w-32"
                          :ui="cellInputUi"
                        />
                      </td>
                      <td class="p-1">
                        <div class="flex justify-center gap-0.5">
                          <UButton
                            size="xs"
                            variant="soft"
                            icon="i-lucide-check"
                            :loading="saving"
                            @click="saveTransfer"
                          />
                          <UButton
                            size="xs"
                            variant="ghost"
                            color="neutral"
                            icon="i-lucide-x"
                            :disabled="saving"
                            @click="cancelTransferInline"
                          />
                        </div>
                      </td>
                    </tr>
                    <tr
                      v-else
                      :class="['border-t border-default hover:bg-elevated/40', ledgerRowClass]"
                    >
                      <td class="p-2 align-middle tabular-nums text-end" dir="ltr">
                        {{ row.transfer_date }}
                      </td>
                      <td class="p-2 align-middle">
                        <UBadge
                          size="sm"
                          :color="row.kind === 'settlement' ? 'warning' : row.kind === 'commission' ? 'success' : 'primary'"
                          variant="subtle"
                        >
                          {{ transferKindLabel(row.kind) }}
                        </UBadge>
                      </td>
                      <td class="p-2 align-middle tabular-nums text-end" dir="ltr">
                        {{ formatMoney(row.amount) }}
                      </td>
                      <td :class="ledgerNotesTdClass" :title="row.notes || ''">
                        {{ row.notes || '—' }}
                      </td>
                      <td class="p-1 align-middle">
                        <div class="flex justify-center gap-0.5">
                          <UButton
                            size="xs"
                            variant="ghost"
                            icon="i-lucide-pencil"
                            @click="openTransferEdit(row)"
                          />
                          <UButton
                            size="xs"
                            variant="ghost"
                            color="error"
                            icon="i-lucide-trash-2"
                            :disabled="saving"
                            @click="softDeleteTransfer(row)"
                          />
                        </div>
                      </td>
                    </tr>
                  </template>

                  <tr v-if="!filteredTransfers.length && !isTransferCreating">
                    <td colspan="5" class="border-t border-default p-6 text-center text-muted">
                      لا توجد تحويلات لهذا الصنف
                    </td>
                  </tr>

                  <tr class="h-full" aria-hidden="true">
                    <td
                      v-for="i in 5"
                      :key="`transfer-fill-${i}`"
                      :class="ledgerFillTdClass"
                    />
                  </tr>
                </tbody>
                <tfoot class="sticky bottom-0 z-[2]">
                  <tr class="font-semibold shadow-[0_-4px_12px_-6px_rgba(0,0,0,0.18)] dark:shadow-[0_-4px_12px_-6px_rgba(0,0,0,0.45)]">
                    <td :class="[ledgerTotalTdClass, 'text-muted']">
                      <UTooltip text="صف مجاميع التحويلات لهذا المورد في الموسم النشط">
                        <span class="cursor-help border-b border-dotted border-muted">الإجمالي</span>
                      </UTooltip>
                    </td>
                    <td :class="[ledgerTotalTdClass, 'text-muted']">
                      <UTooltip text="عدد التحويلات المسجّلة">
                        <span class="cursor-help border-b border-dotted border-muted">
                          {{ transferTotals.count }}
                        </span>
                      </UTooltip>
                    </td>
                    <td :class="[ledgerTotalTdClass, 'tabular-nums text-end']" dir="ltr">
                      <UTooltip text="مجموع مبالغ التحويلات والعمولة بالجنيه">
                        <span class="cursor-help border-b border-dotted border-muted">
                          {{ formatMoney(transferTotals.amount) }}
                        </span>
                      </UTooltip>
                    </td>
                    <td :class="ledgerTotalTdClass" />
                    <td :class="ledgerTotalTdClass" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          <!-- Deliveries panel -->
          <section :class="ledgerPanelClass">
            <div :class="ledgerPanelHeaderClass">
              <UButton
                icon="i-lucide-plus"
                size="xs"
                square
                aria-label="إضافة تسليم"
                :disabled="!activeSeason || !canAddDelivery || isDeliveryCreating"
                @click="openDeliveryCreate"
              />
              <div class="flex min-w-0 items-center gap-2">
                <span class="h-4 w-1 shrink-0 rounded-full bg-warning" />
                <p :class="ledgerPanelTitleClass">
                  التسليمات
                </p>
                <UBadge size="sm" variant="subtle" color="warning">
                  {{ filteredDeliveries.length }}
                </UBadge>
              </div>
            </div>
            <div :class="['min-h-0 flex-1 overflow-y-auto overflow-x-hidden', ledgerScrollClass]">
              <table dir="rtl" :class="ledgerTableClass">
                <thead class="sticky top-0 z-[2] bg-elevated text-muted shadow-sm">
                  <tr>
                    <th :class="ledgerThClass">
                      التاريخ
                    </th>
                    <th :class="ledgerThClass">
                      الوجهة
                    </th>
                    <th :class="ledgerThClass">
                      الموقع
                    </th>
                    <th :class="ledgerThClass">
                      الربع
                    </th>
                    <th :class="ledgerThClass" title="كجم مطلوب قبل هذه النقلة">
                      مطلوب قبل
                    </th>
                    <th :class="ledgerThClass" title="الكمية المستلمة">
                      كجم
                    </th>
                    <th :class="ledgerThClass" title="كجم مطلوب بعد هذه النقلة">
                      مطلوب بعد
                    </th>
                    <th :class="ledgerThClass">
                      نولون
                    </th>
                    <th :class="ledgerThClass">
                      نثريات
                    </th>
                    <th :class="ledgerThClass" title="نولون + نثريات">
                      الإجمالي
                    </th>
                    <th :class="ledgerThClass" title="مدفوع نولون + نثريات">
                      المدفوع
                    </th>
                    <th :class="ledgerThClass" title="المطلوب = الإجمالي − المدفوع">
                      المطلوب
                    </th>
                    <th :class="ledgerThClass">
                      سيارة
                    </th>
                    <th :class="ledgerThClass" />
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-if="isDeliveryCreating"
                    class="border-t border-primary/30 bg-primary/5"
                    @keydown="onDeliveryKey"
                  >
                    <td class="p-1">
                      <UInput
                        v-model="deliveryForm.delivery_date"
                        type="date"
                        size="sm"
                        class="w-34"
                        dir="ltr"
                        :ui="cellInputUi"
                      />
                    </td>
                    <td class="p-1">
                      <USelect
                        v-model="deliveryForm.destination_kind"
                        :items="deliveryDestinationOptions"
                        value-key="value"
                        label-key="label"
                        size="sm"
                        class="w-28"
                        @update:model-value="onDeliveryDestinationChange"
                      />
                    </td>
                    <td class="p-1">
                      <USelect
                        v-if="deliveryForm.destination_kind === 'warehouse'"
                        v-model="deliveryForm.warehouse_id"
                        :items="warehouseOptions"
                        value-key="value"
                        label-key="label"
                        size="sm"
                        class="w-32"
                        @update:model-value="onDeliveryWarehouseChange"
                      />
                      <USelect
                        v-else
                        v-model="deliveryForm.store_id"
                        :items="storeOptions"
                        value-key="value"
                        label-key="label"
                        size="sm"
                        class="w-32"
                        placeholder="المخزن"
                      />
                    </td>
                    <td class="p-1">
                      <USelect
                        v-if="deliveryForm.destination_kind === 'warehouse'"
                        v-model="deliveryForm.section_id"
                        :items="sectionOptions"
                        value-key="value"
                        label-key="label"
                        size="sm"
                        class="w-28"
                        placeholder="الربع"
                      />
                      <span
                        v-else
                        class="text-muted text-xs"
                      >—</span>
                    </td>
                    <td class="p-1.5 tabular-nums text-end" dir="ltr">
                      {{ formatNumber(deliveryCreateKgRunning.before) }}
                    </td>
                    <td class="p-1">
                      <DecimalInput
                        class="w-24"
                        :model-value="deliveryForm.quantity_kg"
                        placeholder="كجم"
                        :title="`الحد الأقصى: ${formatNumber(deliveryMaxKgAllowed)} كجم`"
                        @update:model-value="setDeliveryDecimal('quantity_kg', $event)"
                      />
                    </td>
                    <td class="p-1.5 tabular-nums text-end" dir="ltr">
                      {{ formatNumber(deliveryCreateKgRunning.after) }}
                    </td>
                    <td class="p-1">
                      <DecimalInput
                        class="w-24"
                        :model-value="deliveryForm.nolon_total"
                        :placeholder="`×${nolonRatePerTon}`"
                        :title="nolonManualOverride ? 'معدّل يدوياً' : `تلقائي: طن × ${nolonRatePerTon} (يمكن التعديل)`"
                        @update:model-value="setDeliveryDecimal('nolon_total', $event)"
                      />
                    </td>
                    <td class="p-1">
                      <DecimalInput
                        class="w-24"
                        :model-value="deliveryForm.nathriyat_total"
                        placeholder="0"
                        @update:model-value="setDeliveryDecimal('nathriyat_total', $event)"
                      />
                    </td>
                    <td class="p-1.5 tabular-nums text-end" dir="ltr">
                      {{ formatMoney(deliveryFormCostBundle.total) }}
                    </td>
                    <td class="p-1">
                      <div class="flex flex-col gap-0.5">
                        <DecimalInput
                          class="w-24"
                          :model-value="deliveryForm.nolon_paid"
                          placeholder="نولون"
                          title="مدفوع نولون"
                          @update:model-value="setDeliveryDecimal('nolon_paid', $event)"
                        />
                        <DecimalInput
                          class="w-24"
                          :model-value="deliveryForm.nathriyat_paid"
                          placeholder="نثريات"
                          title="مدفوع نثريات"
                          @update:model-value="setDeliveryDecimal('nathriyat_paid', $event)"
                        />
                      </div>
                    </td>
                    <td class="p-1.5">
                      <UBadge size="sm" :color="signedTone(deliveryFormCostBundle.needed)" variant="subtle">
                        <span dir="ltr">{{ formatMoney(deliveryFormCostBundle.needed) }}</span>
                      </UBadge>
                    </td>
                    <td class="p-1">
                      <UInput
                        v-model="deliveryForm.vehicle_number"
                        size="sm"
                        class="w-24"
                        placeholder="—"
                        :ui="cellInputUi"
                      />
                    </td>
                    <td class="p-1">
                      <div class="flex justify-center gap-0.5">
                        <UButton
                          size="xs"
                          variant="soft"
                          icon="i-lucide-check"
                          :loading="saving"
                          @click="saveDelivery"
                        />
                        <UButton
                          size="xs"
                          variant="ghost"
                          color="neutral"
                          icon="i-lucide-x"
                          :disabled="saving"
                          @click="cancelDeliveryInline"
                        />
                      </div>
                    </td>
                  </tr>

                  <template v-for="row in filteredDeliveries" :key="row.id">
                    <tr
                      v-if="isDeliveryRowEditing(row)"
                      class="border-t border-primary/30 bg-primary/5"
                      @keydown="onDeliveryKey"
                    >
                      <td class="p-1">
                        <UInput
                          v-model="deliveryForm.delivery_date"
                          type="date"
                          size="sm"
                          class="w-34"
                          dir="ltr"
                          :ui="cellInputUi"
                        />
                      </td>
                      <td class="p-1">
                        <USelect
                          v-model="deliveryForm.destination_kind"
                          :items="deliveryDestinationOptions"
                          value-key="value"
                          label-key="label"
                          size="sm"
                          class="w-28"
                          @update:model-value="onDeliveryDestinationChange"
                        />
                      </td>
                      <td class="p-1">
                        <USelect
                          v-if="deliveryForm.destination_kind === 'warehouse'"
                          v-model="deliveryForm.warehouse_id"
                          :items="warehouseOptions"
                          value-key="value"
                          label-key="label"
                          size="sm"
                          class="w-32"
                          @update:model-value="onDeliveryWarehouseChange"
                        />
                        <USelect
                          v-else
                          v-model="deliveryForm.store_id"
                          :items="storeOptions"
                          value-key="value"
                          label-key="label"
                          size="sm"
                          class="w-32"
                          placeholder="المخزن"
                        />
                      </td>
                      <td class="p-1">
                        <USelect
                          v-if="deliveryForm.destination_kind === 'warehouse'"
                          v-model="deliveryForm.section_id"
                          :items="sectionOptions"
                          value-key="value"
                          label-key="label"
                          size="sm"
                          class="w-28"
                          placeholder="الربع"
                        />
                        <span
                          v-else
                          class="text-muted text-xs"
                        >—</span>
                      </td>
                      <td class="p-1.5 tabular-nums text-end" dir="ltr">
                        {{ formatNumber(deliveryKgRunningOf(row.id).before) }}
                      </td>
                      <td class="p-1">
                        <DecimalInput
                          class="w-24"
                          :model-value="deliveryForm.quantity_kg"
                          :title="`الحد الأقصى: ${formatNumber(deliveryMaxKgAllowed)} كجم`"
                          @update:model-value="setDeliveryDecimal('quantity_kg', $event)"
                        />
                      </td>
                      <td class="p-1.5 tabular-nums text-end" dir="ltr">
                        {{ formatNumber(deliveryKgRunningOf(row.id).after) }}
                      </td>
                      <td class="p-1">
                        <DecimalInput
                          class="w-24"
                          :model-value="deliveryForm.nolon_total"
                          :placeholder="`×${nolonRatePerTon}`"
                          :title="nolonManualOverride ? 'معدّل يدوياً' : `تلقائي: طن × ${nolonRatePerTon} (يمكن التعديل)`"
                          @update:model-value="setDeliveryDecimal('nolon_total', $event)"
                        />
                      </td>
                      <td class="p-1">
                        <DecimalInput
                          class="w-24"
                          :model-value="deliveryForm.nathriyat_total"
                          @update:model-value="setDeliveryDecimal('nathriyat_total', $event)"
                        />
                      </td>
                      <td class="p-1.5 tabular-nums text-end" dir="ltr">
                        {{ formatMoney(deliveryFormCostBundle.total) }}
                      </td>
                      <td class="p-1">
                        <div class="flex flex-col gap-0.5">
                          <DecimalInput
                            class="w-24"
                            :model-value="deliveryForm.nolon_paid"
                            placeholder="نولون"
                            title="مدفوع نولون"
                            @update:model-value="setDeliveryDecimal('nolon_paid', $event)"
                          />
                          <DecimalInput
                            class="w-24"
                            :model-value="deliveryForm.nathriyat_paid"
                            placeholder="نثريات"
                            title="مدفوع نثريات"
                            @update:model-value="setDeliveryDecimal('nathriyat_paid', $event)"
                          />
                        </div>
                      </td>
                      <td class="p-1.5">
                        <UBadge size="sm" :color="signedTone(deliveryFormCostBundle.needed)" variant="subtle">
                          <span dir="ltr">{{ formatMoney(deliveryFormCostBundle.needed) }}</span>
                        </UBadge>
                      </td>
                      <td class="p-1">
                        <UInput
                          v-model="deliveryForm.vehicle_number"
                          size="sm"
                          class="w-24"
                          :ui="cellInputUi"
                        />
                      </td>
                      <td class="p-1">
                        <div class="flex justify-center gap-0.5">
                          <UButton
                            size="xs"
                            variant="soft"
                            icon="i-lucide-check"
                            :loading="saving"
                            @click="saveDelivery"
                          />
                          <UButton
                            size="xs"
                            variant="ghost"
                            color="neutral"
                            icon="i-lucide-x"
                            :disabled="saving"
                            @click="cancelDeliveryInline"
                          />
                        </div>
                      </td>
                    </tr>
                    <template v-else>
                      <tr :class="['border-t border-default hover:bg-elevated/40', ledgerRowClass]">
                        <td class="p-2 align-middle tabular-nums text-end" dir="ltr">
                          {{ row.delivery_date }}
                        </td>
                        <td class="p-2 align-middle">
                          <UBadge
                            size="sm"
                            variant="subtle"
                            :color="row.destination_kind === 'store' || row.store_id ? 'primary' : 'warning'"
                          >
                            {{ row.destination_kind === 'store' || row.store_id ? 'مخزن' : 'شونة' }}
                          </UBadge>
                        </td>
                        <td class="p-2 align-middle">
                          {{
                            row.destination_kind === 'store' || row.store_id
                              ? (row.stores?.name || '—')
                              : (row.warehouses?.name || '—')
                          }}
                        </td>
                        <td class="p-2 align-middle">
                          {{
                            row.destination_kind === 'store' || row.store_id
                              ? '—'
                              : (row.warehouse_sections?.name || '—')
                          }}
                        </td>
                        <td class="p-2 align-middle tabular-nums text-end" dir="ltr">
                          {{ formatNumber(deliveryKgRunningOf(row.id).before) }}
                        </td>
                        <td class="p-2 align-middle tabular-nums text-end" dir="ltr">
                          {{ formatNumber(row.quantity_kg) }}
                        </td>
                        <td class="p-2 align-middle tabular-nums text-end" dir="ltr">
                          {{ formatNumber(deliveryKgRunningOf(row.id).after) }}
                        </td>
                        <td class="p-2 align-middle tabular-nums text-end" dir="ltr">
                          {{ formatMoney(row.nolon_total) }}
                        </td>
                        <td class="p-2 align-middle tabular-nums text-end" dir="ltr">
                          {{ formatMoney(row.nathriyat_total) }}
                        </td>
                        <td class="p-2 align-middle tabular-nums text-end" dir="ltr">
                          {{ formatMoney(deliveryCostBundleOf(row).total) }}
                        </td>
                        <td class="p-2 align-middle tabular-nums text-end" dir="ltr">
                          {{ formatMoney(deliveryCostBundleOf(row).paid) }}
                        </td>
                        <td class="p-2 align-middle">
                          <UBadge size="sm" :color="signedTone(deliveryCostBundleOf(row).needed)" variant="subtle">
                            <span dir="ltr">{{ formatMoney(deliveryCostBundleOf(row).needed) }}</span>
                          </UBadge>
                        </td>
                        <td class="p-2 align-middle text-muted">
                          {{ row.vehicle_number || '—' }}
                        </td>
                        <td class="p-1 align-middle">
                          <div class="flex flex-nowrap justify-center gap-0.5">
                            <UButton
                              v-if="nolonRestOf(row) > 0"
                              size="xs"
                              variant="soft"
                              @click="openDeliveryPay(row, 'nolon')"
                            >
                              نولون
                            </UButton>
                            <UButton
                              v-if="nathriyatRestOf(row) > 0"
                              size="xs"
                              variant="soft"
                              color="neutral"
                              @click="openDeliveryPay(row, 'nathriyat')"
                            >
                              نثريات
                            </UButton>
                            <UButton
                              size="xs"
                              variant="ghost"
                              icon="i-lucide-pencil"
                              @click="openDeliveryEdit(row)"
                            />
                            <UButton
                              size="xs"
                              variant="ghost"
                              color="error"
                              icon="i-lucide-trash-2"
                              :disabled="saving"
                              @click="softDeleteDelivery(row)"
                            />
                          </div>
                        </td>
                      </tr>
                    </template>
                  </template>

                  <tr v-if="!filteredDeliveries.length && !isDeliveryCreating">
                    <td colspan="14" class="border-t border-default p-6 text-center text-muted">
                      لا توجد تسليمات لهذا الصنف
                    </td>
                  </tr>

                  <tr class="h-full" aria-hidden="true">
                    <td
                      v-for="i in 14"
                      :key="`delivery-fill-${i}`"
                      :class="ledgerFillTdClass"
                    />
                  </tr>
                </tbody>
                <tfoot class="sticky bottom-0 z-[2]">
                  <tr class="font-semibold shadow-[0_-4px_12px_-6px_rgba(0,0,0,0.18)] dark:shadow-[0_-4px_12px_-6px_rgba(0,0,0,0.45)]">
                    <td :class="[ledgerTotalTdClass, 'text-muted']">
                      <UTooltip text="صف مجاميع التسليمات لهذا الصنف في الموسم النشط">
                        <span class="cursor-help border-b border-dotted border-muted">الإجمالي</span>
                      </UTooltip>
                    </td>
                    <td :class="ledgerTotalTdClass" />
                    <td :class="ledgerTotalTdClass" />
                    <td :class="ledgerTotalTdClass" />
                    <td :class="ledgerTotalTdClass" />
                    <td :class="[ledgerTotalTdClass, 'tabular-nums text-end']" dir="ltr">
                      <UTooltip text="مجموع الكميات المستلمة بالكجم">
                        <span class="cursor-help border-b border-dotted border-muted">
                          {{ formatNumber(deliveryTotals.kg) }}
                        </span>
                      </UTooltip>
                    </td>
                    <td :class="[ledgerTotalTdClass, 'tabular-nums text-end']" dir="ltr">
                      <UTooltip text="المتبقي من كجم المشتريات بعد كل التسليمات">
                        <span class="cursor-help border-b border-dotted border-muted">
                          {{ formatNumber(deliveryKgRemainingFinal) }}
                        </span>
                      </UTooltip>
                    </td>
                    <td :class="[ledgerTotalTdClass, 'tabular-nums text-end']" dir="ltr">
                      <UTooltip text="مجموع نولون كل التسليمات">
                        <span class="cursor-help border-b border-dotted border-muted">
                          {{ formatMoney(deliveryTotals.nolon) }}
                        </span>
                      </UTooltip>
                    </td>
                    <td :class="[ledgerTotalTdClass, 'tabular-nums text-end']" dir="ltr">
                      <UTooltip text="مجموع نثريات كل التسليمات">
                        <span class="cursor-help border-b border-dotted border-muted">
                          {{ formatMoney(deliveryTotals.nathriyat) }}
                        </span>
                      </UTooltip>
                    </td>
                    <td :class="[ledgerTotalTdClass, 'tabular-nums text-end']" dir="ltr">
                      <UTooltip text="إجمالي تكاليف التسليم = نولون + نثريات">
                        <span class="cursor-help border-b border-dotted border-muted">
                          {{ formatMoney(deliveryTotals.costTotal) }}
                        </span>
                      </UTooltip>
                    </td>
                    <td :class="[ledgerTotalTdClass, 'tabular-nums text-end']" dir="ltr">
                      <UTooltip text="مجموع المدفوع من نولون ونثريات">
                        <span class="cursor-help border-b border-dotted border-muted">
                          {{ formatMoney(deliveryTotals.costPaid) }}
                        </span>
                      </UTooltip>
                    </td>
                    <td :class="ledgerTotalTdClass">
                      <UTooltip text="المتبقي للدفع = إجمالي التكاليف − المدفوع">
                        <UBadge size="sm" :color="signedTone(deliveryTotals.costNeeded)" variant="subtle" class="cursor-help">
                          <span dir="ltr">{{ formatMoney(deliveryTotals.costNeeded) }}</span>
                        </UBadge>
                      </UTooltip>
                    </td>
                    <td :class="ledgerTotalTdClass" />
                    <td :class="ledgerTotalTdClass" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
          </div>
        </div>
      </div>
      </div>
    </template>

    <UModal v-model:open="supplierEditModalOpen" title="تعديل المورد">
      <template #body>
        <div class="space-y-4">
          <UFormField label="الاسم" required>
            <UInput
              v-model="supplierEditForm.name"
              class="w-full"
              placeholder="مثال: شركة أحمد / استثمار محمود"
            />
          </UFormField>
          <UFormField label="النوع" required>
            <AccountTypeField v-model="supplierEditForm.account_type_id" />
          </UFormField>
          <UFormField label="ملاحظات">
            <UTextarea v-model="supplierEditForm.notes" class="w-full" :rows="3" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="supplierEditModalOpen = false">
            إلغاء
          </UButton>
          <UButton :loading="saving" @click="saveSupplierEdit">
            حفظ
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="paymentModalOpen"
      :title="`دفع ${deliveryCostKindLabel(paymentKind)}`"
    >
      <template #body>
        <div class="space-y-4">
          <div class="rounded-lg bg-elevated/60 px-3 py-2 text-sm flex flex-wrap items-center gap-2">
            <span class="text-muted">الباقي:</span>
            <UBadge size="lg" :color="signedTone(paymentRemaining)" variant="subtle">
              <span dir="ltr">{{ formatMoney(paymentRemaining) }}</span>
            </UBadge>
          </div>
          <UFormField label="التاريخ" required>
            <UInput v-model="paymentForm.payment_date" type="date" class="w-full" dir="ltr" />
          </UFormField>
          <UFormField label="المبلغ" required>
            <DecimalInput
              :model-value="paymentForm.amount"
              placeholder="0"
              suffix="جنيه"
              @update:model-value="setPaymentDecimal"
            />
          </UFormField>
          <UFormField label="البيان">
            <UTextarea v-model="paymentForm.notes" class="w-full" :rows="2" />
          </UFormField>

          <div v-if="paymentDelivery" class="space-y-2 border-t border-default pt-3">
            <p class="text-sm font-medium text-highlighted">
              الدفعات السابقة
            </p>
            <div
              v-if="!paymentsOf(paymentDelivery.id).filter((p) => p.kind === paymentKind).length"
              class="text-sm text-muted"
            >
              لا توجد دفعات بعد
            </div>
            <div
              v-for="pay in paymentsOf(paymentDelivery.id).filter((p) => p.kind === paymentKind)"
              :key="pay.id"
              class="flex items-center justify-between gap-2 rounded-lg bg-elevated/40 px-3 py-2 text-sm"
            >
              <div class="min-w-0">
                <p class="tabular-nums" dir="ltr">
                  {{ formatMoney(pay.amount) }}
                </p>
                <p class="text-muted text-xs" dir="ltr">
                  {{ pay.payment_date }}
                  <span v-if="pay.notes"> — {{ pay.notes }}</span>
                </p>
              </div>
              <UButton
                size="xs"
                variant="ghost"
                color="error"
                icon="i-lucide-trash-2"
                :disabled="saving"
                @click="softDeleteDeliveryPayment(pay)"
              />
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="paymentModalOpen = false">
            إلغاء
          </UButton>
          <UButton :loading="saving" @click="saveDeliveryPayment">
            حفظ الدفعة
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
