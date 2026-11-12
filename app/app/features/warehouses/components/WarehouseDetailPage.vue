<script setup lang="ts">
import { formatNumber } from '~/utils/formatNumber'
import { accountTypeLabel } from '~/utils/accountType'

const props = defineProps<{
  warehouseId: string
}>()

const {
  loading,
  saving,
  isRefreshing,
  warehouse,
  filteredSectionCards,
  warehouseLedgerCard,
  warehouseStats,
  selectedProductId,
  selectedSectionId,
  sectionFilterOptions,
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
  accountTypeName,
  editingMovementId
} = useWarehouseDetail(() => props.warehouseId)

const transferKindOptions = [
  { label: 'مخزن', value: 'store' },
  { label: 'مقلى', value: 'mekla' },
  { label: 'شونة', value: 'warehouse' }
]

const statsCardUi = { body: 'p-2 sm:p-2.5' }

const tableClass = 'w-max min-w-full border-collapse text-sm text-center whitespace-nowrap tabular-nums'
const tablePanelClass = 'flex w-max min-w-full flex-col rounded-lg border border-default'
const sectionStatsClass = 'flex flex-nowrap items-center gap-1.5 tabular-nums text-sm'
const cellNowrapClass = 'p-2 whitespace-nowrap'

/** Resizable 2-col split: total warehouse % (RTL-right), rest for sections. */
const STORAGE_KEY = 'warehouse-detail-split-pct-v2'
const totalColPct = ref(100)
const splitRoot = ref<HTMLElement | null>(null)
const isResizing = ref(false)

onMounted(() => {
  try {
    const saved = Number(localStorage.getItem(STORAGE_KEY))
    if (Number.isFinite(saved) && saved >= 20 && saved <= 100) {
      totalColPct.value = saved
    }
  } catch {
    /* ignore */
  }
})

const clampPct = (n: number) => Math.min(100, Math.max(20, n))

const applySplitFromClientX = (clientX: number) => {
  if (!splitRoot.value) return
  const rect = splitRoot.value.getBoundingClientRect()
  if (rect.width <= 0) return
  // RTL: total column sits on the right — measure from right edge
  const fromRight = ((rect.right - clientX) / rect.width) * 100
  totalColPct.value = clampPct(fromRight)
}

const endSplitResize = () => {
  if (!isResizing.value) return
  isResizing.value = false
  window.removeEventListener('pointermove', onWindowSplitMove)
  window.removeEventListener('pointerup', endSplitResize)
  window.removeEventListener('pointercancel', endSplitResize)
  try {
    localStorage.setItem(STORAGE_KEY, String(totalColPct.value))
  } catch {
    /* ignore */
  }
}

const onWindowSplitMove = (e: PointerEvent) => {
  if (!isResizing.value) return
  applySplitFromClientX(e.clientX)
}

const onSplitPointerDown = (e: PointerEvent) => {
  e.preventDefault()
  isResizing.value = true
  applySplitFromClientX(e.clientX)
  window.addEventListener('pointermove', onWindowSplitMove)
  window.addEventListener('pointerup', endSplitResize)
  window.addEventListener('pointercancel', endSplitResize)
}

onBeforeUnmount(() => {
  endSplitResize()
})

const sectionRowKey = (card: { section_id: string, product_id?: string | null, status_id?: string | null }) =>
  `${card.section_id}:${card.product_id || 'none'}:${card.status_id || 'none'}`

type MovementDir = 'in' | 'out'

type SectionMovementRow = {
  id: string
  dir: MovementDir
  date: string
  created_at: string
  party: string
  status_name: string | null
  quantity_kg: number
  qty_before: number
  qty_after: number
  notes: string | null
  raw: any
}

type WarehouseMovementRow = SectionMovementRow & {
  section_name: string
  product_name: string | null
}

const sortByDate = <T extends { date: string, created_at: string }>(rows: T[]) =>
  [...rows].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    if (byDate !== 0) return byDate
    return a.created_at.localeCompare(b.created_at)
  })

