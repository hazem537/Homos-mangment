<script setup lang="ts">
const {
  loading,
  saving,
  search,
  modalOpen,
  form,
  filtered,
  openCreate,
  openEdit,
  save,
  softDelete
} = useProducts()
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-2xl font-semibold text-highlighted">
          أصناف الحمص
        </h2>
        <p class="text-muted mt-1">
          أنواع الحمص المستخدمة في الشراء والتسليم والمخزون
        </p>
      </div>
      <UButton icon="i-lucide-plus" @click="openCreate">
        إضافة صنف
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
        <TableSkeleton :cols="3" />
      </div>
      <div v-else class="overflow-x-auto">
        <table dir="rtl" class="w-full text-sm min-w-120 text-center">
          <thead class="bg-elevated/60 text-muted">
            <tr>
              <th class="p-3 font-medium">
                الاسم
              </th>
              <th class="p-3 font-medium">
                ملاحظات
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
              <td class="p-3 font-medium">
                <NuxtLink
                  :to="`/products/${row.id}`"
                  class="text-highlighted hover:underline"
                >
                  {{ row.name }}
                </NuxtLink>
              </td>
              <td class="max-w-[16rem] p-3 text-start text-muted whitespace-normal break-words">
                {{ row.notes || '—' }}
              </td>
              <td class="p-3">
                <div class="flex justify-center gap-1">
                  <UButton
                    size="sm"
                    variant="ghost"
                    icon="i-lucide-eye"
                    :to="`/products/${row.id}`"
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
              <td colspan="3" class="p-6 text-center text-muted">
                لا توجد أصناف
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UModal v-model:open="modalOpen" title="الصنف">
      <template #body>
        <div class="space-y-4">
          <UFormField label="الاسم" required>
            <UInput v-model="form.name" class="w-full" placeholder="مثال: حمص خام / درجة أولى" />
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
