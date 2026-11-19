<script setup lang="ts">
import { formatNumber } from '~/utils/formatNumber'
import type { LocationMovementLite, StoreSlotLite } from '../utils/stockLocationDetailBundle'

const props = defineProps<{
  storeId: string
}>()

const {
  loading,
  isRefreshing,
  saving,
  entity,
  slots,
  selectedSlotId,
  slotOptions,
  transferFromSlotOptions,
  slotModalOpen,
  editingSlot,
  slotForm,
  selectedProductId,
  ledger,
  allIncoming,
  allOutgoing,
  stats,
  listPath,
  transferOpen,
  transferForm,
  transferKindOptions,
  transferToOptions,
  transferToLabel,
  needsTransferDestination,
  transferStatusOptions,
  transferAvailableKg,
  transferAvailableForForm,
  openTransfer,
  openEditMovement,
  deleteMovement,
  editingMovementId,
  onTransferKindChange,
  cancelTransfer,
  saveTransfer,
  openSlotCreate,
  openSlotEdit,
  saveSlot,
  softDeleteSlot,
  setTransferQty
} = useStoreDetail(() => props.storeId)

type MovementDir = 'in' | 'out'

type SlotMovementRow = {
  id: string
  dir: MovementDir
  date: string
  created_at: string
  party: string
  status_name: string | null
  quantity_kg: number
  qty_before: number
  qty_after: number
  raw: LocationMovementLite
}

type StoreMovementRow = SlotMovementRow & {
  slot_name: string
  slot_color: string | null
}

type GroupedWorkbookSlot = {
  slot_id: string
  slot_name: string
  slot: StoreSlotLite | null
  movements: SlotMovementRow[]
  kg_in: number
  kg_out: number
  kg_remaining: number
}

const cellInputUi = { base: 'px-1.5 py-1.5 text-sm rounded-sm tabular-nums' }

const sortByDate = <T extends { date: string, created_at: string }>(rows: T[]) =>
  [...rows].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    if (byDate !== 0) return byDate
    return a.created_at.localeCompare(b.created_at)
  })

function applyRunningBalances(
  incoming: LocationMovementLite[],
  outgoing: LocationMovementLite[]
) {
  type Event = { id: string, date: string, created_at: string, delta: number }

  const events: Event[] = [
    ...incoming.map(r => ({
      id: r.id,
      date: r.date,
      created_at: r.created_at,
      delta: Number(r.quantity_kg)
    })),
    ...outgoing.map(r => ({
      id: r.id,
      date: r.date,
      created_at: r.created_at,
      delta: -Number(r.quantity_kg)
    }))
  ]

  events.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    if (byDate !== 0) return byDate
    return a.created_at.localeCompare(b.created_at)
  })

  const balanceById = new Map<string, { qty_before: number, qty_after: number }>()
  let balance = 0
  for (const event of events) {
    const qty_before = Number(balance.toFixed(4))
    const qty_after = Number((balance + event.delta).toFixed(4))
    balanceById.set(event.id, { qty_before, qty_after })
    balance = qty_after
  }

  const withBalance = <T extends { id: string }>(rows: T[]) =>
    rows.map((row) => {
      const bal = balanceById.get(row.id) ?? { qty_before: 0, qty_after: 0 }
      return { ...row, ...bal }
    })

  return {
    incoming: withBalance(incoming) as Array<LocationMovementLite & { qty_before: number, qty_after: number }>,
    outgoing: withBalance(outgoing) as Array<LocationMovementLite & { qty_before: number, qty_after: number }>
  }
}

const productIncoming = computed(() => {
  const pid = selectedProductId.value
  let rows = allIncoming.value
  if (pid) rows = rows.filter(r => r.product_id === pid)
  return rows
})

const productOutgoing = computed(() => {
  const pid = selectedProductId.value
  let rows = allOutgoing.value
  if (pid) rows = rows.filter(r => r.product_id === pid)
  return rows
})

const storeMovements = computed((): StoreMovementRow[] =>
  sortByDate([
    ...ledger.value.incoming.map(row => ({
      id: `in-${row.id}`,
      dir: 'in' as const,
      date: row.date,
      created_at: row.created_at,
      party: row.counterparty,
      status_name: row.status_name ?? null,
      quantity_kg: row.quantity_kg,
      qty_before: row.qty_before,
      qty_after: row.qty_after,
      slot_name: row.slot_name || '—',
      slot_color: row.slot_color ?? null,
      raw: row
    })),
    ...ledger.value.outgoing.map(row => ({
      id: `out-${row.id}`,
      dir: 'out' as const,
      date: row.date,
      created_at: row.created_at,
      party: row.counterparty,
      status_name: row.status_name ?? null,
      quantity_kg: row.quantity_kg,
      qty_before: row.qty_before,
      qty_after: row.qty_after,
      slot_name: row.slot_name || '—',
      slot_color: row.slot_color ?? null,
      raw: row
    }))
  ])
)