const sectionMovements = (card: (typeof filteredSectionCards.value)[number]): SectionMovementRow[] =>
  sortByDate([
    ...card.incoming.map(row => ({
      id: `in-${row.id}`,
      dir: 'in' as const,
      date: row.date,
      created_at: row.created_at,
      party: row.source,
      status_name: card.status_name ?? null,
      quantity_kg: row.quantity_kg,
      qty_before: row.qty_before,
      qty_after: row.qty_after,
      notes: row.notes,
      raw: row
    })),
    ...card.outgoing.map(row => ({
      id: `out-${row.id}`,
      dir: 'out' as const,
      date: row.date,
      created_at: row.created_at,
      party: row.destination,
      status_name: row.status_name || card.status_name || null,
      quantity_kg: row.quantity_kg,
      qty_before: row.qty_before,
      qty_after: row.qty_after,
      notes: row.notes,
      raw: row
    }))
  ])

const warehouseMovements = computed((): WarehouseMovementRow[] => {
  const ledger = warehouseLedgerCard.value
  return sortByDate([
    ...ledger.incoming.map(row => ({
      id: `wh-in-${row.id}`,
      dir: 'in' as const,
      date: row.date,
      created_at: row.created_at,
      party: row.source,
      status_name: null as string | null,
      quantity_kg: row.quantity_kg,
      qty_before: row.qty_before,
      qty_after: row.qty_after,
      notes: row.notes,
      section_name: row.section_name,
      product_name: row.product_name,
      raw: row
    })),
    ...ledger.outgoing.map(row => ({
      id: `wh-out-${row.id}`,
      dir: 'out' as const,
      date: row.date,
      created_at: row.created_at,
      party: row.destination,
      status_name: row.status_name,
      quantity_kg: row.quantity_kg,
      qty_before: row.qty_before,
      qty_after: row.qty_after,
      notes: row.notes,
      section_name: row.section_name,
      product_name: row.product_name,
      raw: row
    }))
  ])
})

/** Remaining ÷ entered (amount stay / amount enter). */
const remainingInRatio = computed(() => {
  const inn = Number(warehouseStats.value.kgIn) || 0
  if (inn <= 0.001) return 0
  return Number(warehouseStats.value.kgRemaining) / inn
})

