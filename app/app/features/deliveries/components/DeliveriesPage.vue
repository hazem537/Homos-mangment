<script setup lang="ts">
import { formatMoney, formatNumber, signedTone } from '~/utils/formatNumber'

const {
  loading,
  saving,
  search,
  modalOpen,
  editing,
  form,
  filtered,
  summary,
  activeSeason,
  supplierOptions,
  warehouseOptions,
  productOptions,
  deliveryMaxKgAllowed,
  onSupplierChange,
  onWarehouseChange,
  computedArdab,
  expandedDeliveryId,
  paymentModalOpen,
  paymentKind,
  paymentForm,
  paymentRemaining,
  nolonRestOf,
  nathriyatRestOf,
  paymentsOf,
  deliveryCostKindLabel,
  toggleExpand,
  openPay,
  savePayment,
  softDeletePayment,
  openCreate,
  openEdit,
  save,
  softDelete,
  setDecimalField,
  setPaymentDecimal,
  nolonManualOverride,
  nolonRatePerTon
} = useDeliveries()
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-2xl font-semibold text-highlighted">
          تسليمات الشون
        </h2>
        <p class="text-muted mt-1">
          وارد الخام مع نولون ونثريات ودفعات جزئية
          <span v-if="activeSeason">
            ({{ activeSeason.name }})
          </span>
        </p>
      </div>
      <UButton icon="i-lucide-plus" @click="openCreate">
        تسجيل تسليم
      </UButton>
    </div>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <UCard>
        <p class="text-sm text-muted">
          إجمالي الكمية
        </p>
        <p class="text-xl font-semibold mt-2" dir="ltr">
          {{ formatNumber(summary.totalKg) }} كجم
        </p>
        <p class="text-sm text-muted mt-1" dir="ltr">
          {{ formatNumber(summary.totalArdab) }} أردب · {{ summary.count }} نقلة
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-muted">
          نولون (باقي)
        </p>
        <p class="text-xl font-semibold mt-2" dir="ltr">
          {{ formatMoney(summary.nolonRest) }}
        </p>
        <p class="text-sm text-muted mt-1" dir="ltr">
          إجمالي {{ formatMoney(summary.nolonTotal) }} · مدفوع {{ formatMoney(summary.nolonPaid) }}
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-muted">
          نثريات (باقي)
        </p>
        <p class="text-xl font-semibold mt-2" dir="ltr">
          {{ formatMoney(summary.nathriyatRest) }}
        </p>
        <p class="text-sm text-muted mt-1" dir="ltr">
          إجمالي {{ formatMoney(summary.nathriyatTotal) }} · مدفوع {{ formatMoney(summary.nathriyatPaid) }}
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-muted">
          حالة الباقي
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          <UBadge size="lg" :color="signedTone(summary.nolonRest)" variant="subtle">
            نولون
          </UBadge>
          <UBadge size="lg" :color="signedTone(summary.nathriyatRest)" variant="subtle">
            نثريات
          </UBadge>
        </div>
      </UCard>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="بحث بالمورد أو الشونة أو الصنف أو السيارة..."
        class="max-w-md"
      />
    </div>

    <UCard :ui="{ body: 'p-0' }">
      <div v-if="loading">
        <TableSkeleton :cols="9" />
      </div>
      <div v-else-if="!activeSeason" class="p-6 text-center text-muted">
        لا يوجد موسم نشط — من شاشة المواسم فعّل موسماً أولاً.
      </div>
      <div v-else class="overflow-x-auto">
        <table dir="rtl" class="w-full text-sm min-w-[1200px] text-center">
          <thead class="bg-elevated/60 text-muted">
            <tr>
              <th class="p-3 font-medium w-10" />
              <th class="p-3 font-medium">
                التاريخ
              </th>
              <th class="p-3 font-medium">
                المورد
              </th>
              <th class="p-3 font-medium">
                الشونة
              </th>
              <th class="p-3 font-medium">
                الصنف
              </th>
              <th class="p-3 font-medium">
                كجم
              </th>
              <th class="p-3 font-medium">
                أردب
              </th>
              <th class="p-3 font-medium">
                نولون
              </th>
              <th class="p-3 font-medium">
                باقي نولون
              </th>
              <th class="p-3 font-medium">
                نثريات
              </th>
              <th class="p-3 font-medium">
                باقي نثريات
              </th>
              <th class="p-3 font-medium">
                رقم السيارة
              </th>
              <th class="p-3 font-medium w-40">
                إجراءات
              </th>
            </tr>
          </thead>
          <tbody>
            <template v-for="row in filtered" :key="row.id">
              <tr class="border-t border-default">
                <td class="p-2">
                  <UButton
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    :icon="expandedDeliveryId === row.id ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                    @click="toggleExpand(row.id)"
                  />
                </td>
                <td class="p-3" dir="ltr">
                  {{ row.delivery_date }}
                </td>
                <td class="p-3 font-medium">
                  {{ row.suppliers?.name || '—' }}
                </td>
                <td class="p-3">
                  {{ row.warehouses?.name || '—' }}
                </td>
                <td class="p-3">
                  {{ row.products?.name || '—' }}
                </td>
                <td class="p-3" dir="ltr">
                  {{ formatNumber(row.quantity_kg) }}
                </td>
                <td class="p-3" dir="ltr">
                  {{ formatNumber(row.ardab) }}
                </td>
                <td class="p-3" dir="ltr">
                  {{ formatMoney(row.nolon_total) }}
                </td>
                <td class="p-3">
                  <UBadge size="lg" :color="signedTone(nolonRestOf(row))" variant="subtle">
                    <span dir="ltr">{{ formatMoney(nolonRestOf(row)) }}</span>
                  </UBadge>
                </td>
                <td class="p-3" dir="ltr">
                  {{ formatMoney(row.nathriyat_total) }}
                </td>
                <td class="p-3">
                  <UBadge size="lg" :color="signedTone(nathriyatRestOf(row))" variant="subtle">
                    <span dir="ltr">{{ formatMoney(nathriyatRestOf(row)) }}</span>
                  </UBadge>
                </td>
                <td class="p-3 text-muted">
                  {{ row.vehicle_number || '—' }}
                </td>
                <td class="p-3">
                  <div class="flex flex-wrap justify-center gap-1">
                    <UButton
                      v-if="nolonRestOf(row) > 0"
                      size="xs"
                      variant="soft"
                      @click="openPay(row, 'nolon')"
                    >
                      دفع نولون
                    </UButton>
                    <UButton
                      v-if="nathriyatRestOf(row) > 0"
                      size="xs"
                      variant="soft"
                      color="neutral"
                      @click="openPay(row, 'nathriyat')"
                    >
                      دفع نثريات
                    </UButton>
                    <UButton
                      size="sm"
                      variant="ghost"
                      icon="i-lucide-pencil"
                      @click="openEdit(row)"
                    />
                    <UButton
                      size="sm"
                      variant="ghost"
                      color="error"
                      icon="i-lucide-trash-2"
                      :disabled="saving"
                      @click="softDelete(row)"
                    />
                  </div>
                </td>
              </tr>
              <tr v-if="expandedDeliveryId === row.id" class="bg-elevated/30">
                <td colspan="14" class="p-3 text-start">
                  <div class="space-y-2">
                    <p class="text-sm font-medium text-highlighted">
                      دفعات هذه النقلة
                    </p>
                    <div v-if="!paymentsOf(row.id).length" class="text-sm text-muted py-2">
                      لا توجد دفعات بعد — استخدم «دفع نولون» أو «دفع نثريات»
                    </div>
                    <table v-else dir="rtl" class="w-full text-sm min-w-[480px]">
                      <thead class="text-muted">
                        <tr>
                          <th class="p-2 font-medium text-center">
                            التاريخ
                          </th>
                          <th class="p-2 font-medium text-center">
                            النوع
                          </th>
                          <th class="p-2 font-medium text-center">
                            المبلغ
                          </th>
                          <th class="p-2 font-medium text-center">
                            البيان
                          </th>
                          <th class="p-2 font-medium w-16 text-center">
                            حذف
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="pay in paymentsOf(row.id)"
                          :key="pay.id"
                          class="border-t border-default"
                        >
                          <td class="p-2 text-center" dir="ltr">
                            {{ pay.payment_date }}
                          </td>
                          <td class="p-2 text-center">
                            <UBadge size="sm" variant="subtle" :color="pay.kind === 'nolon' ? 'primary' : 'neutral'">
                              {{ deliveryCostKindLabel(pay.kind) }}
                            </UBadge>
                          </td>
                          <td class="p-2 text-center" dir="ltr">
                            {{ formatMoney(pay.amount) }}
                          </td>
                          <td class="p-2 text-center text-muted">
                            {{ pay.notes || '—' }}
                          </td>
                          <td class="p-2 text-center">
                            <UButton
                              size="xs"
                              variant="ghost"
                              color="error"
                              icon="i-lucide-trash-2"
                              :disabled="saving"
                              @click="softDeletePayment(pay)"
                            />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </td>
              </tr>
            </template>
            <tr v-if="!filtered.length">
              <td colspan="14" class="p-6 text-center text-muted">
                لا توجد تسليمات في هذا الموسم بعد
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UModal v-model:open="modalOpen" :title="editing ? 'تعديل تسليم' : 'تسجيل تسليم'">
      <template #body>
        <div class="space-y-4">
          <UFormField label="المورد" required>
            <USelect
              v-model="form.supplier_id"
              :items="supplierOptions"
              value-key="value"
              label-key="label"
              class="w-full"
              @update:model-value="onSupplierChange"
            />
          </UFormField>
          <UFormField label="الشونة" required>
            <USelect
              v-model="form.warehouse_id"
              :items="warehouseOptions"
              value-key="value"
              label-key="label"
              class="w-full"
              @update:model-value="onWarehouseChange"
            />
          </UFormField>
          <UFormField label="الصنف" required>
            <USelect
              v-model="form.product_id"
              :items="productOptions"
              value-key="value"
              label-key="label"
              class="w-full"
              :placeholder="productOptions.length ? 'اختر الصنف' : 'لا يوجد شراء لهذا المورد'"
            />
          </UFormField>
          <UFormField label="التاريخ" required>
            <UInput v-model="form.delivery_date" type="date" class="w-full" dir="ltr" />
          </UFormField>
          <UFormField label="الكمية (كجم)" required>
            <DecimalInput
              :model-value="form.quantity_kg"
              placeholder="مثال: 170,5"
              suffix="كجم"
              :title="`الحد الأقصى لهذا الصنف: ${formatNumber(deliveryMaxKgAllowed)} كجم`"
              @update:model-value="setDecimalField('quantity_kg', $event)"
            />
            <p class="text-xs text-muted mt-1">
              المتبقي لهذا الصنف:
              <span dir="ltr" class="font-medium">{{ formatNumber(deliveryMaxKgAllowed) }}</span>
              كجم
            </p>
          </UFormField>
          <p class="text-sm text-muted">
            الأردب المحسوب:
            <span dir="ltr" class="font-medium text-highlighted">{{ formatNumber(computedArdab) }}</span>
          </p>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField
              :label="nolonManualOverride ? 'إجمالي النولون (معدّل يدوياً)' : `إجمالي النولون (تلقائي: طن × ${nolonRatePerTon})`"
              hint="يحسب تلقائياً من الوزن ويمكن تعديله"
            >
              <DecimalInput
                :model-value="form.nolon_total"
                :placeholder="`×${nolonRatePerTon}`"
                suffix="جنيه"
                @update:model-value="setDecimalField('nolon_total', $event)"
              />
            </UFormField>
            <UFormField label="مدفوع النولون">
              <DecimalInput
                :model-value="form.nolon_paid"
                placeholder="0"
                suffix="جنيه"
                :disabled="!!editing"
                @update:model-value="setDecimalField('nolon_paid', $event)"
              />
            </UFormField>
            <UFormField label="إجمالي النثريات">
              <DecimalInput
                :model-value="form.nathriyat_total"
                placeholder="0"
                suffix="جنيه"
                @update:model-value="setDecimalField('nathriyat_total', $event)"
              />
            </UFormField>
            <UFormField label="مدفوع النثريات">
              <DecimalInput
                :model-value="form.nathriyat_paid"
                placeholder="0"
                suffix="جنيه"
                :disabled="!!editing"
                @update:model-value="setDecimalField('nathriyat_paid', $event)"
              />
            </UFormField>
          </div>
          <p class="text-xs text-muted">
            عند التسجيل: المدفوع يُحفظ كدفعة بتاريخ التسليم.
            عند التعديل: المدفوع للعرض فقط — الدفعات الإضافية من زر «دفع نولون / نثريات».
          </p>
          <UFormField label="رقم السيارة">
            <UInput v-model="form.vehicle_number" class="w-full" placeholder="اختياري" />
          </UFormField>
          <UFormField label="ملاحظات">
            <UTextarea v-model="form.notes" class="w-full" :rows="3" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="modalOpen = false">
            إلغاء
          </UButton>
          <UButton :loading="saving" @click="save">
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
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="paymentModalOpen = false">
            إلغاء
          </UButton>
          <UButton :loading="saving" @click="savePayment">
            حفظ الدفعة
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
