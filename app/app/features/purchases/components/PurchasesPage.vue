<script setup lang="ts">
import { formatMoney, formatNumber } from '~/utils/formatNumber'

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
  productOptions,
  computedArdab,
  computedTotal,
  openCreate,
  openEdit,
  save,
  softDelete,
  setDecimalField
} = usePurchases()
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-2xl font-semibold text-highlighted">
          المشتريات
        </h2>
        <p class="text-muted mt-1">
          تسجيل شراء الحمص الخام — الأردب = كجم ÷ معامل الموسم
          <span v-if="activeSeason">
            ({{ activeSeason.name }} · معامل {{ activeSeason.ardab_factor }})
          </span>
        </p>
      </div>
      <UButton icon="i-lucide-plus" @click="openCreate">
        تسجيل شراء
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
      </UCard>
      <UCard>
        <p class="text-sm text-muted">
          إجمالي الأردب
        </p>
        <p class="text-xl font-semibold mt-2" dir="ltr">
          {{ formatNumber(summary.totalArdab) }}
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-muted">
          متوسط سعر الأردب
        </p>
        <p class="text-xl font-semibold mt-2" dir="ltr">
          {{ formatMoney(summary.avgPrice) }}
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-muted">
          آخر سعر / إجمالي الثمن
        </p>
        <p class="text-xl font-semibold mt-2" dir="ltr">
          {{ formatMoney(summary.lastPrice) }}
        </p>
        <p class="text-sm text-muted mt-1" dir="ltr">
          {{ formatMoney(summary.totalAmount) }} · {{ summary.count }} عملية
        </p>
      </UCard>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="بحث بالمورد أو الصنف أو الملاحظات..."
        class="max-w-md"
      />
    </div>

    <UCard :ui="{ body: 'p-0' }">
      <div v-if="loading">
        <TableSkeleton :cols="8" />
      </div>
      <div v-else-if="!activeSeason" class="p-6 text-center text-muted">
        لا يوجد موسم نشط — من شاشة المواسم فعّل موسماً أولاً.
      </div>
      <div v-else class="overflow-x-auto">
        <table dir="rtl" class="w-full text-sm min-w-[800px] text-center">
          <thead class="bg-elevated/60 text-muted">
            <tr>
              <th class="p-3 font-medium">
                التاريخ
              </th>
              <th class="p-3 font-medium">
                المورد
              </th>
              <th class="p-3 font-medium">
                الصنف
              </th>
              <th class="p-3 font-medium">
                الكمية (كجم)
              </th>
              <th class="p-3 font-medium">
                الأردب
              </th>
              <th class="p-3 font-medium">
                سعر الأردب
              </th>
              <th class="p-3 font-medium">
                الإجمالي
              </th>
              <th class="p-3 font-medium w-28">
                إجراءات
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in filtered"
              :key="row.id"
              class="border-t border-default"
            >
              <td class="p-3" dir="ltr">
                {{ row.purchase_date }}
              </td>
              <td class="p-3 font-medium">
                {{ row.suppliers?.name || '—' }}
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
                {{ formatMoney(row.price_per_ardab) }}
              </td>
              <td class="p-3" dir="ltr">
                {{ formatMoney(row.total_price) }}
              </td>
              <td class="p-3">
                <div class="flex justify-center gap-1">
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
            <tr v-if="!filtered.length">
              <td colspan="8" class="p-6 text-center text-muted">
                لا توجد مشتريات في هذا الموسم بعد
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UModal v-model:open="modalOpen" :title="editing ? 'تعديل شراء' : 'تسجيل شراء'">
      <template #body>
        <div class="space-y-4">
          <UFormField label="المورد" required>
            <USelect
              v-model="form.supplier_id"
              :items="supplierOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>
          <UFormField label="الصنف" required>
            <USelect
              v-model="form.product_id"
              :items="productOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>
          <UFormField label="التاريخ" required>
            <UInput v-model="form.purchase_date" type="date" class="w-full" dir="ltr" />
          </UFormField>
          <UFormField label="الكمية (كجم)" required>
            <DecimalInput
              :model-value="form.quantity_kg"
              placeholder="مثال: 170,5"
              suffix="كجم"
              @update:model-value="setDecimalField('quantity_kg', $event)"
            />
          </UFormField>
          <UFormField label="سعر الأردب" required>
            <DecimalInput
              :model-value="form.price_per_ardab"
              placeholder="مثال: 5250,75"
              suffix="جنيه"
              @update:model-value="setDecimalField('price_per_ardab', $event)"
            />
          </UFormField>
          <div class="rounded-lg bg-elevated/60 p-3 text-sm space-y-1">
            <p>
              الأردب المحسوب:
              <span class="font-semibold" dir="ltr">{{ formatNumber(computedArdab) }}</span>
            </p>
            <p>
              إجمالي الثمن:
              <span class="font-semibold" dir="ltr">{{ formatMoney(computedTotal) }}</span>
            </p>
          </div>
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
  </div>
</template>