const cellInputUi = { base: 'px-1.5 py-1.5 text-sm rounded-sm tabular-nums' }
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-3">
      <!-- Row 1: title + type + actions -->
      <div class="flex flex-wrap items-center gap-2 sm:gap-3">
        <div class="flex min-w-0 flex-1 items-center gap-2">
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
            </div>
            <p v-if="warehouse?.notes" class="mt-1 truncate text-sm text-muted">
              {{ warehouse.notes }}
            </p>
          </div>
        </div>

        <div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <USelect
            v-if="!loading && sectionFilterOptions.length > 1"
            v-model="selectedSectionId"
            :items="sectionFilterOptions"
            value-key="value"
            label-key="label"
            class="w-52 shrink-0"
            placeholder="الربع"
          />
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

      <!-- Row 2: warehouse totals + in/out ratio + waste -->
      <div
        v-if="!loading"
        class="flex flex-wrap items-center gap-2 sm:gap-3"
      >
        <div class="homos-scroll flex min-w-0 flex-1 flex-nowrap items-stretch gap-1.5 overflow-x-auto tabular-nums">
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
            <p class="mt-0.5 text-base font-semibold tracking-tight text-success" dir="ltr">
              {{ formatNumber(warehouseStats.kgIn) }}
            </p>
          </UCard>
          <UCard class="min-w-24 shrink-0 text-center" :ui="statsCardUi">
            <p class="text-xs font-medium text-muted">
              منصرف
            </p>
            <p class="mt-0.5 text-base font-semibold tracking-tight text-primary" dir="ltr">
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
          <UCard class="min-w-28 shrink-0 text-center" :ui="statsCardUi">
            <p class="text-xs font-medium text-muted">
              نسبة المتبقي
            </p>
            <p class="mt-0.5 text-base font-semibold tracking-tight text-highlighted" dir="ltr">
              {{ formatNumber(remainingInRatio * 100) }}%
            </p>
          </UCard>
        </div>

        <UButton
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
            من الحالة
          </p>
          <USelect
            v-model="transferForm.status_id"
            :items="transferStatusOptions"
            value-key="value"
            label-key="label"
            class="w-full"
            placeholder="من الحالة"
          />
        </div>
        <div class="w-32 shrink-0">
          <p class="mb-1 text-xs text-muted">
            إلى الحالة
          </p>
          <USelect
            v-model="transferForm.to_status_id"
            :items="transferStatusOptions"
            value-key="value"
            label-key="label"
            class="w-full"
            placeholder="إلى الحالة"
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
      <div
        class="relative transition-opacity duration-200"
        :class="isRefreshing ? 'opacity-50 pointer-events-none' : 'opacity-100'"
        :aria-busy="isRefreshing"
      >
        <div
          v-if="isRefreshing"
          class="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center"
        >
          <div class="flex items-center gap-2 rounded-full border border-default bg-default/90 px-3 py-1.5 text-sm text-muted shadow-sm backdrop-blur-sm">
            <UIcon
              name="i-lucide-loader-circle"
              class="size-4 animate-spin text-primary"
            />
            تحديث البيانات…
          </div>
        </div>

      <div
        ref="splitRoot"
        dir="rtl"
        class="flex h-[calc(100dvh-14rem)] w-full min-h-[24rem] overflow-hidden"
        :class="isResizing ? 'select-none' : ''"
      >
        <!-- Col 1 (RTL right): warehouse totals -->
        <div
          class="homos-scroll min-h-0 min-w-0 overflow-x-auto overflow-y-auto pe-1"
          :style="{ width: `${totalColPct}%` }"
        >
        <UCard
          class="w-max min-w-full"
          :ui="{ body: 'flex w-max min-w-full flex-col gap-3 space-y-0 overflow-visible p-4 sm:p-5' }"
        >
          <div class="flex shrink-0 flex-wrap items-center gap-2">
            <span class="h-4 w-1 shrink-0 rounded-full bg-primary" />
            <UButton
              icon="i-lucide-arrow-left-right"
              size="sm"
              color="primary"
              class="shrink-0"
              :disabled="!selectedProductId || warehouseStats.kgRemaining <= 0.001"
              @click="openWarehouseTransfer"
            >
              تحويل من الشونة
            </UButton>
            <h3 class="text-base font-semibold text-highlighted whitespace-nowrap">
              إجمالي حركات الشونة
            </h3>
          </div>

          <div :class="tablePanelClass">
            <div class="flex shrink-0 items-center gap-2 border-b border-default bg-elevated/70 px-3 py-2">
              <p class="text-sm font-semibold text-highlighted">
                الحركة علي الشونة
              </p>
              <UBadge size="sm" variant="subtle" color="neutral">
                {{ warehouseMovements.length }}
              </UBadge>
            </div>
            <table dir="rtl" :class="tableClass">
              <thead class="bg-elevated text-muted">
                <tr>
                  <th :class="cellNowrapClass + ' font-medium'" />
                  <th :class="cellNowrapClass + ' font-medium'">
                    التاريخ
                  </th>
                  <th :class="cellNowrapClass + ' font-medium text-start'">
                    الربع
                  </th>
                  <th :class="cellNowrapClass + ' font-medium text-start'">
                    الطرف
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
                  <th :class="cellNowrapClass + ' font-medium'">
                    إجراءات
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in warehouseMovements"
                  :key="row.id"
                  class="border-t border-default"
                >
                  <td :class="cellNowrapClass">
                    <UIcon
                      :name="row.dir === 'in' ? 'i-lucide-arrow-down-left' : 'i-lucide-arrow-up-right'"
                      :class="row.dir === 'in' ? 'size-4 text-success' : 'size-4 text-primary'"
                    />
                  </td>
                  <td :class="cellNowrapClass" dir="ltr">
                    {{ row.date }}
                  </td>
                  <td :class="cellNowrapClass + ' text-start font-medium'">
                    {{ row.section_name }}
                  </td>
                  <td :class="cellNowrapClass + ' text-start'">
                    {{ row.party }}
                  </td>
                  <td :class="cellNowrapClass + ' text-start'">
                    {{ row.status_name || '—' }}
                  </td>
                  <td :class="cellNowrapClass + ' text-muted'" dir="ltr">
                    {{ formatNumber(row.qty_before) }}
                  </td>
                  <td
                    :class="[
                      cellNowrapClass,
                      'font-medium',
                      row.dir === 'in' ? 'text-success' : 'text-primary'
                    ]"
                    dir="ltr"
                  >
                    {{ formatNumber(row.quantity_kg) }}
                  </td>
                  <td :class="cellNowrapClass + ' font-medium text-highlighted'" dir="ltr">
                    {{ formatNumber(row.qty_after) }}
                  </td>
                  <td class="p-1">
                    <div
                      v-if="row.dir === 'out'"
                      class="flex justify-center gap-0.5"
                    >
                      <UButton
                        size="xs"
                        variant="ghost"
                        icon="i-lucide-pencil"
                        @click="openEditMovement(row.raw)"
                      />
                      <UButton
                        size="xs"
                        variant="ghost"
                        color="error"
                        icon="i-lucide-trash-2"
                        :disabled="saving"
                        @click="deleteMovement(row.raw)"
                      />
                    </div>
                    <span
                      v-else
                      class="text-muted"
                    >—</span>
                  </td>
                </tr>
                <tr v-if="!warehouseMovements.length">
                  <td
                    colspan="9"
                    class="p-4 text-center text-muted"
                  >
                    لا توجد حركات
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
        </div>

        <!-- Resize handle -->
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="تغيير عرض الأعمدة"
          class="group relative z-10 flex w-3 shrink-0 cursor-col-resize items-stretch justify-center touch-none"
          @pointerdown="onSplitPointerDown"
        >
          <span
            class="my-2 w-px rounded-full bg-default transition-colors group-hover:bg-primary group-active:bg-primary"
            :class="isResizing ? 'bg-primary' : ''"
          />
        </div>

        <!-- Col 2: sections stacked vertically -->
        <div
          class="homos-scroll flex min-h-0 min-w-0 flex-col gap-4 overflow-x-auto overflow-y-auto ps-1"
          :style="{ width: `${100 - totalColPct}%` }"
        >
        <div
          v-if="!filteredSectionCards.length"
          class="rounded-lg border border-default bg-elevated/40 p-8 text-center text-muted"
        >
          {{ selectedProductId ? 'لا توجد أرباع لهذا الصنف' : 'لا توجد أرباع — أضف ربعاً للبدء' }}
        </div>

        <UCard
          v-for="card in filteredSectionCards"
          :key="sectionRowKey(card)"
          class="w-max min-w-full shrink-0"
          :ui="{ body: 'flex w-max min-w-full flex-col gap-3 space-y-0 overflow-visible p-4 sm:p-5' }"
        >
          <div class="flex shrink-0 flex-nowrap items-center gap-3">
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <span class="h-4 w-1 shrink-0 rounded-full bg-warning" />
              <div class="flex shrink-0 items-center gap-1">
                <UButton
                  size="sm"
                  color="primary"
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
              <h3 class="text-lg font-semibold text-highlighted whitespace-nowrap">
                {{ card.section_name }}
              </h3>
              <UBadge
                v-if="card.status_name"
                size="sm"
                variant="subtle"
                color="neutral"
              >
                {{ card.status_name }}
              </UBadge>
              <UBadge
                v-if="card.product_name && !selectedProductId"
                size="sm"
                variant="subtle"
                color="warning"
              >
                {{ card.product_name }}
              </UBadge>
              <div :class="sectionStatsClass">
                <div class="shrink-0 rounded-md bg-elevated/80 px-2.5 py-1 text-center">
                  <span class="text-xs text-muted">وارد</span>
                  <span class="ms-1.5 font-semibold text-success" dir="ltr">
                    {{ formatNumber(card.kg_in) }}
                  </span>
                </div>
                <div class="shrink-0 rounded-md bg-elevated/80 px-2.5 py-1 text-center">
                  <span class="text-xs text-muted">منصرف</span>
                  <span class="ms-1.5 font-semibold text-primary" dir="ltr">
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
              <p
                v-if="card.notes"
                class="w-full text-sm text-muted"
              >
                {{ card.notes }}
              </p>
            </div>
          </div>

          <div :class="tablePanelClass">
            <div class="flex shrink-0 items-center gap-2 border-b border-default bg-elevated/70 px-3 py-2">
              <p class="text-sm font-semibold text-highlighted">
                الحركة علي الربع
              </p>
              <UBadge size="sm" variant="subtle" color="neutral">
                {{ sectionMovements(card).length }}
              </UBadge>
            </div>
            <table dir="rtl" :class="tableClass">
              <thead class="bg-elevated text-muted">
                <tr>
                  <th :class="cellNowrapClass + ' font-medium'" />
                  <th :class="cellNowrapClass + ' font-medium'">
                    التاريخ
                  </th>
                  <th :class="cellNowrapClass + ' font-medium text-start'">
                    الطرف
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
                  <th :class="cellNowrapClass + ' font-medium'">
                    إجراءات
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in sectionMovements(card)"
                  :key="row.id"
                  class="border-t border-default"
                >
                  <td :class="cellNowrapClass">
                    <UIcon
                      :name="row.dir === 'in' ? 'i-lucide-arrow-down-left' : 'i-lucide-arrow-up-right'"
                      :class="row.dir === 'in' ? 'size-4 text-success' : 'size-4 text-primary'"
                    />
                  </td>
                  <td :class="cellNowrapClass" dir="ltr">
                    {{ row.date }}
                  </td>
                  <td :class="cellNowrapClass + ' text-start'">
                    {{ row.party }}
                  </td>
                  <td :class="cellNowrapClass + ' text-start'">
                    {{ row.status_name || '—' }}
                  </td>
                  <td :class="cellNowrapClass + ' text-muted'" dir="ltr">
                    {{ formatNumber(row.qty_before) }}
                  </td>
                  <td
                    :class="[
                      cellNowrapClass,
                      'font-medium',
                      row.dir === 'in' ? 'text-success' : 'text-primary'
                    ]"
                    dir="ltr"
                  >
                    {{ formatNumber(row.quantity_kg) }}
                  </td>
                  <td :class="cellNowrapClass + ' font-medium text-highlighted'" dir="ltr">
                    {{ formatNumber(row.qty_after) }}
                  </td>
                  <td class="p-1">
                    <div
                      v-if="row.dir === 'out'"
                      class="flex justify-center gap-0.5"
                    >
                      <UButton
                        size="xs"
                        variant="ghost"
                        icon="i-lucide-pencil"
                        @click="openEditMovement(row.raw)"
                      />
                      <UButton
                        size="xs"
                        variant="ghost"
                        color="error"
                        icon="i-lucide-trash-2"
                        :disabled="saving"
                        @click="deleteMovement(row.raw)"
                      />
                    </div>
                    <span
                      v-else
                      class="text-muted"
                    >—</span>
                  </td>
                </tr>
                <tr v-if="!sectionMovements(card).length">
                  <td
                    colspan="8"
                    class="p-4 text-center text-muted"
                  >
                    لا توجد حركات
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
        </div>
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

  </div>
</template>
