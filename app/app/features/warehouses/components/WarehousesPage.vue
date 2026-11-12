<script setup lang="ts">
import { formatNumber } from '~/utils/formatNumber'
import { accountTypeLabel } from '~/utils/accountType'

const {
  initialLoading,
  isRefreshing,
  saving,
  search,
  selectedProductId,
  selectedAccountTypeId,
  productOptions,
  accountTypeOptions,
  hasActiveFilters,
  resetFilters,
  emptyMessage,
  modalOpen,
  editing,
  form,
  filtered,
  warehouses,
  activeSeasonName,
  openCreate,
  openEdit,
  save,
  softDelete
} = useWarehouses()

const warehouseDetailTo = (row: { warehouse_id: string, product_id?: string | null }) => {
  if (row.product_id) {
    return { path: `/warehouses/${row.warehouse_id}`, query: { product: row.product_id } }
  }
  return `/warehouses/${row.warehouse_id}`
}

const numCell = 'p-3 text-base font-semibold tabular-nums text-highlighted'

/** Sticky actions on the physical left while the RTL table scrolls horizontally. */
const stickyActions
  = 'sticky left-0 z-20 w-32 bg-elevated group-hover:bg-muted/60 shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.18)] dark:shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.45)]'
const stickyActionsHead
  = 'sticky left-0 z-30 w-32 bg-accented shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.18)] dark:shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.45)]'
</script>

<template>
  <div class="space-y-6">
    <PageHeader
      title="الشون"
      description="أرصدة الموسم النشط — وارد التسليمات"
      :season-name="activeSeasonName"
    >
      <template #actions>
        <UButton
          icon="i-lucide-plus"
          :disabled="initialLoading"
          @click="openCreate"
        >
          إضافة شونة
        </UButton>
      </template>
    </PageHeader>

    <SuppliersFilters
      v-model:search="search"
      v-model:account-type-id="selectedAccountTypeId"
      v-model:product-id="selectedProductId"
      :account-type-options="accountTypeOptions"
      :product-options="productOptions"
      :disabled="initialLoading"
      :refreshing="isRefreshing"
      :show-reset="hasActiveFilters"
      @reset="resetFilters"
    />

    <div v-if="initialLoading">
      <TableSkeleton :cols="6" />
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
            class="w-full min-w-[720px] text-center text-sm"
          >
            <thead class="bg-accented text-highlighted">
              <tr>
                <th class="p-3 font-semibold whitespace-nowrap">
                  الاسم
                </th>
                <th class="p-3 font-semibold whitespace-nowrap">
                  النوع
                </th>
                <th class="p-3 font-semibold whitespace-nowrap">
                  الصنف
                </th>
                <th class="p-3 font-semibold whitespace-nowrap">
                  الرصيد (كجم)
                </th>
                <th class="p-3 font-semibold whitespace-nowrap">
                  الرصيد (أردب)
                </th>
                <th :class="[stickyActionsHead, 'p-3 font-semibold whitespace-nowrap']">
                  إجراءات
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in filtered"
                :key="`${row.warehouse_id}-${row.product_id || 'none'}`"
                class="group border-t border-default hover:bg-muted/60"
              >
                <td class="p-3 font-medium">
                  <NuxtLink
                    :to="warehouseDetailTo(row)"
                    class="hover:text-primary hover:underline"
                  >
                    {{ row.warehouse_name }}
                  </NuxtLink>
                  <p
                    v-if="row.notes"
                    class="mt-0.5 text-xs font-normal text-muted"
                  >
                    {{ row.notes }}
                  </p>
                </td>
                <td class="p-3">
                  {{ accountTypeLabel(row.account_type_name) }}
                </td>
                <td class="p-3">
                  {{ row.product_name || '—' }}
                </td>
                <td
                  :class="numCell"
                  dir="ltr"
                >
                  {{ formatNumber(row.kg_total) }}
                </td>
                <td
                  :class="numCell"
                  dir="ltr"
                >
                  {{ formatNumber(row.ardab_total) }}
                </td>
                <td :class="[stickyActions, 'p-3']">
                  <div class="flex justify-center gap-1">
                    <UButton
                      size="sm"
                      variant="ghost"
                      icon="i-lucide-eye"
                      :to="warehouseDetailTo(row)"
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
                <td
                  colspan="6"
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
                        إعادة ضبط التصفية
                      </UButton>
                      <UButton
                        v-else-if="!warehouses.length"
                        size="sm"
                        icon="i-lucide-plus"
                        @click="openCreate"
                      >
                        إضافة شونة
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
      :title="editing ? 'تعديل الشونة' : 'إضافة شونة'"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="الاسم"
            required
          >
            <UInput
              v-model="form.name"
              class="w-full"
              placeholder="مثال: شونة طنطا"
            />
          </UFormField>
          <UFormField
            label="النوع"
            required
          >
            <AccountTypeField v-model="form.account_type_id" />
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
