<script setup lang="ts">
const props = defineProps<{
  productId: string
}>()

const {
  loading,
  saving,
  product,
  statuses,
  statusModalOpen,
  statusForm,
  productEditOpen,
  productForm,
  openProductEdit,
  saveProduct,
  openStatusCreate,
  openStatusEdit,
  saveStatus,
  deleteStatus
} = useProductDetail(() => props.productId)
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center gap-3">
      <UButton
        to="/products"
        variant="ghost"
        color="neutral"
        icon="i-lucide-arrow-right"
        size="sm"
        aria-label="رجوع"
      />
      <div class="min-w-0 flex-1">
        <div v-if="loading" class="h-8 w-48 animate-pulse rounded bg-elevated" />
        <template v-else>
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="truncate text-2xl font-semibold text-highlighted">
              {{ product?.name || 'الصنف' }}
            </h2>
            <UButton
              size="sm"
              variant="ghost"
              icon="i-lucide-pencil"
              @click="openProductEdit"
            />
          </div>
          <p v-if="product?.notes" class="mt-1 text-sm text-muted">
            {{ product.notes }}
          </p>
        </template>
      </div>
    </div>

    <UCard :ui="{ body: 'p-0' }">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-default p-4">
        <div>
          <h3 class="font-semibold text-highlighted">
            حالات هذا الصنف
          </h3>
          <p class="text-sm text-muted">
            مثل مغربل / بدون غربلة — تُستخدم عند التسليم والتحويل
          </p>
        </div>
        <UButton icon="i-lucide-plus" size="sm" @click="openStatusCreate">
          إضافة حالة
        </UButton>
      </div>

      <div v-if="loading">
        <TableSkeleton :cols="3" />
      </div>
      <div v-else class="overflow-x-auto">
        <table dir="rtl" class="w-full text-sm text-center">
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
              v-for="row in statuses"
              :key="row.id"
              class="border-t border-default"
            >
              <td class="p-3 font-medium">
                {{ row.name }}
              </td>
              <td class="max-w-[16rem] p-3 text-start text-muted whitespace-normal break-words">
                {{ row.notes || '—' }}
              </td>
              <td class="p-3">
                <div class="flex justify-center gap-1">
                  <UButton
                    size="sm"
                    variant="ghost"
                    icon="i-lucide-pencil"
                    @click="openStatusEdit(row)"
                  />
                  <UButton
                    size="sm"
                    variant="ghost"
                    color="error"
                    icon="i-lucide-trash-2"
                    :disabled="saving"
                    @click="deleteStatus(row)"
                  />
                </div>
              </td>
            </tr>
            <tr v-if="!statuses.length">
              <td colspan="3" class="p-6 text-center text-muted">
                لا توجد حالات لهذا الصنف
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UModal v-model:open="productEditOpen" title="تعديل الصنف">
      <template #body>
        <div class="space-y-4">
          <UFormField label="الاسم" required>
            <UInput v-model="productForm.name" class="w-full" />
          </UFormField>
          <UFormField label="ملاحظات">
            <UTextarea v-model="productForm.notes" class="w-full" :rows="3" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="productEditOpen = false">
            إلغاء
          </UButton>
          <UButton :loading="saving" @click="saveProduct">
            حفظ
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="statusModalOpen" title="الحالة">
      <template #body>
        <div class="space-y-4">
          <UFormField label="الاسم" required>
            <UInput v-model="statusForm.name" class="w-full" placeholder="مثال: مغربل" />
          </UFormField>
          <UFormField label="ملاحظات">
            <UTextarea v-model="statusForm.notes" class="w-full" :rows="3" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="statusModalOpen = false">
            إلغاء
          </UButton>
          <UButton :loading="saving" @click="saveStatus">
            حفظ
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