const groupedWorkbookSlots = computed((): GroupedWorkbookSlot[] => {
  const slotFilter = selectedSlotId.value
  const visibleSlots = slots.value.filter(
    s => slotFilter === 'all' || s.id === slotFilter
  )

  return visibleSlots.map((slot) => {
    const incoming = productIncoming.value.filter(r => r.slot_id === slot.id)
    const outgoing = productOutgoing.value.filter(r => r.slot_id === slot.id)
    const balanced = applyRunningBalances(incoming, outgoing)
    const movements = sortByDate([
      ...balanced.incoming.map(row => ({
        id: `in-${row.id}`,
        dir: 'in' as const,
        date: row.date,
        created_at: row.created_at,
        party: row.counterparty,
        status_name: row.status_name ?? null,
        quantity_kg: row.quantity_kg,
        qty_before: row.qty_before,
        qty_after: row.qty_after,
        raw: row
      })),
      ...balanced.outgoing.map(row => ({
        id: `out-${row.id}`,
        dir: 'out' as const,
        date: row.date,
        created_at: row.created_at,
        party: row.counterparty,
        status_name: row.status_name ?? null,
        quantity_kg: row.quantity_kg,
        qty_before: row.qty_before,
        qty_after: row.qty_after,
        raw: row
      }))
    ])
    const kg_in = movements.filter(m => m.dir === 'in').reduce((s, r) => s + Number(r.quantity_kg || 0), 0)
    const kg_out = movements.filter(m => m.dir === 'out').reduce((s, r) => s + Number(r.quantity_kg || 0), 0)
    return {
      slot_id: slot.id,
      slot_name: slot.name,
      slot,
      movements,
      kg_in,
      kg_out,
      kg_remaining: kg_in - kg_out
    }
  })
})

const storeStats = computed(() => {
  const kgIn = stats.value.kgIn
  const kgOut = stats.value.kgOut
  const kgRemaining = stats.value.kgRemaining
  const wasteRatio = kgIn > 0.001 ? kgRemaining / kgIn : 0
  return {
    slotsCount: slots.value.length,
    kgIn,
    kgOut,
    kgRemaining,
    wasteRatio
  }
})

function movementCanEdit(toKind: string | null | undefined) {
  return toKind === 'sale' || toKind === 'mekla' || toKind === 'store_slot'
}

const workbookMovements = computed(() =>
  storeMovements.value.map(row => ({
    id: row.id,
    dir: row.dir,
    date: row.date,
    party: row.party,
    status_name: row.status_name,
    quantity_kg: row.quantity_kg,
    qty_before: row.qty_before,
    qty_after: row.qty_after,
    section_name: row.slot_name,
    can_edit: row.dir === 'out' ? movementCanEdit(row.raw?.to_kind) : undefined
  }))
)

