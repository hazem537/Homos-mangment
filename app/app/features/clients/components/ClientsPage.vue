<script setup lang="ts">
const {
  loading,
  saving,
  search,
  modalOpen,
  form,
  filtered,
  activeSeasonName,
  issueModalOpen,
  issueClient,
  issueForm,
  issueFromOptions,
  openCreate,
  openEdit,
  save,
  softDelete,
  openIssue,
  onIssueKindChange,
  saveIssue,
  setIssueQty
} = useClients()

const fromKindOptions = [
  { label: 'ربع', value: 'section' },
  { label: 'مخزن', value: 'store' },
  { label: 'مقلى', value: 'mekla' }
]
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-2xl font-semibold text-highlighted">
          العملاء
        </h2>
        <p class="text-muted mt-1">
          صرف من ربع / مخزن / مقلى
          <span v-if="activeSeasonName">({{ activeSeasonName }})</span>
        </p>
      </div>
      <UButton icon="i-lucide-plus" @click="openCreate">
        إضافة عميل
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
        <TableSkeleton :cols="2" />
      </div>
      <div v-else class="overflow-x-auto">
        <table dir="rtl" class="w-full text-sm min-w-[480px] text-center">
          <thead class="bg-elevated/60 text-muted">
            <tr>
              <th class="p-3 font-medium">
                الاسم
              </th>
              <th class="p-3 font-medium w-40">
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
                {{ row.name }}
                <p v-if="row.notes" class="text-xs text-muted font-normal mt-0.5">
                  {{ row.notes }}
                </p>
              </td>
              <td class="p-3">
                <div class="flex justify-center gap-1">
                  <UButton
                    size="sm"
                    variant="soft"
                    icon="i-lucide-truck"
                    title="صرف"
                    @click="openIssue(row)"
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
              <td colspan="2" class="p-6 text-center text-muted">
                لا يوجد عملاء
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <UModal v-model:open="modalOpen" title="العميل">
      <template #body>
        <div class="space-y-4">
          <UFormField label="الاسم" required>
            <UInput v-model="form.name" class="w-full" placeholder="مثال: عميل الجملة" />
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

    <UModal v-model:open="issueModalOpen" title="صرف للعميل">
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-muted">
            العميل: {{ issueClient?.name }}
          </p>
          <UFormField label="التاريخ" required>
            <UInput v-model="issueForm.movement_date" type="date" class="w-full" dir="ltr" />
          </UFormField>
          <UFormField label="من نوع" required>
            <USelect
              v-model="issueForm.from_kind"
              :items="fromKindOptions"
              value-key="value"
              label-key="label"
              class="w-full"
              @update:model-value="onIssueKindChange"
            />
          </UFormField>
          <UFormField label="المصدر" required>
            <USelect
              v-model="issueForm.from_id"
              :items="issueFromOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>
          <UFormField label="الكمية (كجم)" required>
            <DecimalInput
              :model-value="issueForm.quantity_kg"
              placeholder="كجم"
              @update:model-value="setIssueQty"
            />
          </UFormField>
          <UFormField label="ملاحظات">
            <UTextarea v-model="issueForm.notes" class="w-full" :rows="2" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="issueModalOpen = false">
            إلغاء
          </UButton>
          <UButton :loading="saving" @click="saveIssue">
            صرف
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
