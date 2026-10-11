<script setup lang="ts">
import { formatMoney, formatNumber } from '~/utils/formatNumber'
import { accountTypeLabel } from '~/utils/accountType'

const props = defineProps<{
  warehouseId: string
}>()

const {
  loading,
  saving,
  warehouse,
  filteredSectionCards,
  warehouseLedgerCard,
  warehouseStats,
  expenses,
  expensesTotal,
  expenseForm,
  isExpenseCreating,
  isExpenseRowEditing,
  selectedProductId,
  productOptions,
  activeSeasonName,
  sectionModalOpen,
  sectionForm,
  transferModalOpen,
  transferScope,
  transferFromSection,
  transferForm,
  transferToOptions,
  destWarehouseOptions,
  transferAvailableKg,
  transferAllocation,
  transferStatusOptions,
  openCreateSection,
  openEditSection,
  saveSection,
  softDeleteSection,
  openCreateExpense,
  openEditExpense,
  cancelExpenseInline,
  onExpenseKey,
  saveExpense,
  deleteExpense,
  openTransfer,
  openWarehouseTransfer,
  openEditMovement,
  deleteMovement,
  cancelTransfer,
  onTransferKindChange,
  onTransferWarehouseChange,
  saveTransfer,
  saveWasteAllRemaining,
  setTransferQty,
  setExpenseAmount,
  accountTypeName,
  editingMovementId
} = useWarehouseDetail(() => props.warehouseId)

const transferKindOptions = [
  { label: 'مخزن', value: 'store' },
  { label: 'مقلى', value: 'mekla' },
  { label: 'شونة', value: 'warehouse' }
]

const statsCardUi = { body: 'p-2 sm:p-2.5' }

/** Warehouse ledger in/out: fill available width, expand with content (no inner scroll) */
const tableClass = 'w-max min-w-full border-collapse text-sm text-center whitespace-nowrap tabular-nums'
const tablePanelClass = 'flex min-w-max flex-1 flex-col rounded-lg border border-default'
const tablesRowClass = 'flex w-max min-w-full items-stretch gap-3'

const expensesModalOpen = ref(false)

const openExpensesModal = () => {
  cancelExpenseInline()
  expensesModalOpen.value = true
}

watch(expensesModalOpen, (open) => {
  if (!open) cancelExpenseInline()
})

/** Section in/out: fill available width, expand for notes (no overflow-x) */
const sectionTablesRowClass = 'flex w-max min-w-full items-stretch gap-3'
const sectionTablePanelClass = 'flex min-w-max flex-1 flex-col rounded-lg border border-default'
const sectionTableClass = 'w-max min-w-full border-collapse text-sm text-center whitespace-nowrap tabular-nums'
const sectionStatsClass = 'flex flex-nowrap items-center gap-1.5 tabular-nums text-sm'
const cellNowrapClass = 'p-2 whitespace-nowrap'
const notesThClass = 'p-2 font-medium whitespace-nowrap'
const notesTdClass = 'p-2 text-muted text-start whitespace-nowrap'

const sectionRowKey = (card: { section_id: string, product_id?: string | null, status_id?: string | null }) =>
  `${card.section_id}:${card.product_id || 'none'}:${card.status_id || 'none'}`

