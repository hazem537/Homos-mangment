<script setup lang="ts">
import { formatMoney } from '~/utils/formatNumber'

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
  onSupplierChange,
  supplierDue,
  loadingDue,
  transferKindOptions,
  openCreate,
  openEdit,
  save,
  softDelete,
  transferKindLabel,
  setDecimalField
} = useCashTransfers()

const balanceHint = computed(() => {
  if (summary.value.balance > 0) return 'مستحق للمورد (مشتريات أكثر من التحويلات)'
  if (summary.value.balance < 0) return 'زيادة تحويل (تحويلات أكثر من المشتريات)'
  return 'الحساب متوازن'
})

const balanceColor = computed(() => {
  if (summary.value.balance > 0) return 'warning'
  if (summary.value.balance < 0) return 'error'
  return 'success'
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-2xl font-semibold text-highlighted">
          التحويلات النقدية
        </h2>
        <p class="text-muted mt-1">
          تسجيل الدفعات والتسويات — الباقي = ثمن المشتريات − التحويلات
          <span v-if="activeSeason">
            ({{ activeSeason.name }})
          </span>
        </p>
      </div>
      <UButton icon="i-lucide-plus" @click="openCreate">
        تسجيل تحويل
      </UButton>
    </div>

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <UCard>
        <p class="text-sm text-muted">
          ثمن المشتريات
        </p>
        <p class="text-xl font-semibold mt-2" dir="ltr">
          {{ formatMoney(summary.purchasesTotal) }}
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-muted">
          إجمالي التحويلات
        </p>
        <p class="text-xl font-semibold mt-2" dir="ltr">
          {{ formatMoney(summary.totalTransfers) }}
        </p>
        <p class="text-sm text-muted mt-1">
          {{ summary.count }} عملية
        </p>
      </UCard>
      <UCard class="sm:col-span-2">
        <p class="text-sm text-muted">
          الباقي من النقدية
        </p>
        <p class="text-xl font-semibold mt-2" dir="ltr">
          {{ formatMoney(summary.balance) }}
        </p>
        <UBadge class="mt-2" :color="balanceColor" variant="subtle">
          {{ balanceHint }}
        </UBadge>
      </UCard>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="بحث بالمورد أو الصنف أو البيان..."
        class="max-w-md"
      />
    </div>

    <UCard :ui="{ body: 'p-0' }">
      <div v-if="loading">
        <TableSkeleton :cols="7" />
      </div>
      <div v-else-if="!activeSeason" class="p-6 text-center text-muted">
        لا يوجد موسم نشط — من شاشة المواسم فعّل موسماً أولاً.
      </div>
      <div v-else class="overflow-x-auto">
        <table dir="rtl" class="w-full text-sm min-w-[720px] text-center">
          <thead class="bg-elevated/60 text-muted">
            <tr>
              <th class="p-3 font-medium w-28">
                إجراءات
              </th>
              <th class="p-3 font-medium">
                البيان
              </th>
              <th class="p-3 font-medium">
                المبلغ
              </th>
              <th class="p-3 font-medium">
                النوع
              </th>
              <th class="p-3 font-medium">
                الصنف
              </th>
              <th class="p-3 font-medium">
                المورد
              </th>
              <th class="p-3 font-medium">
                التاريخ
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in filtered"
              :key="row.id"
              class="border-t border-default"
            >
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
              <td class="max-w-[16rem] p-3 text-start text-muted whitespace-normal break-words">
                {{ row.notes || '—' }}
              </td>
              <td class="p-3" dir="ltr">
                {{ formatMoney(row.amount) }}
              </td>
              <td class="p-3">
                <UBadge
                  :color="row.kind === 'settlement' ? 'warning' : row.kind === 'commission' ? 'success' : 'primary'"
                  variant="subtle"
                >
                  {{ transferKindLabel(row.kind) }}
                </UBadge>
              </td>
              <td class="p-3">
                {{ row.products?.name || '—' }}
              </td>
              <td class="p-3 font-medium">
                {{ row.suppliers?.name || '—' }}
              </td>
              <td class="p-3" dir="ltr">
                {{ row.transfer_date }}
              </td>
            </tr>
            <tr v-if="!filtered.length">
              <td colspan="7" class="p-6 text-center text-muted">
                لا توجد تحويلات في هذا الموسم بعد
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UModal v-model:open="modalOpen" :title="editing ? 'تعديل تحويل' : 'تسجيل تحويل'">
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
          <UFormField label="الصنف" required>
            <USelect
              v-model="form.product_id"
              :items="productOptions"
              value-key="value"
              label-key="label"
              class="w-full"
              :placeholder="productOptions.length ? 'اختر الصنف' : 'لا توجد أصناف'"
            />
          </UFormField>
          <div
            v-if="form.supplier_id && form.product_id"
            class="rounded-lg bg-elevated/60 px-3 py-2 text-sm flex flex-wrap items-center gap-2"
          >
            <span class="text-muted">المستحق لهذا المورد × الصنف:</span>
            <USkeleton v-if="loadingDue" class="h-5 w-28 rounded" />
            <UBadge
              v-else-if="supplierDue !== null"
              :color="supplierDue > 0 ? 'warning' : supplierDue < 0 ? 'error' : 'success'"
              variant="subtle"
            >
              <span dir="ltr">{{ formatMoney(supplierDue) }}</span>
            </UBadge>
            <span v-else class="text-muted">—</span>
          </div>
          <UFormField label="التاريخ" required>
            <UInput v-model="form.transfer_date" type="date" class="w-full" dir="ltr" />
          </UFormField>
          <UFormField label="النوع" required>
            <USelect
              v-model="form.kind"
              :items="transferKindOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>
          <UFormField label="المبلغ" required>
            <DecimalInput
              :model-value="form.amount"
              placeholder="مثال: 1000,50"
              suffix="جنيه"
              @update:model-value="setDecimalField('amount', $event)"
            />
          </UFormField>
          <UFormField :label="form.kind === 'settlement' ? 'البيان (إلزامي للتسوية)' : 'البيان'" :required="form.kind === 'settlement'">
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