const workbookSections = computed(() =>
  groupedWorkbookSlots.value.map(group => ({
    key: group.slot_id,
    section_name: group.slot_name,
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

function openEditSlotByIndex(sectionIndex: number) {
  const group = groupedWorkbookSlots.value[sectionIndex]
  if (!group?.slot) return
  openSlotEdit(group.slot)
}

async function deleteSlotByIndex(sectionIndex: number) {
  const group = groupedWorkbookSlots.value[sectionIndex]
  if (!group?.slot) return
  await softDeleteSlot(group.slot)
}

function openEditMovementFromSheet(
  scope: 'total' | 'section',
  dataIndex: number,
  sectionIndex?: number
) {
  if (scope === 'total') {
    const row = storeMovements.value[dataIndex]
    if (!row || row.dir !== 'out') return
    void openEditMovement(row.raw)
    return
  }
  const group = groupedWorkbookSlots.value[sectionIndex ?? -1]
  const row = group?.movements[dataIndex]
  if (!row || row.dir !== 'out') return
  void openEditMovement(row.raw)
}

async function deleteMovementFromSheet(
  scope: 'total' | 'section',
  dataIndex: number,
  sectionIndex?: number
) {
  if (scope === 'total') {
    const row = storeMovements.value[dataIndex]
    if (!row || row.dir !== 'out') return
    await deleteMovement(row.raw)
    return
  }
  const group = groupedWorkbookSlots.value[sectionIndex ?? -1]
  const row = group?.movements[dataIndex]
  if (!row || row.dir !== 'out') return
  await deleteMovement(row.raw)
}
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-3">
      <div class="flex flex-wrap items-center gap-2 sm:gap-3">
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <UButton
            :to="listPath"
            variant="ghost"
            color="neutral"
            icon="i-lucide-arrow-right"
            size="sm"
            aria-label="رجوع"
          />
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="truncate text-2xl font-semibold tracking-tight text-highlighted">
                {{ entity?.name || 'المخزن' }}
              </h2>
            </div>
            <p
              v-if="entity?.notes"
              class="mt-1 truncate text-sm text-muted"
            >
              {{ entity.notes }}
            </p>
          </div>
        </div>

        <div class="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <USelect
            v-if="!loading && slotOptions.length > 1"
            v-model="selectedSlotId"
            :items="slotOptions"
            value-key="value"
            label-key="label"
            class="w-52 shrink-0"
            placeholder="الخانة"
          />
          <UButton
            v-if="!loading"
            icon="i-lucide-plus"
            size="sm"
            class="shrink-0"
            @click="openSlotCreate"
          >
            إضافة خانة
          </UButton>
          <UButton
            v-if="!loading"
            icon="i-lucide-arrow-left-right"
            size="sm"
            color="primary"
            class="shrink-0"
            :disabled="!selectedProductId || stats.kgRemaining <= 0.001"
            @click="openTransfer"
          >
            تحويل من المخزن
          </UButton>
        </div>
      </div>
    </div>

    <div
      v-if="transferOpen"
      class="homos-scroll w-full overflow-x-auto rounded-lg border border-primary/40 bg-primary/5"
    >
      <div class="border-b border-primary/20 px-3 py-2 text-sm font-medium text-highlighted">
        {{ editingMovementId ? 'تعديل تحويل' : 'تحويل جديد' }}
      </div>
      <div class="flex w-max min-w-full items-end gap-2 p-3">
        <div class="w-40 shrink-0">
          <p class="mb-1 text-xs text-muted">
            الخانة المصدر
          </p>
          <USelect
            v-model="transferForm.from_slot_id"
            :items="transferFromSlotOptions"
            value-key="value"
            label-key="label"
            class="w-full"
            placeholder="اختر الخانة"
          />
          <p
            class="mt-1 text-xs text-muted"
            dir="ltr"
          >
            ({{ formatNumber(transferAvailableForForm) }} كجم)
          </p>
        </div>
        <div class="w-36 shrink-0">
          <p class="mb-1 text-xs text-muted">
            التاريخ
          </p>
          <UInput
            v-model="transferForm.movement_date"
            type="date"
            class="w-full"
            dir="ltr"
            :ui="cellInputUi"
          />
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
            :model-value="transferForm.to_kind"
            :items="transferKindOptions"
            value-key="value"
            label-key="label"
            class="w-full"
            @update:model-value="onTransferKindChange($event as 'sale' | 'mekla')"
          />
        </div>
        <div
          v-if="needsTransferDestination"
          class="w-40 shrink-0"
        >
          <p class="mb-1 text-xs text-muted">
            {{ transferToLabel }}
          </p>
          <USelect
            v-model="transferForm.to_id"
            :items="transferToOptions"
            value-key="value"
            label-key="label"
            class="w-full"
            :placeholder="`اختر ${transferToLabel}`"
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
        <div class="flex shrink-0 items-center gap-1 pb-0.5">
          <UButton
            size="sm"
            :loading="saving"
            :disabled="!(Number(transferForm.quantity_kg) > 0)"
            @click="saveTransfer"
          >
            حفظ
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
    </div>

    <div v-if="loading">
      <CardsSkeleton :count="2" />
    </div>

    <div
      v-else-if="!entity"
      class="rounded-lg border border-default p-8 text-center text-muted"
    >
      المخزن غير موجود
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
            <StoreDetailWorkbook
              :key="storeId"
              class="min-h-0 flex-1"
              :store-id="storeId"
              :stats="storeStats"
              :movements="workbookMovements"
              :sections="workbookSections"
              :open-edit-section="openEditSlotByIndex"
              :delete-section="deleteSlotByIndex"
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

    <UModal
      v-model:open="slotModalOpen"
      :title="editingSlot ? 'تعديل خانة' : 'إضافة خانة'"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField
            label="الاسم"
            required
          >
            <UInput
              v-model="slotForm.name"
              class="w-full"
              placeholder="مثال: رئيسي / A1"
            />
          </UFormField>
          <UFormField label="اللون">
            <div class="flex items-center gap-3">
              <input
                v-model="slotForm.color"
                type="color"
                class="size-10 cursor-pointer rounded-md border border-default bg-transparent p-1"
              >
              <UInput
                v-model="slotForm.color"
                class="w-full font-mono uppercase"
                dir="ltr"
                maxlength="7"
              />
            </div>
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-between gap-2">
          <UButton
            v-if="editingSlot"
            color="error"
            variant="outline"
            :loading="saving"
            @click="softDeleteSlot(editingSlot)"
          >
            حذف
          </UButton>
          <div class="ms-auto flex gap-2">
            <UButton
              color="neutral"
              variant="outline"
              @click="slotModalOpen = false"
            >
              إلغاء
            </UButton>
            <UButton
              :loading="saving"
              @click="saveSlot"
            >
              حفظ
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
