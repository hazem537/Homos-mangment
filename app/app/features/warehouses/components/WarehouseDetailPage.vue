<script setup lang="ts">
import { formatNumber } from '~/utils/formatNumber'
import { accountTypeLabel } from '~/utils/accountType'
import { applySectionRunningBalances } from '../utils/warehouseDetailBundle'

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
  transferStoreSlotOptions,
  destWarehouseOptions,
  transferAvailableKg,
  transferAllocation,
  transferStatusOptions,
  openCreateSection,
  openEditSection,
  saveSection,
  softDeleteSection,
  expenseModalOpen,
  editingExpense,
  expenseForm,
  openCreateExpense,
  saveExpense,
  setExpenseAmount,
  openWarehouseTransfer,
  openEditMovement,
  deleteMovement,
  cancelTransfer,
  onTransferKindChange,
  onTransferWarehouseChange,
  onTransferStoreChange,
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
  raw: any
}

type WarehouseMovementRow = SectionMovementRow & {
  section_name: string
  product_name: string | null
}

type GroupedWorkbookSection = {
  section_id: string
  section_name: string
  card: (typeof filteredSectionCards.value)[number]
  movements: SectionMovementRow[]
  kg_in: number
  kg_out: number
  kg_remaining: number
}

const sortByDate = <T extends { date: string, created_at: string }>(rows: T[]) =>
  [...rows].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    if (byDate !== 0) return byDate
    return a.created_at.localeCompare(b.created_at)
  })

function movementCanEdit(toKind: string | null | undefined) {
  return toKind === 'store'
    || toKind === 'store_slot'
    || toKind === 'mekla'
    || toKind === 'section'
}

/** One ربع block: merge all product/status slices under the same section_id. */
const groupedWorkbookSections = computed((): GroupedWorkbookSection[] => {
  const bySection = new Map<string, {
    section_id: string
    section_name: string
    card: (typeof filteredSectionCards.value)[number]
    incoming: Parameters<typeof applySectionRunningBalances>[0]
    outgoing: Parameters<typeof applySectionRunningBalances>[1]
    rawByKey: Map<string, any>
    statusByKey: Map<string, string | null>
  }>()

  for (const card of filteredSectionCards.value) {
    let group = bySection.get(card.section_id)
    if (!group) {
      group = {
        section_id: card.section_id,
        section_name: card.section_name,
        card,
        incoming: [],
        outgoing: [],
        rawByKey: new Map(),
        statusByKey: new Map()
      }
      bySection.set(card.section_id, group)
    }

    for (const row of card.incoming) {
      const key = `in:${row.id}`
      if (group.rawByKey.has(key)) continue
      group.rawByKey.set(key, row)
      const statusName = row.status_name || card.status_name || null
      group.statusByKey.set(key, statusName)
      group.incoming.push({
        id: row.id,
        date: row.date,
        created_at: row.created_at,
        source: row.source,
        quantity_kg: row.quantity_kg,
        status_name: statusName,
        kind: row.kind,
        product_id: row.product_id,
        status_id: row.status_id,
        from_kind: row.from_kind,
        from_id: row.from_id,
        to_kind: row.to_kind,
        to_id: row.to_id
      })
    }

    for (const row of card.outgoing) {
      const key = `out:${row.id}`
      if (group.rawByKey.has(key)) continue
      group.rawByKey.set(key, row)
      const statusName = row.status_name || card.status_name || null
      group.statusByKey.set(key, statusName)
      group.outgoing.push({
        id: row.id,
        date: row.date,
        created_at: row.created_at,
        destination: row.destination,
        status_name: statusName,
        quantity_kg: row.quantity_kg,
        product_id: row.product_id,
        status_id: row.status_id,
        to_status_id: row.to_status_id,
        from_kind: row.from_kind,
        from_id: row.from_id,
        to_kind: row.to_kind,
        to_id: row.to_id
      })
    }
  }

  return [...bySection.values()]
    .sort((a, b) => a.section_name.localeCompare(b.section_name, 'ar'))
    .map((group) => {
      const balanced = applySectionRunningBalances(group.incoming, group.outgoing)
      const movements = sortByDate([
        ...balanced.incoming.map(row => ({
          id: `in-${row.id}`,
          dir: 'in' as const,
          date: row.date,
          created_at: row.created_at,
          party: row.source,
          status_name: row.status_name || group.statusByKey.get(`in:${row.id}`) || null,
          quantity_kg: row.quantity_kg,
          qty_before: row.qty_before,
          qty_after: row.qty_after,
          raw: group.rawByKey.get(`in:${row.id}`)
        })),
        ...balanced.outgoing.map(row => ({
          id: `out-${row.id}`,
          dir: 'out' as const,
          date: row.date,
          created_at: row.created_at,
          party: row.destination,
          status_name: row.status_name || group.statusByKey.get(`out:${row.id}`) || null,
          quantity_kg: row.quantity_kg,
          qty_before: row.qty_before,
          qty_after: row.qty_after,
          raw: group.rawByKey.get(`out:${row.id}`)
        }))
      ])

      const kg_in = group.incoming.reduce((s, r) => s + Number(r.quantity_kg || 0), 0)
      const kg_out = group.outgoing.reduce((s, r) => s + Number(r.quantity_kg || 0), 0)

      return {
        section_id: group.section_id,
        section_name: group.section_name,
        card: group.card,
        movements,
        kg_in,
        kg_out,
        kg_remaining: kg_in - kg_out
      }
    })
})

