<script setup lang="ts">
import { formatNumber } from '~/utils/formatNumber'

const {
  loading,
  saving,
  search,
  modalOpen,
  form,
  filtered,
  activeSeasonName,
  openCreate,
  openEdit,
  save,
  softDelete
} = useStores()
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-2xl font-semibold text-highlighted">
          المخازن
        </h2>
        <p class="text-muted mt-1">
          أرصدة الموسم النشط
          <span v-if="activeSeasonName">({{ activeSeasonName }})</span>
        </p>
      </div>
      <UButton icon="i-lucide-plus" @click="openCreate">
        إضافة مخزن
      </UButton>
    </div>

    <UInput
      v-model="search"
      icon="i-lucide-search"
      placeholder="بحث بالاسم..."
      class="max-w-md"
    />

    <UCard :ui="{ body: 'p-0' }">
      <div v-if="loading">
        <TableSkeleton :cols="5" />
      </div>
      <div v-else class="overflow-x-auto">
        <table dir="rtl" class="w-full text-sm min-w-[620px] text-center">
          <thead class="bg-elevated/60 text-muted">
            <tr>
              <th class="p-3 font-medium">
                الاسم
              </th>
              <th class="p-3 font-medium">
                الصنف
              </th>
              <th class="p-3 font-medium">
                حالة
              </th>
              <th class="p-3 font-medium">
                الرصيد (كجم)
              </th>
              <th class="p-3 font-medium w-28">
                إجراءات
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in filtered"
              :key="`${row.store_id}-${row.product_id || 'none'}-${row.status_id || 'none'}`"
              class="border-t border-default"
            >
              <td class="p-3 font-medium">
                {{ row.store_name }}
                <p v-if="row.notes" class="text-xs text-muted font-normal mt-0.5">
                  {{ row.notes }}
                </p>
              </td>
              <td class="p-3">
                {{ row.product_name || '—' }}
              </td>
              <td class="p-3">
                {{ row.status_name || '—' }}
              </td>
              <td class="p-3" dir="ltr">
                {{ formatNumber(row.kg_total) }}
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
              <td colspan="5" class="p-6 text-center text-muted">
                لا توجد مخازن
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UModal v-model:open="modalOpen" title="المخزن">
      <template #body>
        <div class="space-y-4">
          <UFormField label="الاسم" required>
            <UInput v-model="form.name" class="w-full" placeholder="مثال: مخزن رئيسي" />
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
