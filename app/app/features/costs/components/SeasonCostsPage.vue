<script setup lang="ts">
import { formatMoney } from '~/utils/formatNumber'

const {
  initialLoading,
  isRefreshing,
  saving,
  search,
  hasActiveFilters,
  resetFilters,
  emptyMessage,
  modalOpen,
  editing,
  form,
  filtered,
  costs,
  totalAmount,
  activeSeasonName,
  openCreate,
  openEdit,
  save,
  softDelete,
  setAmount
} = useSeasonCosts()

const numCell = 'p-3 text-base font-semibold tabular-nums text-highlighted'
const stickyActions
  = 'sticky left-0 z-20 w-28 bg-elevated group-hover:bg-muted/60 shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.18)] dark:shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.45)]'
const stickyActionsHead
  = 'sticky left-0 z-30 w-28 bg-accented shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.18)] dark:shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.45)]'
</script>

<template>
  <div class="space-y-6">
    <PageHeader
      title="مصروفات الموسم"
      description="كل المصروفات مرتبطة بالموسم النشط"
      :season-name="activeSeasonName"
    >
      <template #actions>
        <UButton
          icon="i-lucide-plus"
          :disabled="initialLoading || !activeSeasonName"
          @click="openCreate"
        >
          إضافة مصروف
        </UButton>
      </template>
    </PageHeader>

    <div class="grid gap-3 sm:grid-cols-2">
      <UCard>
        <p class="text-sm text-muted">
          عدد المصروفات
        </p>
        <p class="mt-1 text-xl font-semibold tabular-nums text-highlighted" dir="ltr">
          {{ filtered.length }}
        </p>
      </UCard>
      <UCard>
        <p class="text-sm text-muted">
          الإجمالي
        </p>
        <p class="mt-1 text-xl font-semibold tabular-nums text-highlighted" dir="ltr">
          {{ formatMoney(totalAmount) }}
        </p>
      </UCard>
    </div>

    <div class="rounded-xl border border-default bg-elevated p-3 sm:p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          placeholder="بحث بالعنوان أو التاريخ أو الملاحظات…"
          class="w-full max-w-md"
          :disabled="initialLoading"
        />
        <UButton
          v-if="hasActiveFilters"
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-rotate-ccw"
          :disabled="initialLoading || isRefreshing"
          @click="resetFilters"
        >
          إعادة الضبط
        </UButton>
      </div>
    </div>

    <div v-if="initialLoading">
      <TableSkeleton :cols="4" />
    </div>

    <div
      v-else-if="!activeSeasonName"
      class="rounded-lg border border-default p-8 text-center text-muted"
    >
      لا يوجد موسم نشط — فعّل موسماً من شاشة المواسم أولاً.
    </div>

    <div
      v-else
      class="relative transition-opacity duration-200"
      :class="isRefreshing ? 'opacity-50 pointer-events-none' : 'opacity-100'"
      :aria-busy="isRefreshing"
    >
      <div
        v-if="isRefreshing"
        class="pointer-events-none absolute inset-x-0 top-8 z-10 flex justify-center"
      >
        <div class="flex items-center gap-2 rounded-full border border-default bg-default/90 px-3 py-1.5 text-sm text-muted shadow-sm backdrop-blur-sm">
          <UIcon
            name="i-lucide-loader-circle"
            class="size-4 animate-spin text-primary"
          />
          تحديث البيانات…
        </div>
      </div>

      <UCard :ui="{ root: 'overflow-hidden', body: 'p-0 sm:p-0' }">
        <div class="overflow-x-auto">
          <table
            dir="rtl"
            class="w-full min-w-[640px] text-center text-sm"
          >
            <thead class="bg-accented text-highlighted">
              <tr>
                <th class="p-3 font-semibold whitespace-nowrap">
                  التاريخ
                </th>
                <th class="p-3 font-semibold text-start whitespace-nowrap">
                  العنوان
                </th>
                <th class="p-3 font-semibold whitespace-nowrap">
                  المبلغ
                </th>
                <th :class="[stickyActionsHead, 'p-3 font-semibold whitespace-nowrap']">
                  إجراءات
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in filtered"
                :key="row.id"
                class="group border-t border-default hover:bg-muted/60"
              >
                <td
                  class="p-3 tabular-nums whitespace-nowrap"
                  dir="ltr"
                >
                  {{ row.cost_date }}
                </td>
                <td class="p-3 text-start font-medium">
                  {{ row.title }}
                  <p
                    v-if="row.notes"
                    class="mt-0.5 text-xs font-normal text-muted"
                  >
                    {{ row.notes }}
                  </p>
                </td>
                <td
                  :class="numCell"
                  dir="ltr"
                >
                  {{ formatMoney(row.amount) }}
                </td>
                <td :class="[stickyActions, 'p-3']">
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
                <td
                  colspan="4"
                  class="p-8 text-center text-muted"
                >
                  <div class="space-y-3">
                    <p>{{ emptyMessage }}</p>
                    <div class="flex flex-wrap justify-center gap-2">
                      <UButton
                        v-if="hasActiveFilters"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        icon="i-lucide-rotate-ccw"
                        @click="resetFilters"
                      >
                        إعادة ضبط البحث
                      </UButton>
                      <UButton
                        v-else-if="!costs.length"
                        size="sm"
                        icon="i-lucide-plus"
                        @click="openCreate"
                      >
                        إضافة مصروف
                      </UButton>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </UCard>
    </div>

    <UModal
      v-model:open="modalOpen"
      :title="editing ? 'تعديل مصروف' : 'إضافة مصروف'"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="التاريخ"
            required
          >
            <UInput
              v-model="form.cost_date"
              type="date"
              class="w-full"
              dir="ltr"
            />
          </UFormField>
          <UFormField
            label="العنوان"
            required
          >
            <UInput
              v-model="form.title"
              class="w-full"
              placeholder="مثال: كهرباء / مياه / عمال"
            />
          </UFormField>
          <UFormField
            label="المبلغ"
            required
          >
            <DecimalInput
              :model-value="form.amount"
              placeholder="0.00"
              @update:model-value="setAmount"
            />
          </UFormField>
          <UFormField label="ملاحظات">
            <UTextarea
              v-model="form.notes"
              class="w-full"
              :rows="3"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            @click="modalOpen = false"
          >
            إلغاء
          </UButton>
          <UButton
            :loading="saving"
            @click="save"
          >
            حفظ
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