const warehouseMovements = computed((): WarehouseMovementRow[] => {
  const ledger = warehouseLedgerCard.value
  return sortByDate([
    ...ledger.incoming.map(row => ({
      id: `wh-in-${row.id}`,
      dir: 'in' as const,
      date: row.date,
      created_at: row.created_at,
      party: row.source,
      status_name: row.status_name ?? null,
      quantity_kg: row.quantity_kg,
      qty_before: row.qty_before,
      qty_after: row.qty_after,
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
      status_name: row.status_name ?? null,
      quantity_kg: row.quantity_kg,
      qty_before: row.qty_before,
      qty_after: row.qty_after,
      section_name: row.section_name,
      product_name: row.product_name,
      raw: row
    }))
  ])
})

const transferModalTitle = computed(() => {
  if (editingMovementId.value) {
    return `تعديل تحويل — ${transferFromSection.value?.section_name || ''}`.trim()
  }
  if (transferScope.value === 'section') {
    return `تحويل من الربع — ${transferFromSection.value?.section_name || ''}`.trim()
  }
  return 'تحويل من الشونة'
})

const workbookMovements = computed(() =>
  warehouseMovements.value.map(row => ({
    id: row.id,
    dir: row.dir,
    date: row.date,
    party: row.party,
    status_name: row.status_name,
    quantity_kg: row.quantity_kg,
    qty_before: row.qty_before,
    qty_after: row.qty_after,
    section_name: row.section_name,
    can_edit: row.dir === 'out' ? movementCanEdit(row.raw?.to_kind) : undefined
  }))
)

const workbookSections = computed(() =>
  groupedWorkbookSections.value.map(group => ({
    key: group.section_id,
    section_name: group.section_name,
    status_name: null,
    product_name: null,
    kg_in: group.kg_in,
    kg_out: group.kg_out,
    kg_remaining: group.kg_remaining,
    movements: group.movements.map(row => ({
      id: row.id,
      dir: row.dir,
      date: row.date,
      party: row.party,
      status_name: row.status_name,
      quantity_kg: row.quantity_kg,
      qty_before: row.qty_before,
      qty_after: row.qty_after,
      can_edit: row.dir === 'out' ? movementCanEdit(row.raw?.to_kind) : undefined
    }))
  }))
)

function openEditMovementFromSheet(
  scope: 'total' | 'section',
  dataIndex: number,
  sectionIndex?: number
) {
  if (scope === 'total') {
    const row = warehouseMovements.value[dataIndex]
    if (!row || row.dir !== 'out') return
    openEditMovement(row.raw)
    return
  }
  const group = groupedWorkbookSections.value[sectionIndex ?? -1]
  const row = group?.movements[dataIndex]
  if (!row || row.dir !== 'out') return
  openEditMovement(row.raw)
}

