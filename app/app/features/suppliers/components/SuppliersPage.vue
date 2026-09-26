<script setup lang="ts">
import { formatMoney, formatNumber, signedTone } from '~/utils/formatNumber'
import { accountTypeLabel, withAccountType } from '~/utils/accountType'

const {
  loading,
  saving,
  search,
  selectedProductId,
  productOptions,
  modalOpen,
  form,
  filtered,
  activeSeasonName,
  openCreate,
  openEdit,
  save,
  softDelete
} = useSuppliers()
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-2xl font-semibold text-highlighted">
          الموردون
        </h2>
        <p class="text-muted mt-1">
          أرصدة الموسم النشط
          <span v-if="activeSeasonName">({{ activeSeasonName }})</span>
          — كمية، تسليم، نقدية
        </p>
      </div>
      <UButton icon="i-lucide-plus" @click="openCreate">
        إضافة مورد
      </UButton>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="بحث بالاسم..."
        class="max-w-md"
      />
      <USelect
        v-model="selectedProductId"
        :items="productOptions"
        value-key="value"
        label-key="label"
        class="w-48"
        placeholder="الصنف"
      />
    </div>

    <UCard :ui="{ body: 'p-0' }">
      <div v-if="loading">
        <TableSkeleton />
      </div>
      <div v-else class="overflow-x-auto">
        <table dir="rtl" class="w-full text-sm min-w-[960px] text-center">
          <thead class="bg-elevated/60 text-muted">
            <tr>
              <th class="p-3 font-medium">
                الاسم
              </th>
              <th class="p-3 font-medium">
                النوع
              </th>
              <th class="p-3 font-medium">
                الصنف
              </th>
              <th class="p-3 font-medium">
                أردب مشتراة
              </th>
              <th class="p-3 font-medium">
                أردب مستلمة
              </th>
              <th class="p-3 font-medium">
                باقي أردب
              </th>
              <th class="p-3 font-medium">
                إجمالي المشتريات
              </th>
              <th class="p-3 font-medium">
                المحوّل
              </th>
              <th class="p-3 font-medium">
                المستحق
              </th>
              <th class="p-3 font-medium w-32">
                إجراءات
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in filtered"
              :key="`${row.supplier_id}-${row.product_id}`"
              class="border-t border-default"
            >
              <td class="p-3 font-medium">
                <NuxtLink
                  :to="`/suppliers/${row.supplier_id}`"
                  class="hover:text-primary hover:underline"
                >
                  {{ withAccountType(row.supplier_name, row.account_type_name) }}
                </NuxtLink>
                <p v-if="row.notes" class="text-xs text-muted font-normal mt-0.5">
                  {{ row.notes }}
                </p>
              </td>
              <td class="p-3">
                {{ accountTypeLabel(row.account_type_name) }}
              </td>
              <td class="p-3">
                {{ row.product_name || '—' }}
              </td>
              <td class="p-3" dir="ltr">
                {{ formatNumber(row.ardab_total) }}
              </td>
              <td class="p-3" dir="ltr">
                {{ formatNumber(row.ardab_delivered) }}
              </td>
              <td class="p-3">
                <UBadge size="lg" :color="signedTone(row.ardab_remaining)" variant="subtle">
                  <span dir="ltr">{{ formatNumber(row.ardab_remaining) }}</span>
                </UBadge>
              </td>
              <td class="p-3" dir="ltr">
                {{ formatMoney(row.purchases_total) }}
              </td>
              <td class="p-3" dir="ltr">
                {{ formatMoney(row.transfers_total) }}
              </td>
              <td class="p-3">
                <UBadge size="lg" :color="signedTone(row.balance)" variant="subtle">
                  <span dir="ltr">{{ formatMoney(row.balance) }}</span>
                </UBadge>
              </td>
              <td class="p-3">
                <div class="flex justify-center gap-1">
                  <UButton
                    size="sm"
                    variant="ghost"
                    icon="i-lucide-eye"
                    :to="`/suppliers/${row.supplier_id}`"
                  />
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
              <td colspan="10" class="p-6 text-center text-muted">
                لا يوجد موردون بعد
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UModal v-model:open="modalOpen" title="المورد">
      <template #body>
        <div class="space-y-4">
          <UFormField label="الاسم" required>
            <UInput
              v-model="form.name"
              class="w-full"
              placeholder="مثال: شركة أحمد / استثمار محمود"
            />
          </UFormField>
          <UFormField label="النوع" required>
            <AccountTypeField v-model="form.account_type_id" />
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
  </div>
</template>
