<script setup lang="ts">
import { formatMoney, formatNumber, signedTone } from '~/utils/formatNumber'
import { accountTypeLabel } from '~/utils/accountType'
import type { SupplierDelivery } from '../utils/supplierDetailBundle'

const props = defineProps<{
  supplierId: string
  productId: string
}>()

const {
  loading,
  isRefreshing,
  saving,
  supplier,
  activeSeason,
  filteredPurchases,
  filteredTransfers,
  filteredDeliveries,
  selectedProductName,
  selectedProductRemainingKg,
  deliveryInlineOpen,
  editingDelivery,
  supplierEditModalOpen,
  deliveryForm,
  deliveryMaxKgAllowed,
  supplierEditForm,
  supplierDetailStats,
  purchaseRunningAvgOf,
      paymentModalOpen,
  paymentDelivery,
  paymentKind,
  paymentForm,
  paymentRemaining,
  warehouseOptions,
  storeOptions,
  storeSlotOptions,
  deliveryDestinationOptions,
  sectionOptions,
  onDeliveryWarehouseChange,
  onDeliveryStoreChange,
  onDeliveryDestinationChange,
  transferKindOptions,
  transferKindLabel,
  deliveryCostKindLabel,
  nolonPaidOf,
  nolonSupplierPaidOf,
  nolonRestOf,
  nathriyatPaidOf,
  nathriyatSupplierPaidOf,
  nathriyatRestOf,
  paymentsOf,
  openDeliveryPay,
  saveDeliveryPayment,
  softDeleteDeliveryPayment,
  openDeliveryCreate,
  openDeliveryEdit,
  cancelDeliveryInline,
  openSupplierEdit,
  saveSupplierEdit,
  saveDelivery,
  softDeletePurchase,
  softDeleteTransfer,
  softDeleteDelivery,
  commitPurchaseSheet,
  commitTransferSheet,
  commitDeliverySheet,
  purchaseTotals,
  transferTotals,
  deliveryTotals,
  purchaseInlineOpen,
  transferInlineOpen,
  editingPurchase,
  editingTransfer,
  purchaseForm,
  transferForm,
  supplierArdabFactor,
  computedPurchaseArdab,
  computedPurchaseTotal,
  openPurchaseCreate,
  openPurchaseEdit,
  cancelPurchaseInline,
  openTransferCreate,
  openTransferEdit,
  cancelTransferInline,
  savePurchase,
  saveTransfer,
  setPurchaseDecimal,
  setTransferDecimal,
  setDeliveryDecimal,
  setPaymentDecimal
} = useSupplierDetail(
  () => props.supplierId,
  () => props.productId
)

const purchaseModalTitle = computed(() =>
  editingPurchase.value ? 'تعديل شراء' : 'إضافة شراء'
)
const transferModalTitle = computed(() =>
  editingTransfer.value ? 'تعديل تحويل' : 'إضافة تحويل'
)

const deliveryDestinationLabel = (row: SupplierDelivery) => {
  const isStore = row.destination_kind === 'store' || !!row.store_id
  const place = isStore
    ? (row.stores?.name || '—')
    : (row.warehouses?.name || '—')
  const section = !isStore ? (row.warehouse_sections?.name || '') : ''
  const kind = isStore ? 'مخزن' : 'شونة'
  return section ? `${kind}: ${place} / ${section}` : `${kind}: ${place}`
}

