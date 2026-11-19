<script setup lang="ts">
import { formatMoney, formatNumber, signedTone } from '~/utils/formatNumber'
import { accountTypeLabel } from '~/utils/accountType'

const {
  initialLoading,
  isRefreshing,
  saving,
  search,
  selectedProductId,
  selectedAccountTypeId,
  productOptions,
  formProductOptions,
  accountTypeOptions,
  hasActiveFilters,
  resetFilters,
  emptyMessage,
  modalOpen,
  editing,
  form,
  filtered,
  suppliers,
  activeSeasonName,
  openCreate,
  openEdit,
  save,
  setFormDecimal,
  softDelete
} = useSuppliers()

const numCell = 'p-3 text-base font-semibold tabular-nums text-highlighted'
/** Color only — omit text-highlighted so signed tones are not overridden. */
const signedNumCell = (n: number | null | undefined) => {
  const tone = signedTone(n)
  const color =
    tone === 'error'
      ? 'text-error'
      : tone === 'warning'
        ? 'text-warning'
        : 'text-success'
  return `p-3 text-base font-semibold tabular-nums ${color}`
}

/** Sticky actions on the physical left while the RTL table scrolls horizontally. */
const stickyActions
  = 'sticky left-0 z-20 w-32 bg-elevated group-hover:bg-muted/60 shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.18)] dark:shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.45)]'
const stickyActionsHead
  = 'sticky left-0 z-30 w-32 bg-accented shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.18)] dark:shadow-[-6px_0_10px_-6px_rgba(0,0,0,0.45)]'
</script>

<template>
  <div class="space-y-6">
    <PageHeader
      title="الموردون"
      description="أرصدة الموسم النشط — كمية، تسليم، نقدية"
      :season-name="activeSeasonName"
    >
      <template #actions>
        <UButton
          icon="i-lucide-plus"
          :disabled="initialLoading"
          @click="openCreate"
        >
          إضافة مورد
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
      <TableSkeleton />
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
            class="w-full min-w-[960px] text-center text-sm"
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
                  أردب مشتراة
                </th>
                <th class="p-3 font-semibold whitespace-nowrap">
                  أردب مستلمة
                </th>
                <th class="p-3 font-semibold whitespace-nowrap">
                  باقي أردب
                </th>
                <th class="p-3 font-semibold whitespace-nowrap">
                  إجمالي المشتريات
                </th>
                <th class="p-3 font-semibold whitespace-nowrap">
                  المحوّل
                </th>
                <th class="p-3 font-semibold whitespace-nowrap">
                  المستحق
                </th>
                <th :class="[stickyActionsHead, 'p-3 font-semibold whitespace-nowrap']">
                  إجراءات
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in filtered"
                :key="`${row.supplier_id}-${row.product_id}`"
                class="group border-t border-default hover:bg-muted/60"
              >
                <td class="p-3 font-medium">
                  <div class="flex items-center gap-2">
                    <span
                      class="inline-block size-3 shrink-0 rounded-full border border-default"
                      :style="{ backgroundColor: row.color || '#64748b' }"
                      :title="row.color || '#64748b'"
                    />
                    <NuxtLink
                      :to="`/suppliers/${row.supplier_id}/${row.product_id}`"
                      class="hover:text-primary hover:underline"
                    >
                      {{ row.supplier_name }}
                    </NuxtLink>
                  </div>
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
                  {{ formatNumber(row.ardab_total) }}
                </td>
                <td
                  :class="numCell"
                  dir="ltr"
                >
                  {{ formatNumber(row.ardab_delivered) }}
                </td>
                <td
                  :class="signedNumCell(row.ardab_remaining)"
                  dir="ltr"
                >
                  {{ formatNumber(row.ardab_remaining) }}
                </td>
                <td
                  :class="numCell"
                  dir="ltr"
                >
                  {{ formatMoney(row.purchases_total) }}
                </td>
                <td
                  :class="numCell"
                  dir="ltr"
                >
                  {{ formatMoney(row.transfers_total) }}
                </td>
                <td
                  :class="signedNumCell(row.balance)"
                  dir="ltr"
                >
                  {{ formatMoney(row.balance) }}
                </td>
                <td :class="[stickyActions, 'p-3']">
                  <div class="flex justify-center gap-1">
                    <UButton
                      size="sm"
                      variant="ghost"
                      icon="i-lucide-eye"
                      :to="`/suppliers/${row.supplier_id}/${row.product_id}`"
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
                  colspan="10"
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
                        v-else-if="!suppliers.length"
                        size="sm"
                        icon="i-lucide-plus"
                        @click="openCreate"
                      >
                        إضافة مورد
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
      :title="editing ? 'تعديل ملف المورد' : 'إضافة ملف مورد'"
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
              placeholder="مثال: شركة أحمد / استثمار محمود"
            />
          </UFormField>
          <UFormField
            label="النوع"
            required
          >
            <AccountTypeField v-model="form.account_type_id" />
          </UFormField>
          <UFormField
            label="الصنف"
            required
          >
            <USelectMenu
              v-model="form.product_id"
              :items="formProductOptions"
              value-key="value"
              label-key="label"
              class="w-full"
              placeholder="اختر الصنف"
              :disabled="!!editing"
            />
          </UFormField>
          <UFormField
            label="معامل الأردب (كجم)"
            required
          >
            <DecimalInput
              :model-value="form.ardab_factor"
              class="w-full"
              @update:model-value="setFormDecimal('ardab_factor', $event)"
            />
          </UFormField>
          <UFormField label="لون الملف">
            <div class="flex items-center gap-3">
              <input
                v-model="form.color"
                type="color"
                class="size-10 cursor-pointer rounded-md border border-default bg-transparent p-1"
                :title="form.color"
              >
              <UInput
                v-model="form.color"
                class="w-full font-mono uppercase"
                dir="ltr"
                placeholder="#64748B"
                maxlength="7"
              />
            </div>
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