const cellInputUi = { base: 'px-1.5 py-1.5 text-sm rounded-sm tabular-nums' }
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-nowrap items-center gap-2 sm:gap-3">
      <div class="flex min-w-0 shrink items-center gap-2">
        <UButton
          to="/warehouses"
          variant="ghost"
          color="neutral"
          icon="i-lucide-arrow-right"
          size="sm"
          aria-label="رجوع"
        />
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="truncate text-2xl font-semibold tracking-tight text-highlighted">
              {{ warehouse?.name || 'الشونة' }}
            </h2>
            <UBadge
              v-if="accountTypeName"
              variant="subtle"
              size="sm"
              color="neutral"
            >
              {{ accountTypeLabel(accountTypeName) }}
            </UBadge>
            <UBadge
              v-if="activeSeasonName"
              variant="subtle"
              size="sm"
              color="warning"
            >
              {{ activeSeasonName }}
            </UBadge>
          </div>
          <p v-if="warehouse?.notes" class="mt-1 truncate text-sm text-muted">
            {{ warehouse.notes }}
          </p>
        </div>
      </div>

      <div
        v-if="!loading"
        class="homos-scroll mx-auto flex min-w-0 flex-1 flex-nowrap items-stretch justify-center gap-1.5 overflow-x-auto tabular-nums"
      >
        <UCard class="min-w-20 shrink-0 text-center" :ui="statsCardUi">
          <p class="text-xs font-medium text-muted">
            الأرباع
          </p>
          <p class="mt-0.5 text-base font-semibold tracking-tight text-highlighted" dir="ltr">
            {{ warehouseStats.sectionsCount }}
          </p>
        </UCard>
        <UCard class="min-w-24 shrink-0 text-center" :ui="statsCardUi">
          <p class="text-xs font-medium text-muted">
            وارد
          </p>
          <p class="mt-0.5 text-base font-semibold tracking-tight text-highlighted" dir="ltr">
            {{ formatNumber(warehouseStats.kgIn) }}
          </p>
        </UCard>
        <UCard class="min-w-24 shrink-0 text-center" :ui="statsCardUi">
          <p class="text-xs font-medium text-muted">
            منصرف
          </p>
          <p class="mt-0.5 text-base font-semibold tracking-tight text-highlighted" dir="ltr">
            {{ formatNumber(warehouseStats.kgOut) }}
          </p>
        </UCard>
        <UCard class="min-w-24 shrink-0 text-center" :ui="statsCardUi">
          <p class="text-xs font-medium text-muted">
            الرصيد
          </p>
          <p class="mt-0.5 text-base font-semibold tracking-tight text-highlighted" dir="ltr">
            {{ formatNumber(warehouseStats.kgRemaining) }}
          </p>
        </UCard>
        <UCard class="min-w-24 shrink-0 text-center" :ui="statsCardUi">
          <p class="text-xs font-medium text-muted">
            نسبة المتبقي
          </p>
          <p class="mt-0.5 text-base font-semibold tracking-tight text-highlighted" dir="ltr">
            {{ formatNumber(warehouseStats.wasteRatio * 100) }}%
          </p>
        </UCard>
      </div>

      <div class="flex shrink-0 flex-nowrap items-center justify-end gap-2">
        <USelect
          v-if="!loading"
          v-model="selectedProductId"
          :items="productOptions"
          value-key="value"
          label-key="label"
          class="w-40 shrink-0"
          placeholder="الصنف"
        />
        <UButton
          v-if="!loading"
          icon="i-lucide-wallet"
          size="sm"
          color="error"
          variant="soft"
          class="shrink-0"
          :disabled="!activeSeasonName"
          @click="openExpensesModal"
        >
          مصروفات
          <UBadge
            v-if="expenses.length"
            size="sm"
            variant="solid"
            color="error"
            class="ms-1"
          >
            {{ expenses.length }}
          </UBadge>
          <span
            v-if="expenses.length"
            class="ms-1 tabular-nums opacity-90"
            dir="ltr"
          >
            {{ formatMoney(expensesTotal) }}
          </span>
        </UButton>
        <UButton
          v-if="!loading"
          icon="i-lucide-arrow-left-right"
          size="sm"
          color="warning"
          variant="soft"
          class="shrink-0"
          :disabled="!selectedProductId || warehouseStats.kgRemaining <= 0.001"
          @click="openWarehouseTransfer"
        >
          تحويل من الشونة
        </UButton>
        <UButton
          v-if="!loading"
          icon="i-lucide-trash-2"
          size="sm"
          color="neutral"
          variant="soft"
          class="shrink-0"
          :loading="saving"
          :disabled="!selectedProductId || warehouseStats.kgRemaining <= 0.001"
          @click="saveWasteAllRemaining"
        >
          تسجيل هدر
        </UButton>
        <UButton
          icon="i-lucide-plus"
          size="sm"
          class="shrink-0"
          @click="openCreateSection"
        >
          إضافة ربع
        </UButton>
      </div>
    </div>

    <!-- Excel-style inline transfer row (no modal) -->
    <div
      v-if="transferModalOpen"
      class="homos-scroll w-full overflow-x-auto rounded-lg border border-warning/40 bg-warning/5"
    >
      <div class="flex w-max min-w-full items-end gap-2 p-3">
        <div class="min-w-40 shrink-0">
          <p class="mb-1 text-xs text-muted">
            المصدر
          </p>
          <p class="text-sm font-medium text-highlighted whitespace-nowrap">
            <template v-if="editingMovementId">
              تعديل تحويل — {{ transferFromSection?.section_name }}
            </template>
            <template v-else-if="transferScope === 'section'">
              {{ transferFromSection?.section_name }}
            </template>
            <template v-else>
              الشونة (توزيع تلقائي)
            </template>
            <span class="ms-1 text-muted font-normal" dir="ltr">
              ({{ formatNumber(transferAvailableKg) }} كجم)
            </span>
          </p>
        </div>
        <div class="w-36 shrink-0">
          <p class="mb-1 text-xs text-muted">
            التاريخ
          </p>
          <UInput v-model="transferForm.movement_date" type="date" class="w-full" dir="ltr" :ui="cellInputUi" />
        </div>
        <div class="w-32 shrink-0">
          <p class="mb-1 text-xs text-muted">
            الحالة
          </p>
          <USelect
            v-model="transferForm.status_id"
            :items="transferStatusOptions"
            value-key="value"
            label-key="label"
            class="w-full"
            placeholder="الحالة"
          />
        </div>
        <div class="w-32 shrink-0">
          <p class="mb-1 text-xs text-muted">
            نوع الوجهة
          </p>
          <USelect
            v-model="transferForm.to_kind"
            :items="transferKindOptions"
            value-key="value"
            label-key="label"
            class="w-full"
            @update:model-value="onTransferKindChange"
          />
        </div>
        <div
          v-if="transferForm.to_kind === 'warehouse'"
          class="w-52 shrink-0"
        >
          <p class="mb-1 text-xs text-muted">
            الشونة
          </p>
          <USelect
            v-model="transferForm.to_warehouse_id"
            :items="destWarehouseOptions"
            value-key="value"
            label-key="label"
            class="w-full"
            placeholder="الشونة"
            @update:model-value="onTransferWarehouseChange"
          />
        </div>
        <div class="w-40 shrink-0">
          <p class="mb-1 text-xs text-muted">
            {{ transferForm.to_kind === 'warehouse' ? 'الربع' : 'الوجهة' }}
          </p>
          <USelect
            v-model="transferForm.to_id"
            :items="transferToOptions"
            value-key="value"
            label-key="label"
            class="w-full"
            :placeholder="transferForm.to_kind === 'warehouse' ? 'الربع' : 'الوجهة'"
          />
        </div>
        <div class="w-28 shrink-0">
          <p class="mb-1 text-xs text-muted">
            الكمية
          </p>
          <DecimalInput
            :model-value="transferForm.quantity_kg"
            placeholder="كجم"
            @update:model-value="setTransferQty"
          />
        </div>
        <div class="w-44 shrink-0">
          <p class="mb-1 text-xs text-muted">
            ملاحظات
          </p>
          <UInput v-model="transferForm.notes" class="w-full" :ui="cellInputUi" />
        </div>
        <div class="flex shrink-0 items-center gap-1 pb-0.5">
          <UButton
            size="sm"
            :loading="saving"
            :disabled="!editingMovementId && !transferAllocation.ok"
            @click="saveTransfer"
          >
            {{ editingMovementId ? 'تحديث' : 'حفظ' }}
          </UButton>
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            @click="cancelTransfer"
          >
            إلغاء
          </UButton>
        </div>
      </div>
      <div
        v-if="transferForm.quantity_kg && Number(transferForm.quantity_kg) > 0"
        class="border-t border-default px-3 py-2 text-sm"
      >
        <p
          v-if="!transferAllocation.ok"
          class="text-error"
        >
          الرصيد غير كافٍ — المتاح
          <span dir="ltr">{{ formatNumber(transferAllocation.total) }}</span>
          كجم
        </p>
        <div
          v-else
          class="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted"
        >
          <span class="font-medium text-highlighted">
            خطة التوزيع
          </span>
          <span
            v-for="line in transferAllocation.plan"
            :key="`${line.section_id}-${line.status_id}`"
            class="whitespace-nowrap"
          >
            {{ line.section_name }}:
            <span dir="ltr" class="font-medium text-highlighted">{{ formatNumber(line.qty) }}</span>
          </span>
        </div>
      </div>
    </div>

    <div v-if="loading">
      <CardsSkeleton :count="2" />
    </div>

    <template v-else>
      <div class="max-h-[calc(100dvh-11.5rem)] w-full overflow-x-auto overflow-y-hidden">
        <div class="flex h-full max-h-[calc(100dvh-11.5rem)] w-full min-w-max items-stretch gap-4">
          <!-- Col 1 (RTL first): sections -->
          <div class="homos-scroll min-h-0 min-w-max max-h-full flex-1 overflow-x-hidden overflow-y-auto pe-1">
            <div
              v-if="!filteredSectionCards.length"
              class="rounded-lg border border-default bg-elevated/40 p-8 text-center text-muted"
            >
              {{ selectedProductId ? 'لا توجد أرباع لهذا الصنف' : 'لا توجد أرباع — أضف ربعاً للبدء' }}
            </div>
            <div
              v-else
              class="flex w-max min-w-full flex-col gap-4"
            >
          <UCard
            v-for="card in filteredSectionCards"
            :key="sectionRowKey(card)"
            class="w-max min-w-full"
            :ui="{ body: 'flex w-max min-w-full flex-col gap-3 space-y-0 overflow-visible p-4 sm:p-5' }"
          >
            <div class="flex shrink-0 flex-nowrap items-center gap-3">
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <span class="h-4 w-1 shrink-0 rounded-full bg-warning" />
                <h3 class="text-lg font-semibold text-highlighted whitespace-nowrap">
                  {{ card.section_name }}
                </h3>
                <div :class="sectionStatsClass">
                  <div class="shrink-0 rounded-md bg-elevated/80 px-2.5 py-1 text-center">
                    <span class="text-xs text-muted">وارد</span>
                    <span class="ms-1.5 font-semibold" dir="ltr">
                      {{ formatNumber(card.kg_in) }}
                    </span>
                  </div>
                  <div class="shrink-0 rounded-md bg-elevated/80 px-2.5 py-1 text-center">
                    <span class="text-xs text-muted">منصرف</span>
                    <span class="ms-1.5 font-semibold" dir="ltr">
                      {{ formatNumber(card.kg_out) }}
                    </span>
                  </div>
                  <div class="shrink-0 rounded-md bg-warning/10 px-2.5 py-1 text-center">
                    <span class="text-xs text-muted">رصيد</span>
                    <span class="ms-1.5 font-semibold text-highlighted" dir="ltr">
                      {{ formatNumber(card.kg_remaining) }}
                    </span>
                  </div>
                </div>
                <p v-if="card.notes" class="w-full text-sm text-muted">
                  {{ card.notes }}
                </p>
              </div>

              <div class="ms-auto flex shrink-0 justify-end gap-1">
                <UButton
                  size="sm"
                  variant="soft"
                  color="warning"
                  icon="i-lucide-arrow-left-right"
                  :disabled="Number(card.kg_remaining) <= 0.001"
                  @click="openTransfer(card)"
                >
                  تحويل
                </UButton>
                <UButton
                  size="sm"
                  variant="ghost"
                  icon="i-lucide-pencil"
                  @click="openEditSection(card)"
                />
                <UButton
                  size="sm"
                  variant="ghost"
                  color="error"
                  icon="i-lucide-trash-2"
                  :disabled="saving"
                  @click="softDeleteSection(card)"
                />
              </div>
            </div>

            <div :class="sectionTablesRowClass">
                <div :class="sectionTablePanelClass">
                  <div class="flex shrink-0 items-center gap-2 border-b border-default bg-elevated/70 px-3 py-2">
                    <UIcon name="i-lucide-arrow-down-left" class="size-4 text-success" />
                    <p class="text-sm font-semibold text-highlighted">
                      الوارد إلى الربع
                    </p>
                    <UBadge size="sm" variant="subtle" color="neutral">
                      {{ card.incoming.length }}
                    </UBadge>
                  </div>
                    <table dir="rtl" :class="sectionTableClass">
                      <thead class="bg-elevated text-muted">
                        <tr>
                          <th :class="cellNowrapClass + ' font-medium'">
                            التاريخ
                          </th>
                          <th :class="cellNowrapClass + ' font-medium text-start'">
                            المصدر
                          </th>
                          <th :class="cellNowrapClass + ' font-medium'">
                            قبل
                          </th>
                          <th :class="cellNowrapClass + ' font-medium'">
                            كجم
                          </th>
                          <th :class="cellNowrapClass + ' font-medium'">
                            بعد
                          </th>
                          <th :class="notesThClass">
                            ملاحظات
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="row in card.incoming"
                          :key="`in-${row.id}`"
                          class="border-t border-default"
                        >
                          <td :class="cellNowrapClass" dir="ltr">
                            {{ row.date }}
                          </td>
                          <td :class="cellNowrapClass + ' text-start'">
                            {{ row.source }}
                          </td>
                          <td :class="cellNowrapClass + ' text-muted'" dir="ltr">
                            {{ formatNumber(row.qty_before) }}
                          </td>
                          <td :class="cellNowrapClass + ' font-medium'" dir="ltr">
                            {{ formatNumber(row.quantity_kg) }}
                          </td>
                          <td :class="cellNowrapClass + ' font-medium text-highlighted'" dir="ltr">
                            {{ formatNumber(row.qty_after) }}
                          </td>
                          <td :class="notesTdClass">
                            {{ row.notes || '—' }}
                          </td>
                        </tr>
                        <tr v-if="!card.incoming.length">
                          <td colspan="6" class="p-4 text-center text-muted">
                            لا يوجد وارد
                          </td>
                        </tr>
                      </tbody>
                    </table>
                </div>

                <div :class="sectionTablePanelClass">
                  <div class="flex shrink-0 items-center gap-2 border-b border-default bg-elevated/70 px-3 py-2">
                    <UIcon name="i-lucide-arrow-up-right" class="size-4 text-warning" />
                    <p class="text-sm font-semibold text-highlighted">
                      المنصرف من الربع
                    </p>
                    <UBadge size="sm" variant="subtle" color="neutral">
                      {{ card.outgoing.length }}
                    </UBadge>
                  </div>
                  <table dir="rtl" :class="sectionTableClass">
                    <thead class="bg-elevated text-muted">
                      <tr>
                        <th :class="cellNowrapClass + ' font-medium'">
                          التاريخ
                        </th>
                        <th :class="cellNowrapClass + ' font-medium text-start'">
                          الوجهة
                        </th>
                        <th :class="cellNowrapClass + ' font-medium text-start'">
                          الحالة
                        </th>
                        <th :class="cellNowrapClass + ' font-medium'">
                          قبل
                        </th>
                        <th :class="cellNowrapClass + ' font-medium'">
                          كجم
                        </th>
                        <th :class="cellNowrapClass + ' font-medium'">
                          بعد
                        </th>
                        <th :class="notesThClass">
                          ملاحظات
                        </th>
                        <th :class="cellNowrapClass + ' font-medium'">
                          إجراءات
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="row in card.outgoing"
                        :key="`out-${row.id}`"
                        class="border-t border-default"
                      >
                        <td :class="cellNowrapClass" dir="ltr">
                          {{ row.date }}
                        </td>
                        <td :class="cellNowrapClass + ' text-start'">
                          {{ row.destination }}
                        </td>
                        <td :class="cellNowrapClass + ' text-start'">
                          {{ row.status_name || card.status_name || '—' }}
                        </td>
                        <td :class="cellNowrapClass + ' text-muted'" dir="ltr">
                          {{ formatNumber(row.qty_before) }}
                        </td>
                        <td :class="cellNowrapClass + ' font-medium'" dir="ltr">
                          {{ formatNumber(row.quantity_kg) }}
                        </td>
                        <td :class="cellNowrapClass + ' font-medium text-highlighted'" dir="ltr">
                          {{ formatNumber(row.qty_after) }}
                        </td>
                        <td :class="notesTdClass">
                          {{ row.notes || '—' }}
                        </td>
                        <td class="p-1">
                          <div class="flex justify-center gap-0.5">
                            <UButton
                              size="xs"
                              variant="ghost"
                              icon="i-lucide-pencil"
                              @click="openEditMovement(row)"
                            />
                            <UButton
                              size="xs"
                              variant="ghost"
                              color="error"
                              icon="i-lucide-trash-2"
                              :disabled="saving"
                              @click="deleteMovement(row)"
                            />
                          </div>
                        </td>
                      </tr>
                      <tr v-if="!card.outgoing.length">
                        <td colspan="8" class="p-4 text-center text-muted">
                          لا يوجد منصرف
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
          </UCard>
          </div>
        </div>

        <!-- Col 2: warehouse in / out -->
        <UCard
          class="homos-scroll max-h-full w-max shrink-0 overflow-x-hidden overflow-y-auto"
          :ui="{ body: 'flex flex-col gap-3 space-y-0 overflow-visible p-4 sm:p-5' }"
        >
          <div class="flex shrink-0 flex-nowrap items-center gap-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="h-4 w-1 shrink-0 rounded-full bg-primary" />
              <h3 class="text-base font-semibold text-highlighted whitespace-nowrap">
                إجمالي حركات الشونة
              </h3>
              <div :class="sectionStatsClass">
                <div class="shrink-0 rounded-md bg-elevated/80 px-2.5 py-1 text-center">
                  <span class="text-xs text-muted">وارد</span>
                  <span class="ms-1.5 font-semibold" dir="ltr">
                    {{ formatNumber(warehouseLedgerCard.kg_in) }}
                  </span>
                </div>
                <div class="shrink-0 rounded-md bg-elevated/80 px-2.5 py-1 text-center">
                  <span class="text-xs text-muted">منصرف</span>
                  <span class="ms-1.5 font-semibold" dir="ltr">
                    {{ formatNumber(warehouseLedgerCard.kg_out) }}
                  </span>
                </div>
                <div class="shrink-0 rounded-md bg-warning/10 px-2.5 py-1 text-center">
                  <span class="text-xs text-muted">رصيد</span>
                  <span class="ms-1.5 font-semibold text-highlighted" dir="ltr">
                    {{ formatNumber(warehouseLedgerCard.kg_remaining) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div :class="tablesRowClass">
              <div :class="tablePanelClass">
                <div class="flex shrink-0 items-center gap-2 border-b border-default bg-elevated/70 px-3 py-2">
                  <UIcon name="i-lucide-arrow-down-left" class="size-4 text-success" />
                  <p class="text-sm font-semibold text-highlighted">
                    الوارد إلى الشونة
                  </p>
                  <UBadge size="sm" variant="subtle" color="neutral">
                    {{ warehouseLedgerCard.incoming.length }}
                  </UBadge>
                </div>
                <table dir="rtl" :class="tableClass">
                  <thead class="bg-elevated text-muted">
                    <tr>
                      <th :class="cellNowrapClass + ' font-medium'">
                        التاريخ
                      </th>
                      <th :class="cellNowrapClass + ' font-medium text-start'">
                        الربع
                      </th>
                      <th :class="cellNowrapClass + ' font-medium text-start'">
                        الصنف
                      </th>
                      <th :class="cellNowrapClass + ' font-medium text-start'">
                        المصدر
                      </th>
                      <th :class="cellNowrapClass + ' font-medium'">
                        قبل
                      </th>
                      <th :class="cellNowrapClass + ' font-medium'">
                        كجم
                      </th>
                      <th :class="cellNowrapClass + ' font-medium'">
                        بعد
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in warehouseLedgerCard.incoming"
                      :key="`wh-in-${row.id}`"
                      class="border-t border-default"
                    >
                      <td :class="cellNowrapClass" dir="ltr">
                        {{ row.date }}
                      </td>
                      <td :class="cellNowrapClass + ' text-start font-medium'">
                        {{ row.section_name }}
                      </td>
                      <td :class="cellNowrapClass + ' text-start'">
                        {{ row.product_name || '—' }}
                      </td>
                      <td :class="cellNowrapClass + ' text-start'">
                        {{ row.source }}
                      </td>
                      <td :class="cellNowrapClass + ' text-muted'" dir="ltr">
                        {{ formatNumber(row.qty_before) }}
                      </td>
                      <td :class="cellNowrapClass + ' font-medium'" dir="ltr">
                        {{ formatNumber(row.quantity_kg) }}
                      </td>
                      <td :class="cellNowrapClass + ' font-medium text-highlighted'" dir="ltr">
                        {{ formatNumber(row.qty_after) }}
                      </td>
                    </tr>
                    <tr v-if="!warehouseLedgerCard.incoming.length">
                      <td colspan="7" class="p-4 text-center text-muted">
                        لا يوجد وارد
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div :class="tablePanelClass">
                <div class="flex shrink-0 items-center gap-2 border-b border-default bg-elevated/70 px-3 py-2">
                  <UIcon name="i-lucide-arrow-up-right" class="size-4 text-warning" />
                  <p class="text-sm font-semibold text-highlighted">
                    المنصرف من الشونة
                  </p>
                  <UBadge size="sm" variant="subtle" color="neutral">
                    {{ warehouseLedgerCard.outgoing.length }}
                  </UBadge>
                </div>
                <table dir="rtl" :class="tableClass">
                  <thead class="bg-elevated text-muted">
                    <tr>
                      <th :class="cellNowrapClass + ' font-medium'">
                        التاريخ
                      </th>
                      <th :class="cellNowrapClass + ' font-medium text-start'">
                        الربع
                      </th>
                      <th :class="cellNowrapClass + ' font-medium text-start'">
                        الصنف
                      </th>
                      <th :class="cellNowrapClass + ' font-medium text-start'">
                        الحالة
                      </th>
                      <th :class="cellNowrapClass + ' font-medium text-start'">
                        الوجهة
                      </th>
                      <th :class="cellNowrapClass + ' font-medium'">
                        قبل
                      </th>
                      <th :class="cellNowrapClass + ' font-medium'">
                        كجم
                      </th>
                      <th :class="cellNowrapClass + ' font-medium'">
                        بعد
                      </th>
                      <th :class="cellNowrapClass + ' font-medium'">
                        إجراءات
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in warehouseLedgerCard.outgoing"
                      :key="`wh-out-${row.id}`"
                      class="border-t border-default"
                    >
                      <td :class="cellNowrapClass" dir="ltr">
                        {{ row.date }}
                      </td>
                      <td :class="cellNowrapClass + ' text-start font-medium'">
                        {{ row.section_name }}
                      </td>
                      <td :class="cellNowrapClass + ' text-start'">
                        {{ row.product_name || '—' }}
                      </td>
                      <td :class="cellNowrapClass + ' text-start'">
                        {{ row.status_name || '—' }}
                      </td>
                      <td :class="cellNowrapClass + ' text-start'">
                        {{ row.destination }}
                      </td>
                      <td :class="cellNowrapClass + ' text-muted'" dir="ltr">
                        {{ formatNumber(row.qty_before) }}
                      </td>
                      <td :class="cellNowrapClass + ' font-medium'" dir="ltr">
                        {{ formatNumber(row.quantity_kg) }}
                      </td>
                      <td :class="cellNowrapClass + ' font-medium text-highlighted'" dir="ltr">
                        {{ formatNumber(row.qty_after) }}
                      </td>
                      <td class="p-1">
                        <div class="flex justify-center gap-0.5">
                          <UButton
                            size="xs"
                            variant="ghost"
                            icon="i-lucide-pencil"
                            @click="openEditMovement(row)"
                          />
                          <UButton
                            size="xs"
                            variant="ghost"
                            color="error"
                            icon="i-lucide-trash-2"
                            :disabled="saving"
                            @click="deleteMovement(row)"
                          />
                        </div>
                      </td>
                    </tr>
                    <tr v-if="!warehouseLedgerCard.outgoing.length">
                      <td colspan="9" class="p-4 text-center text-muted">
                        لا يوجد منصرف
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
        </UCard>
        </div>
      </div>
    </template>

    <UModal v-model:open="sectionModalOpen" title="الربع">
      <template #body>
        <div class="space-y-4">
          <UFormField label="الاسم" required>
            <UInput v-model="sectionForm.name" class="w-full" placeholder="مثال: ربع أ" />
          </UFormField>
          <UFormField label="ملاحظات">
            <UTextarea v-model="sectionForm.notes" class="w-full" :rows="3" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="sectionModalOpen = false">
            إلغاء
          </UButton>
          <UButton :loading="saving" @click="saveSection">
            حفظ
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="expensesModalOpen"
      title="مصروفات الشونة"
      :ui="{ content: 'sm:max-w-3xl' }"
    >
      <template #body>
        <div class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2 text-sm text-muted">
              <UBadge size="sm" variant="subtle" color="neutral">
                {{ expenses.length }}
              </UBadge>
              <span class="tabular-nums" dir="ltr">
                الإجمالي: {{ formatMoney(expensesTotal) }}
              </span>
            </div>
            <UButton
              icon="i-lucide-plus"
              size="sm"
              :disabled="!activeSeasonName || isExpenseCreating"
              @click="openCreateExpense"
            >
              إضافة مصروف
            </UButton>
          </div>

          <div class="overflow-x-auto rounded-lg border border-default">
            <table dir="rtl" class="w-full min-w-[520px] text-sm text-center">
              <thead class="bg-elevated/60 text-muted">
                <tr>
                  <th class="p-2 font-medium whitespace-nowrap">
                    التاريخ
                  </th>
                  <th class="p-2 font-medium whitespace-nowrap">
                    المبلغ
                  </th>
                  <th class="p-2 font-medium text-start whitespace-nowrap">
                    ملاحظات
                  </th>
                  <th class="w-24 p-2 font-medium whitespace-nowrap">
                    إجراءات
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-if="isExpenseCreating"
                  class="border-t border-primary/30 bg-primary/5"
                  @keydown="onExpenseKey"
                >
                  <td class="p-1">
                    <UInput
                      v-model="expenseForm.payment_date"
                      type="date"
                      size="sm"
                      class="w-full min-w-34"
                      dir="ltr"
                      :ui="cellInputUi"
                    />
                  </td>
                  <td class="p-1">
                    <DecimalInput
                      class="w-full min-w-24"
                      :model-value="expenseForm.amount"
                      placeholder="مبلغ"
                      @update:model-value="setExpenseAmount"
                    />
                  </td>
                  <td class="p-1">
                    <UInput
                      v-model="expenseForm.notes"
                      size="sm"
                      class="w-full"
                      placeholder="كهرباء / مياه / عمال"
                      :ui="cellInputUi"
                    />
                  </td>
                  <td class="p-1">
                    <div class="flex justify-center gap-0.5">
                      <UButton
                        size="xs"
                        variant="soft"
                        icon="i-lucide-check"
                        :loading="saving"
                        @click="saveExpense"
                      />
                      <UButton
                        size="xs"
                        variant="ghost"
                        color="neutral"
                        icon="i-lucide-x"
                        :disabled="saving"
                        @click="cancelExpenseInline"
                      />
                    </div>
                  </td>
                </tr>

                <template v-for="row in expenses" :key="row.id">
                  <tr
                    v-if="isExpenseRowEditing(row)"
                    class="border-t border-primary/30 bg-primary/5"
                    @keydown="onExpenseKey"
                  >
                    <td class="p-1">
                      <UInput
                        v-model="expenseForm.payment_date"
                        type="date"
                        size="sm"
                        class="w-full min-w-34"
                        dir="ltr"
                        :ui="cellInputUi"
                      />
                    </td>
                    <td class="p-1">
                      <DecimalInput
                        class="w-full min-w-24"
                        :model-value="expenseForm.amount"
                        placeholder="مبلغ"
                        @update:model-value="setExpenseAmount"
                      />
                    </td>
                    <td class="p-1">
                      <UInput
                        v-model="expenseForm.notes"
                        size="sm"
                        class="w-full"
                        placeholder="ملاحظات"
                        :ui="cellInputUi"
                      />
                    </td>
                    <td class="p-1">
                      <div class="flex justify-center gap-0.5">
                        <UButton
                          size="xs"
                          variant="soft"
                          icon="i-lucide-check"
                          :loading="saving"
                          @click="saveExpense"
                        />
                        <UButton
                          size="xs"
                          variant="ghost"
                          color="neutral"
                          icon="i-lucide-x"
                          :disabled="saving"
                          @click="cancelExpenseInline"
                        />
                      </div>
                    </td>
                  </tr>
                  <tr
                    v-else
                    class="border-t border-default"
                  >
                    <td class="p-2 whitespace-nowrap tabular-nums" dir="ltr">
                      {{ row.payment_date }}
                    </td>
                    <td class="p-2 font-medium whitespace-nowrap tabular-nums" dir="ltr">
                      {{ formatMoney(row.amount) }}
                    </td>
                    <td class="p-2 text-start text-muted">
                      {{ row.notes || '—' }}
                    </td>
                    <td class="p-1">
                      <div class="flex justify-center gap-0.5">
                        <UButton
                          size="xs"
                          variant="ghost"
                          icon="i-lucide-pencil"
                          :disabled="isExpenseCreating"
                          @click="openEditExpense(row)"
                        />
                        <UButton
                          size="xs"
                          variant="ghost"
                          color="error"
                          icon="i-lucide-trash-2"
                          :disabled="saving"
                          @click="deleteExpense(row)"
                        />
                      </div>
                    </td>
                  </tr>
                </template>

                <tr v-if="!expenses.length && !isExpenseCreating">
                  <td colspan="4" class="p-6 text-center text-muted">
                    لا توجد مصروفات
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end">
          <UButton color="neutral" variant="outline" @click="expensesModalOpen = false">
            إغلاق
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
