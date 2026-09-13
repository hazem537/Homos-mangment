<script setup lang="ts">
import { formatNumber } from '~/utils/formatNumber'

const {
  loading,
  saving,
  seasons,
  modalOpen,
  form,
  openCreate,
  openEdit,
  save,
  setDecimalField
} = useSeasons()
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-2xl font-semibold text-highlighted">
          المواسم ومعامل الأردب
        </h2>
        <p class="text-muted mt-1">
          الأردب = الكمية بالكجم ÷ معامل الأردب (افتراضي 170)
        </p>
      </div>
      <UButton icon="i-lucide-plus" @click="openCreate">
        إضافة موسم
      </UButton>
    </div>

    <UCard :ui="{ body: 'p-0' }">
      <div v-if="loading">
        <TableSkeleton />
      </div>
      <table v-else dir="rtl" class="w-full text-sm text-center">
        <thead class="bg-elevated/60 text-muted">
          <tr>
            <th class="p-3 font-medium">
              الاسم
            </th>
            <th class="p-3 font-medium">
              السنة
            </th>
            <th class="p-3 font-medium">
              معامل الأردب
            </th>
            <th class="p-3 font-medium">
              الحالة
            </th>
            <th class="p-3 font-medium w-28">
              إجراءات
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in seasons"
            :key="row.id"
            class="border-t border-default"
          >
            <td class="p-3 font-medium">
              {{ row.name }}
            </td>
            <td class="p-3" dir="ltr">
              {{ row.year }}
            </td>
            <td class="p-3" dir="ltr">
              {{ formatNumber(row.ardab_factor) }}
            </td>
            <td class="p-3">
              <UBadge :color="row.is_active ? 'success' : 'neutral'" variant="subtle">
                {{ row.is_active ? 'نشط' : 'غير نشط' }}
              </UBadge>
            </td>
            <td class="p-3">
              <div class="flex justify-center">
                <UButton
                  size="sm"
                  variant="ghost"
                  icon="i-lucide-pencil"
                  @click="openEdit(row)"
                />
              </div>
            </td>
          </tr>
          <tr v-if="!seasons.length">
            <td colspan="5" class="p-6 text-center text-muted">
              لا توجد مواسم — نفّذ ملف الهجرة SQL أولاً
            </td>
          </tr>
        </tbody>
      </table>
    </UCard>

    <UModal v-model:open="modalOpen" title="الموسم">
      <template #body>
        <div class="space-y-4">
          <UFormField label="الاسم" required>
            <UInput v-model="form.name" class="w-full" />
          </UFormField>
          <UFormField label="السنة" required>
            <DecimalInput
              :model-value="form.year"
              integer
              @update:model-value="setDecimalField('year', $event)"
            />
          </UFormField>
          <UFormField label="معامل الأردب (كجم)" required>
            <DecimalInput
              :model-value="form.ardab_factor"
              placeholder="مثال: 170"
              @update:model-value="setDecimalField('ardab_factor', $event)"
            />
          </UFormField>
          <UCheckbox v-model="form.is_active" label="تعيين كموسم نشط" />
          <p class="text-xs text-muted">
            تفعيل موسم جديد يلغي تنشيط أي موسم آخر تلقائياً.
          </p>
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