async function deleteMovementFromSheet(
  scope: 'total' | 'section',
  dataIndex: number,
  sectionIndex?: number
) {
  if (scope === 'total') {
    const row = warehouseMovements.value[dataIndex]
    if (!row || row.dir !== 'out') return
    await deleteMovement(row.raw)
    return
  }
  const group = groupedWorkbookSections.value[sectionIndex ?? -1]
  const row = group?.movements[dataIndex]
  if (!row || row.dir !== 'out') return
  await deleteMovement(row.raw)
}

function openEditSectionByIndex(sectionIndex: number) {
  const group = groupedWorkbookSections.value[sectionIndex]
  if (!group) return
  openEditSection(group.card)
}

async function deleteSectionByIndex(sectionIndex: number) {
  const group = groupedWorkbookSections.value[sectionIndex]
  if (!group) return
  await softDeleteSection(group.card)
}
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
          <UButton
            v-if="!loading"
            icon="i-lucide-arrow-left-right"
            size="sm"
            color="primary"
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
            v-if="!loading"
            icon="i-lucide-wallet"
            size="sm"
            color="neutral"
            variant="soft"
            class="shrink-0"
            @click="openCreateExpense"
          >
            إضافة مصروف
          </UButton>
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

      <div class="flex h-[calc(100dvh-14rem)] w-full min-h-[24rem] min-h-0 flex-col overflow-hidden">
          <ClientOnly>
            <WarehouseDetailWorkbook
              :key="warehouseId"
              class="min-h-0 flex-1"
              :warehouse-id="warehouseId"
              :stats="warehouseStats"
              :movements="workbookMovements"
              :sections="workbookSections"
              :open-edit-section="openEditSectionByIndex"
              :delete-section="deleteSectionByIndex"
              :open-edit-movement="openEditMovementFromSheet"
              :delete-movement="deleteMovementFromSheet"
            />
            <template #fallback>
              <CardsSkeleton :count="1" />
            </template>
          </ClientOnly>
        </div>

      </div>
    </template>

    <UModal v-model:open="sectionModalOpen" title="الربع">
      <template #body>
        <div class="space-y-4">
          <UFormField label="الاسم" required>
            <UInput v-model="sectionForm.name" class="w-full" placeholder="مثال: ربع أ" />
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
      :open="transferModalOpen"
      :title="transferModalTitle"
      :ui="{ content: 'sm:max-w-4xl' }"
      @update:open="(v: boolean) => { if (!v) cancelTransfer() }"
    >
      <template #body>
        <div class="space-y-5">
          <div class="rounded-lg border border-default bg-elevated/40 px-4 py-3">
            <p class="text-base text-muted">
              المصدر
            </p>
            <p class="mt-1 text-lg font-semibold text-highlighted">
              <template v-if="transferScope === 'section'">
                {{ transferFromSection?.section_name }}
              </template>
              <template v-else>
                الشونة (توزيع تلقائي)
              </template>
              <span class="ms-2 text-base font-normal text-muted" dir="ltr">
                ({{ formatNumber(transferAvailableKg) }} كجم)
              </span>
            </p>
          </div>

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <UFormField
              label="التاريخ"
              required
              size="xl"
              :ui="{ label: 'text-lg' }"
            >
              <UInput
                v-model="transferForm.movement_date"
                type="date"
                size="xl"
                class="w-full"
                dir="ltr"
              />
            </UFormField>
            <UFormField
              label="من الحالة"
              size="xl"
              :ui="{ label: 'text-lg' }"
            >
              <USelect
                v-model="transferForm.status_id"
                :items="transferStatusOptions"
                value-key="value"
                label-key="label"
                size="xl"
                class="w-full"
                placeholder="من الحالة"
              />
            </UFormField>
            <UFormField
              label="إلى الحالة"
              size="xl"
              :ui="{ label: 'text-lg' }"
            >
              <USelect
                v-model="transferForm.to_status_id"
                :items="transferStatusOptions"
                value-key="value"
                label-key="label"
                size="xl"
                class="w-full"
                placeholder="إلى الحالة"
              />
            </UFormField>
            <UFormField
              label="نوع الوجهة"
              required
              size="xl"
              :ui="{ label: 'text-lg' }"
            >
              <USelect
                v-model="transferForm.to_kind"
                :items="transferKindOptions"
                value-key="value"
                label-key="label"
                size="xl"
                class="w-full"
                @update:model-value="onTransferKindChange"
              />
            </UFormField>
            <UFormField
              v-if="transferForm.to_kind === 'warehouse'"
              label="الشونة"
              required
              size="xl"
              :ui="{ label: 'text-lg' }"
            >
              <USelect
                v-model="transferForm.to_warehouse_id"
                :items="destWarehouseOptions"
                value-key="value"
                label-key="label"
                size="xl"
                class="w-full"
                placeholder="الشونة"
                @update:model-value="onTransferWarehouseChange"
              />
            </UFormField>
            <UFormField
              :label="transferForm.to_kind === 'warehouse' ? 'الربع' : transferForm.to_kind === 'store' ? 'المخزن' : 'الوجهة'"
              required
              size="xl"
              :ui="{ label: 'text-lg' }"
            >
              <USelect
                v-model="transferForm.to_id"
                :items="transferToOptions"
                value-key="value"
                label-key="label"
                size="xl"
                class="w-full"
                :placeholder="transferForm.to_kind === 'warehouse' ? 'الربع' : transferForm.to_kind === 'store' ? 'المخزن' : 'الوجهة'"
                @update:model-value="transferForm.to_kind === 'store' ? onTransferStoreChange() : undefined"
              />
            </UFormField>
            <UFormField
              v-if="transferForm.to_kind === 'store'"
              label="خانة"
              required
              size="xl"
              :ui="{ label: 'text-lg' }"
            >
              <USelect
                v-model="transferForm.to_slot_id"
                :items="transferStoreSlotOptions"
                value-key="value"
                label-key="label"
                size="xl"
                class="w-full"
                placeholder="الخانة"
              />
            </UFormField>
            <UFormField
              label="الكمية"
              required
              size="xl"
              :ui="{ label: 'text-lg' }"
            >
              <DecimalInput
                :model-value="transferForm.quantity_kg"
                size="xl"
                placeholder="كجم"
                @update:model-value="setTransferQty"
              />
            </UFormField>
          </div>

          <div
            v-if="transferForm.quantity_kg && Number(transferForm.quantity_kg) > 0"
            class="rounded-lg border border-default px-4 py-3 text-base"
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
              class="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted"
            >
              <span class="font-semibold text-highlighted">
                خطة التوزيع
              </span>
              <span
                v-for="line in transferAllocation.plan"
                :key="`${line.section_id}-${line.status_id}`"
                class="whitespace-nowrap"
              >
                {{ line.section_name }}:
                <span dir="ltr" class="font-semibold text-highlighted">{{ formatNumber(line.qty) }}</span>
              </span>
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            size="lg"
            @click="cancelTransfer"
          >
            إلغاء
          </UButton>
          <UButton
            size="lg"
            :loading="saving"
            :disabled="!editingMovementId && !transferAllocation.ok"
            @click="saveTransfer"
          >
            {{ editingMovementId ? 'تحديث' : 'حفظ' }}
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="expenseModalOpen"
      :title="editingExpense ? 'تعديل مصروف' : 'إضافة مصروف'"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="التاريخ"
            required
          >
            <UInput
              v-model="expenseForm.payment_date"
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
              v-model="expenseForm.title"
              class="w-full"
              placeholder="مثال: كهرباء / مياه / عمال"
            />
          </UFormField>
          <UFormField
            label="المبلغ"
            required
          >
            <DecimalInput
              :model-value="expenseForm.amount"
              placeholder="0.00"
              @update:model-value="setExpenseAmount"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            @click="expenseModalOpen = false"
          >
            إلغاء
          </UButton>
          <UButton
            :loading="saving"
            @click="saveExpense"
          >
            حفظ
          </UButton>
        </div>
      </template>
    </UModal>

  </div>
</template>
