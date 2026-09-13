<script setup lang="ts">
import { formatMoney, formatNumber, signedTone } from '~/utils/formatNumber'
import { supplierAccountTypeLabel } from '~/utils/supplierAccountType'

const props = defineProps<{
  supplierId: string
}>()

const {
  loading,
  saving,
  supplier,
  activeSeason,
  purchases,
  transfers,
  deliveries,
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
  transferKindOptions,
  supplierAccountTypeOptions,
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

const cellInputUi = { base: 'px-1.5 py-1 text-sm rounded-sm tabular-nums text-end' }
/** Shared body row height so empty pads match data rows */
const ledgerRowClass = 'h-12'
/** Panel title bar (المشتريات / التحويلات / التسليمات) */
const ledgerPanelHeaderClass =
  'flex h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b border-default bg-elevated/80 px-3'
/** Table column header cells — same height across all three ledgers */
const ledgerThClass = 'h-10 p-2 font-medium align-middle'
/** Compact padding for supplier header stats cards (override Card default p-4 sm:p-6) */
const statsCardUi = { body: 'p-2 sm:p-2.5' }

/** Pad shorter tables with empty rows so all three end on the same line before totals */
const purchaseBodyCount = computed(
  () => purchases.value.length + (isPurchaseCreating.value ? 1 : 0)
)
const transferBodyCount = computed(
  () => transfers.value.length + (isTransferCreating.value ? 1 : 0)
)
const deliveryBodyCount = computed(
  () => deliveries.value.length + (isDeliveryCreating.value ? 1 : 0)
)
const ledgerRowTarget = computed(() =>
  Math.max(purchaseBodyCount.value, transferBodyCount.value, deliveryBodyCount.value, 0)
)
const purchasePadRows = computed(() =>
  Math.max(0, ledgerRowTarget.value - purchaseBodyCount.value)
)
const transferPadRows = computed(() =>
  Math.max(0, ledgerRowTarget.value - transferBodyCount.value)
)
const deliveryPadRows = computed(() =>
  Math.max(0, ledgerRowTarget.value - deliveryBodyCount.value)
)

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
  <div class="space-y-4 py-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
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
            <h2 class="text-xl font-semibold text-highlighted truncate">
              {{ supplier?.name || 'كشف المورد' }}
            </h2>
            <UBadge
              v-if="supplier"
              variant="subtle"
              size="sm"
              color="neutral"
            >
              {{ supplierAccountTypeLabel(supplier.account_type) }}
            </UBadge>
          </div>
          <p v-if="supplier?.notes" class="text-muted text-sm mt-0.5 truncate">
            {{ supplier.notes }}
          </p>
        </div>
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
      <div v-if="!activeSeason" class="rounded-lg bg-elevated/60 p-3 text-muted text-center text-sm">
        لا يوجد موسم نشط — فعّل موسماً من شاشة المواسم أولاً.
      </div>

      <div
        v-if="activeSeason"
        class="overflow-x-auto tabular-nums py-2"
      >
        <div class="flex flex-nowrap items-stretch gap-x-6">
          <!-- Group 1: quantities -->
          <div class="flex flex-nowrap items-stretch gap-1.5 shrink-0">
            <UCard class="min-w-28" :ui="statsCardUi">
              <p class="text-xs font-medium text-muted">
                كجم
              </p>
              <p class="mt-0.5 text-base font-semibold tracking-tight text-highlighted" dir="ltr">
                {{ formatNumber(supplierDetailStats.kg) }}
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

          <!-- Group 2: prices -->
          <div class="flex flex-nowrap items-stretch gap-1.5 shrink-0">
            <UCard class="min-w-32" :ui="statsCardUi">
              <p class="text-xs font-medium text-muted">
                متوسط الأردب
              </p>
              <p
                class="mt-0.5 text-base font-semibold tracking-tight text-highlighted"
                dir="ltr"
                title="التكلفة ÷ أردب"
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

          <!-- Group 3: money + cost -->
          <div class="flex flex-nowrap items-stretch gap-1.5 shrink-0">
            <UCard class="min-w-36" :ui="statsCardUi">
              <p class="text-xs font-medium text-muted">
                التكلفة
              </p>
              <p
                class="mt-0.5 text-base font-semibold tracking-tight text-highlighted"
                dir="ltr"
                title="مشتريات + نولون + نثريات + عموله"
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

      <!-- Excel-style ledger: scroll sideways across sections -->
      <div
        v-if="activeSeason"
        class="overflow-x-auto overscroll-x-contain rounded-lg border border-default bg-default"
      >
          <div class="flex min-w-max items-start divide-x divide-default rtl:divide-x-reverse">
          <!-- Purchases panel -->
          <section class="w-max max-w-none shrink-0 flex flex-col">
            <div :class="ledgerPanelHeaderClass">
              <UButton
                icon="i-lucide-plus"
                size="xs"
                square
                aria-label="إضافة شراء"
                :disabled="!activeSeason || isPurchaseCreating"
                @click="openPurchaseCreate"
              />
              <div class="flex items-center gap-2">
                <p class="text-sm font-semibold text-highlighted">
                  المشتريات
                </p>
                <UBadge size="sm" variant="subtle" color="neutral">
                  {{ purchases.length }}
                </UBadge>
              </div>
            </div>
            <div class="max-h-[min(70vh,36rem)] overflow-auto">
              <table dir="rtl" class="w-max text-sm text-center whitespace-nowrap tabular-nums">
                <thead class="sticky top-0 z-1 bg-elevated text-muted shadow-sm">
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

                  <template v-for="row in purchases" :key="row.id">
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

                  <tr
                    v-for="n in purchasePadRows"
                    :key="`purchase-pad-${n}`"
                    :class="['border-t border-default/60', ledgerRowClass]"
                  >
                    <td class="p-2 align-middle">&nbsp;</td>
                    <td class="p-2 align-middle" />
                    <td class="p-2 align-middle" />
                    <td class="p-2 align-middle" />
                    <td class="p-2 align-middle" />
                    <td class="p-2 align-middle" />
                    <td class="p-2 align-middle" />
                  </tr>

                  <tr v-if="!purchases.length && !isPurchaseCreating && !purchasePadRows">
                    <td colspan="7" class="p-6 text-center text-muted">
                      لا توجد مشتريات — اضغط +
                    </td>
                  </tr>

                  <tr class="border-t-2 border-default bg-elevated font-semibold">
                    <td class="p-2 text-muted">
                      الإجمالي
                    </td>
                    <td class="p-2 tabular-nums text-end" dir="ltr">
                      {{ formatNumber(purchaseTotals.kg) }}
                    </td>
                    <td class="p-2 tabular-nums text-end" dir="ltr">
                      {{ formatNumber(purchaseTotals.ardab) }}
                    </td>
                    <td class="p-2" />
                    <td class="p-2 tabular-nums text-end" dir="ltr" title="متوسط السعر الكلي">
                      {{ formatMoney(purchaseTotals.avgPrice) }}
                    </td>
                    <td class="p-2 tabular-nums text-end" dir="ltr">
                      {{ formatMoney(purchaseTotals.price) }}
                    </td>
                    <td class="p-2" />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- Transfers / payments panel -->
          <section class="w-max max-w-none shrink-0 flex flex-col">
            <div :class="ledgerPanelHeaderClass">
              <UButton
                icon="i-lucide-plus"
                size="xs"
                square
                aria-label="إضافة تحويل"
                :disabled="!activeSeason || !canAddTransfer || isTransferCreating"
                @click="openTransferCreate"
              />
              <div class="flex items-center gap-2">
                <p class="text-sm font-semibold text-highlighted">
                  التحويلات
                </p>
                <UBadge size="sm" variant="subtle" color="neutral">
                  {{ transfers.length }}
                </UBadge>
              </div>
            </div>
            <div class="max-h-[min(70vh,36rem)] overflow-auto">
              <table dir="rtl" class="w-max text-sm text-center whitespace-nowrap tabular-nums">
                <thead class="sticky top-0 z-1 bg-elevated text-muted shadow-sm">
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
                    <th :class="ledgerThClass">
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

                  <template v-for="row in transfers" :key="row.id">
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
                      <td class="p-2 align-middle text-muted" :title="row.notes || ''">
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

                  <tr
                    v-for="n in transferPadRows"
                    :key="`transfer-pad-${n}`"
                    :class="['border-t border-default/60', ledgerRowClass]"
                  >
                    <td class="p-2 align-middle">&nbsp;</td>
                    <td class="p-2 align-middle" />
                    <td class="p-2 align-middle" />
                    <td class="p-2 align-middle" />
                    <td class="p-2 align-middle" />
                  </tr>

                  <tr v-if="!transfers.length && !isTransferCreating && !transferPadRows">
                    <td colspan="5" class="p-6 text-center text-muted">
                      لا توجد تحويلات
                    </td>
                  </tr>

                  <tr class="border-t-2 border-default bg-elevated font-semibold">
                    <td class="p-2 text-muted">
                      الإجمالي
                    </td>
                    <td class="p-2 text-muted">
                      {{ transferTotals.count }}
                    </td>
                    <td class="p-2 tabular-nums text-end" dir="ltr">
                      {{ formatMoney(transferTotals.amount) }}
                    </td>
                    <td class="p-2" />
                    <td class="p-2" />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- Deliveries panel -->
          <section class="w-max max-w-none shrink-0 flex flex-col">
            <div :class="ledgerPanelHeaderClass">
              <UButton
                icon="i-lucide-plus"
                size="xs"
                square
                aria-label="إضافة تسليم"
                :disabled="!activeSeason || !canAddDelivery || isDeliveryCreating"
                @click="openDeliveryCreate"
              />
              <div class="flex items-center gap-2">
                <p class="text-sm font-semibold text-highlighted">
                  التسليمات
                </p>
                <UBadge size="sm" variant="subtle" color="neutral">
                  {{ deliveries.length }}
                </UBadge>
              </div>
            </div>
            <div class="max-h-[min(70vh,36rem)] overflow-auto">
              <table dir="rtl" class="w-max text-sm text-center whitespace-nowrap tabular-nums">
                <thead class="sticky top-0 z-1 bg-elevated text-muted shadow-sm">
                  <tr>
                    <th :class="ledgerThClass" />
                    <th :class="ledgerThClass">
                      التاريخ
                    </th>
                    <th :class="ledgerThClass">
                      الشونة
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
                    <td class="p-1" />
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
                        v-model="deliveryForm.warehouse_id"
                        :items="warehouseOptions"
                        value-key="value"
                        label-key="label"
                        size="sm"
                        class="w-32"
                      />
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

                  <template v-for="row in deliveries" :key="row.id">
                    <tr
                      v-if="isDeliveryRowEditing(row)"
                      class="border-t border-primary/30 bg-primary/5"
                      @keydown="onDeliveryKey"
                    >
                      <td class="p-1" />
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
                          v-model="deliveryForm.warehouse_id"
                          :items="warehouseOptions"
                          value-key="value"
                          label-key="label"
                          size="sm"
                          class="w-32"
                        />
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
                        <td class="p-1 align-middle" />
                        <td class="p-2 align-middle tabular-nums text-end" dir="ltr">
                          {{ row.delivery_date }}
                        </td>
                        <td class="p-2 align-middle">
                          {{ row.warehouses?.name || '—' }}
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

                  <tr
                    v-for="n in deliveryPadRows"
                    :key="`delivery-pad-${n}`"
                    :class="['border-t border-default/60', ledgerRowClass]"
                  >
                    <td class="p-2 align-middle">&nbsp;</td>
                    <td class="p-2 align-middle" />
                    <td class="p-2 align-middle" />
                    <td class="p-2 align-middle" />
                    <td class="p-2 align-middle" />
                    <td class="p-2 align-middle" />
                    <td class="p-2 align-middle" />
                    <td class="p-2 align-middle" />
                    <td class="p-2 align-middle" />
                    <td class="p-2 align-middle" />
                    <td class="p-2 align-middle" />
                    <td class="p-2 align-middle" />
                    <td class="p-2 align-middle" />
                  </tr>

                  <tr v-if="!deliveries.length && !isDeliveryCreating && !deliveryPadRows">
                    <td colspan="13" class="p-6 text-center text-muted">
                      لا توجد تسليمات
                    </td>
                  </tr>

                  <tr class="border-t-2 border-default bg-elevated font-semibold">
                    <td class="p-2" />
                    <td class="p-2 text-muted">
                      الإجمالي
                    </td>
                    <td class="p-2" />
                    <td class="p-2" />
                    <td class="p-2 tabular-nums text-end" dir="ltr">
                      {{ formatNumber(deliveryTotals.kg) }}
                    </td>
                    <td
                      class="p-2 tabular-nums text-end"
                      dir="ltr"
                      title="المتبقي من كجم المشتريات بعد كل التسليمات"
                    >
                      {{ formatNumber(deliveryKgRemainingFinal) }}
                    </td>
                    <td class="p-2 tabular-nums text-end" dir="ltr">
                      {{ formatMoney(deliveryTotals.nolon) }}
                    </td>
                    <td class="p-2 tabular-nums text-end" dir="ltr">
                      {{ formatMoney(deliveryTotals.nathriyat) }}
                    </td>
                    <td class="p-2 tabular-nums text-end" dir="ltr">
                      {{ formatMoney(deliveryTotals.costTotal) }}
                    </td>
                    <td class="p-2 tabular-nums text-end" dir="ltr">
                      {{ formatMoney(deliveryTotals.costPaid) }}
                    </td>
                    <td class="p-2">
                      <UBadge size="sm" :color="signedTone(deliveryTotals.costNeeded)" variant="subtle">
                        <span dir="ltr">{{ formatMoney(deliveryTotals.costNeeded) }}</span>
                      </UBadge>
                    </td>
                    <td class="p-2" />
                    <td class="p-2" />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
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
            <USelect
              v-model="supplierEditForm.account_type"
              :items="supplierAccountTypeOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
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