const deliveryModalTitle = computed(() =>
  editingDelivery.value ? 'تعديل تسليم' : 'إضافة تسليم'
)
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
          <h2 class="flex min-w-0 items-center gap-2 truncate text-2xl font-semibold tracking-tight text-highlighted">
            <span
              v-if="supplier"
              class="inline-block size-3.5 shrink-0 rounded-full border border-default"
              :style="{ backgroundColor: supplier.color || '#64748b' }"
              :title="supplier.color || '#64748b'"
            />
            <span class="truncate">
              <template v-if="supplier">
                {{ supplier.name }}
                - {{ accountTypeLabel(supplier.account_type_name) }}
                <template v-if="selectedProductName && selectedProductName !== '—'">
                  - {{ selectedProductName }}
                </template>
              </template>
              <template v-else>
                كشف المورد
              </template>
            </span>
          </h2>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          v-if="supplier"
          size="sm"
          variant="outline"
          icon="i-lucide-pencil"
          @click="openSupplierEdit"
        >
          تعديل المورد
        </UButton>
      </div>
    </div>

    <div v-if="loading">
      <SupplierDetailSkeleton />
    </div>

    <template v-else-if="!supplier">
      <UCard>
        <p class="py-6 text-center text-muted">
          المورد غير موجود
        </p>
      </UCard>
    </template>

    <template v-else>
      <div
        class="relative flex min-h-0 flex-1 flex-col transition-opacity duration-200"
        :class="isRefreshing ? 'opacity-50 pointer-events-none' : 'opacity-100'"
        :aria-busy="isRefreshing"
      >
        <div
          v-if="isRefreshing"
          class="pointer-events-none absolute inset-x-0 top-10 z-10 flex justify-center"
        >
          <div class="flex items-center gap-2 rounded-full border border-default bg-default/90 px-3 py-1.5 text-sm text-muted shadow-sm backdrop-blur-sm">
            <UIcon
              name="i-lucide-loader-circle"
              class="size-4 animate-spin text-primary"
            />
            تحديث البيانات…
          </div>
        </div>

        <div
          v-if="!activeSeason"
          class="shrink-0 rounded-lg bg-elevated/60 p-3 text-center text-sm text-muted"
        >
          لا يوجد موسم نشط — فعّل موسماً من شاشة المواسم أولاً.
        </div>

        <ClientOnly v-else>
          <SupplierDetailWorkbook
            :key="supplierId"
            class="min-h-0 flex-1"
            :supplier-id="supplierId"
            :stats="supplierDetailStats"
            :delivered-kg="deliveryTotals.kg"
            :remaining-kg="selectedProductRemainingKg"
            :purchases="filteredPurchases"
            :transfers="filteredTransfers"
            :deliveries="filteredDeliveries"
            :running-avg-of="purchaseRunningAvgOf"
            :transfer-kind-label="transferKindLabel"
            :transfer-kind-options="transferKindOptions"
            :destination-label="deliveryDestinationLabel"
            :nolon-paid-of="nolonPaidOf"
            :nolon-supplier-paid-of="nolonSupplierPaidOf"
            :nolon-rest-of="nolonRestOf"
            :nathriyat-paid-of="nathriyatPaidOf"
            :nathriyat-supplier-paid-of="nathriyatSupplierPaidOf"
            :nathriyat-rest-of="nathriyatRestOf"
            :purchase-totals="purchaseTotals"
            :transfer-totals="transferTotals"
            :delivery-totals="deliveryTotals"
            :commit-purchase-sheet="commitPurchaseSheet"
            :commit-transfer-sheet="commitTransferSheet"
            :commit-delivery-sheet="commitDeliverySheet"
            :soft-delete-purchase="softDeletePurchase"
            :soft-delete-transfer="softDeleteTransfer"
            :soft-delete-delivery="softDeleteDelivery"
            :open-purchase-create="openPurchaseCreate"
            :open-purchase-edit="openPurchaseEdit"
            :open-transfer-create="openTransferCreate"
            :open-transfer-edit="openTransferEdit"
            :open-delivery-edit="openDeliveryEdit"
            :open-delivery-create="openDeliveryCreate"
          />
          <template #fallback>
            <SupplierDetailSkeleton />
          </template>
        </ClientOnly>
            </div>
    </template>

    <UModal
      v-model:open="supplierEditModalOpen"
      title="تعديل المورد"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="الاسم"
            required
          >
                          <UInput
              v-model="supplierEditForm.name"
              class="w-full"
              placeholder="مثال: شركة أحمد / استثمار محمود"
            />
          </UFormField>
          <UFormField
            label="النوع"
            required
          >
            <AccountTypeField v-model="supplierEditForm.account_type_id" />
          </UFormField>
          <UFormField
            label="معامل الأردب (كجم)"
            required
          >
            <DecimalInput
              :model-value="supplierEditForm.ardab_factor"
              class="w-full"
              @update:model-value="supplierEditForm.ardab_factor = $event"
            />
          </UFormField>
          <UFormField label="لون الملف">
            <div class="flex items-center gap-3">
              <input
                v-model="supplierEditForm.color"
                type="color"
                class="size-10 cursor-pointer rounded-md border border-default bg-transparent p-1"
                :title="supplierEditForm.color"
              >
              <UInput
                v-model="supplierEditForm.color"
                class="w-full font-mono uppercase"
                dir="ltr"
                placeholder="#64748B"
                maxlength="7"
              />
            </div>
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            @click="supplierEditModalOpen = false"
          >
            إلغاء
          </UButton>
                            <UButton
                              :loading="saving"
            @click="saveSupplierEdit"
          >
            حفظ
          </UButton>
                          </div>
      </template>
    </UModal>

    <UModal
      :open="purchaseInlineOpen"
      :title="purchaseModalTitle"
      :ui="{ content: 'sm:max-w-3xl' }"
      @update:open="(v: boolean) => { if (!v) cancelPurchaseInline() }"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="التاريخ"
            required
            size="xl"
            :ui="{ label: 'text-lg' }"
          >
            <UInput
              v-model="purchaseForm.purchase_date"
              type="date"
              size="xl"
              class="w-full"
              dir="ltr"
            />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField
              label="كجم"
              required
              size="xl"
              :ui="{ label: 'text-lg' }"
            >
              <DecimalInput
                :model-value="purchaseForm.quantity_kg"
                size="xl"
                @update:model-value="setPurchaseDecimal('quantity_kg', $event)"
              />
            </UFormField>
            <UFormField
              label="سعر الأردب"
              required
              size="xl"
              :ui="{ label: 'text-lg' }"
            >
              <DecimalInput
                :model-value="purchaseForm.price_per_ardab"
                size="xl"
                @update:model-value="setPurchaseDecimal('price_per_ardab', $event)"
              />
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <UFormField
              :label="`أردب (محسوب ÷ ${formatNumber(supplierArdabFactor)})`"
              size="xl"
              :ui="{ label: 'text-lg' }"
            >
              <UInput
                :model-value="formatNumber(computedPurchaseArdab)"
                size="xl"
                class="w-full"
                disabled
                dir="ltr"
              />
            </UFormField>
            <UFormField
              label="الإجمالي (محسوب)"
              size="xl"
              :ui="{ label: 'text-lg' }"
            >
              <UInput
                :model-value="formatMoney(computedPurchaseTotal)"
                size="xl"
                class="w-full"
                disabled
                dir="ltr"
              />
            </UFormField>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
                              <UButton
                                color="neutral"
            variant="outline"
                                @click="cancelPurchaseInline"
          >
            إلغاء
          </UButton>
                              <UButton
            :loading="saving"
            @click="savePurchase"
          >
            حفظ
          </UButton>
                            </div>
                      </template>
    </UModal>

    <UModal
      :open="transferInlineOpen"
      :title="transferModalTitle"
      :ui="{ content: 'sm:max-w-3xl' }"
      @update:open="(v: boolean) => { if (!v) cancelTransferInline() }"
    >
      <template #body>
        <div class="grid grid-cols-3 gap-3">
          <UFormField
            label="التاريخ"
            required
            size="xl"
            :ui="{ label: 'text-lg' }"
          >
            <UInput
              v-model="transferForm.transfer_date"
              type="date"
              size="xl"
              class="w-full"
              dir="ltr"
            />
          </UFormField>
          <UFormField
            label="النوع"
            required
            size="xl"
            :ui="{ label: 'text-lg' }"
          >
            <USelect
              v-model="transferForm.kind"
              :items="transferKindOptions"
              value-key="value"
              label-key="label"
              size="xl"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="المبلغ"
            required
            size="xl"
            :ui="{ label: 'text-lg' }"
          >
            <DecimalInput
              :model-value="transferForm.amount"
              size="xl"
              @update:model-value="setTransferDecimal('amount', $event)"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            @click="cancelTransferInline"
          >
            إلغاء
          </UButton>
          <UButton
            :loading="saving"
            @click="saveTransfer"
          >
            حفظ
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      :open="deliveryInlineOpen"
      :title="deliveryModalTitle"
      :ui="{ content: 'sm:max-w-4xl' }"
      @update:open="(v: boolean) => { if (!v) cancelDeliveryInline() }"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="التاريخ"
            required
            size="xl"
            :ui="{ label: 'text-lg' }"
          >
            <UInput
              v-model="deliveryForm.delivery_date"
              type="date"
              size="xl"
              class="w-full"
              dir="ltr"
            />
          </UFormField>

          <div class="grid grid-cols-3 gap-3">
            <UFormField
              label="الوجهة"
              required
              size="xl"
              :ui="{ label: 'text-lg' }"
            >
              <USelect
                v-model="deliveryForm.destination_kind"
                :items="deliveryDestinationOptions"
                value-key="value"
                label-key="label"
                size="xl"
                class="w-full"
                @update:model-value="onDeliveryDestinationChange"
              />
            </UFormField>
            <UFormField
              v-if="deliveryForm.destination_kind === 'warehouse'"
              label="الشونة"
              required
              size="xl"
              :ui="{ label: 'text-lg' }"
            >
              <USelectMenu
                v-model="deliveryForm.warehouse_id"
                :items="warehouseOptions"
                value-key="value"
                label-key="label"
                size="xl"
                class="w-full"
                @update:model-value="onDeliveryWarehouseChange"
              />
            </UFormField>
            <UFormField
              v-if="deliveryForm.destination_kind === 'warehouse'"
              label="ربع"
              required
              size="xl"
              :ui="{ label: 'text-lg' }"
            >
              <USelectMenu
                v-model="deliveryForm.section_id"
                :items="sectionOptions"
                value-key="value"
                label-key="label"
                size="xl"
                class="w-full"
              />
            </UFormField>
            <UFormField
              v-if="deliveryForm.destination_kind === 'store'"
              label="المخزن"
              required
              size="xl"
              :ui="{ label: 'text-lg' }"
            >
              <USelectMenu
                v-model="deliveryForm.store_id"
                :items="storeOptions"
                value-key="value"
                label-key="label"
                size="xl"
                class="w-full"
                @update:model-value="onDeliveryStoreChange"
              />
            </UFormField>
            <UFormField
              v-if="deliveryForm.destination_kind === 'store'"
              label="خانة"
              required
              size="xl"
              :ui="{ label: 'text-lg' }"
            >
              <USelectMenu
                v-model="deliveryForm.store_slot_id"
                :items="storeSlotOptions"
                value-key="value"
                label-key="label"
                size="xl"
                class="w-full"
                :placeholder="storeSlotOptions.length ? 'اختر الخانة' : 'لا توجد خانات'"
              />
            </UFormField>
          </div>

          <UFormField
            label="كجم"
            required
            size="xl"
            :ui="{ label: 'text-lg' }"
          >
            <DecimalInput
              :model-value="deliveryForm.quantity_kg"
              size="xl"
              :title="`يمكن استلام من المورد: ${formatNumber(deliveryMaxKgAllowed)} كجم`"
              @update:model-value="setDeliveryDecimal('quantity_kg', $event)"
            />
            <p class="mt-1 text-sm text-muted">
              يمكن استلام من المورد:
              <span
                dir="ltr"
                class="font-medium text-highlighted"
              >{{ formatNumber(deliveryMaxKgAllowed) }}</span>
              كجم
            </p>
          </UFormField>

          <div class="grid grid-cols-3 gap-3">
            <UFormField
              label="نولون"
              size="xl"
              :ui="{ label: 'text-lg' }"
            >
              <DecimalInput
                :model-value="deliveryForm.nolon_total"
                size="xl"
                @update:model-value="setDeliveryDecimal('nolon_total', $event)"
              />
            </UFormField>
            <UFormField
              label="مدفوع منا (نولون)"
              size="xl"
              :ui="{ label: 'text-lg' }"
            >
              <DecimalInput
                :model-value="deliveryForm.nolon_paid"
                size="xl"
                @update:model-value="setDeliveryDecimal('nolon_paid', $event)"
              />
            </UFormField>
            <UFormField
              label="نولون طرف المورد"
              size="xl"
              :ui="{ label: 'text-lg' }"
            >
              <DecimalInput
                :model-value="deliveryForm.nolon_supplier_paid"
                size="xl"
                @update:model-value="setDeliveryDecimal('nolon_supplier_paid', $event)"
              />
            </UFormField>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <UFormField
              label="نثريات"
              size="xl"
              :ui="{ label: 'text-lg' }"
            >
              <DecimalInput
                :model-value="deliveryForm.nathriyat_total"
                size="xl"
                @update:model-value="setDeliveryDecimal('nathriyat_total', $event)"
              />
            </UFormField>
            <UFormField
              label="مدفوع منا (نثريات)"
              size="xl"
              :ui="{ label: 'text-lg' }"
            >
              <DecimalInput
                :model-value="deliveryForm.nathriyat_paid"
                size="xl"
                @update:model-value="setDeliveryDecimal('nathriyat_paid', $event)"
              />
            </UFormField>
            <UFormField
              label="نثريات طرف المورد"
              size="xl"
              :ui="{ label: 'text-lg' }"
            >
              <DecimalInput
                :model-value="deliveryForm.nathriyat_supplier_paid"
                size="xl"
                @update:model-value="setDeliveryDecimal('nathriyat_supplier_paid', $event)"
              />
            </UFormField>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            @click="cancelDeliveryInline"
          >
            إلغاء
          </UButton>
          <UButton
            :loading="saving"
            @click="saveDelivery"
          >
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
          <div class="flex flex-wrap items-center gap-2 rounded-lg bg-elevated/60 px-3 py-2 text-sm">
            <span class="text-muted">الباقي:</span>
            <UBadge
              size="lg"
              :color="signedTone(paymentRemaining)"
              variant="subtle"
            >
              <span dir="ltr">{{ formatMoney(paymentRemaining) }}</span>
            </UBadge>
          </div>
          <UFormField
            label="التاريخ"
            required
          >
            <UInput
              v-model="paymentForm.payment_date"
              type="date"
              class="w-full"
              dir="ltr"
            />
          </UFormField>
          <UFormField
            label="المبلغ"
            required
          >
            <DecimalInput
              :model-value="paymentForm.amount"
              placeholder="0"
              suffix="جنيه"
              @update:model-value="setPaymentDecimal"
            />
          </UFormField>
          <UFormField label="البيان">
            <UTextarea
              v-model="paymentForm.notes"
              class="w-full"
              :rows="2"
            />
          </UFormField>

          <div
            v-if="paymentDelivery"
            class="space-y-2 border-t border-default pt-3"
          >
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
                <p
                  class="tabular-nums"
                  dir="ltr"
                >
                  {{ formatMoney(pay.amount) }}
                </p>
                <p
                  class="text-xs text-muted"
                  dir="ltr"
                >
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
          <UButton
            color="neutral"
            variant="outline"
            @click="paymentModalOpen = false"
          >
            إلغاء
          </UButton>
          <UButton
            :loading="saving"
            @click="saveDeliveryPayment"
          >
            حفظ الدفعة
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
