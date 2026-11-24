<script setup lang="ts">
import { formatNumber } from '~/utils/formatNumber'
import type { LocationMovementLite } from '~/features/stores/utils/stockLocationDetailBundle'

const props = defineProps<{
  meklaId: string
}>()

const {
  loading,
  isRefreshing,
  saving,
  entity,
  selectedProductId,
  ledger,
  stats,
  listPath,
  transferOpen,
  transferForm,
  transferKindOptions,
  transferToOptions,
  transferToSlotOptions,
  transferToLabel,
  needsTransferDestination,
  transferStatusOptions,
  transferAvailableKg,
  openTransfer,
  openEditMovement,
  deleteMovement,
  editingMovementId,
  onTransferKindChange,
  onTransferStoreChange,
  cancelTransfer,
  saveTransfer,
  setTransferQty
} = useMeklaDetail(() => props.meklaId)

type MovementDir = 'in' | 'out'

type MeklaMovementRow = {
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

const cellInputUi = { base: 'px-1.5 py-1.5 text-sm rounded-sm tabular-nums' }

const sortByDate = <T extends { date: string, created_at: string }>(rows: T[]) =>
  [...rows].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    if (byDate !== 0) return byDate
    return a.created_at.localeCompare(b.created_at)
  })

const meklaMovements = computed((): MeklaMovementRow[] =>
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
      raw: row
    }))
  ])
)

const meklaStats = computed(() => ({
  kgIn: stats.value.kgIn,
  kgOut: stats.value.kgOut,
  kgRemaining: stats.value.kgRemaining
}))

function movementCanEdit(toKind: string | null | undefined) {
  return toKind === 'sale' || toKind === 'store' || toKind === 'store_slot'
}

const workbookMovements = computed(() =>
  meklaMovements.value.map(row => ({
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
)

function openEditMovementFromSheet(dataIndex: number) {
  const row = meklaMovements.value[dataIndex]
  if (!row || row.dir !== 'out') return
  void openEditMovement(row.raw)
}

async function deleteMovementFromSheet(dataIndex: number) {
  const row = meklaMovements.value[dataIndex]
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
                {{ entity?.name || 'المقلى' }}
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
          <UButton
            v-if="!loading"
            icon="i-lucide-arrow-left-right"
            size="sm"
            color="primary"
            class="shrink-0"
            :disabled="!selectedProductId || stats.kgRemaining <= 0.001"
            @click="openTransfer"
          >
            تحويل من المقلى
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
        <div class="min-w-40 shrink-0">
          <p class="mb-1 text-xs text-muted">
            المصدر
          </p>
          <p class="text-sm font-medium text-highlighted whitespace-nowrap">
            {{ entity?.name || 'المقلى' }}
            <span
              class="ms-1 font-normal text-muted"
              dir="ltr"
            >
              ({{ formatNumber(transferAvailableKg) }} كجم)
            </span>
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
            @update:model-value="onTransferKindChange($event as 'sale' | 'store')"
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
            @update:model-value="transferForm.to_kind === 'store' ? onTransferStoreChange(String($event || '')) : undefined"
          />
        </div>
        <div
          v-if="transferForm.to_kind === 'store'"
          class="w-36 shrink-0"
        >
          <p class="mb-1 text-xs text-muted">
            الخانة
          </p>
          <USelect
            v-model="transferForm.to_slot_id"
            :items="transferToSlotOptions"
            value-key="value"
            label-key="label"
            class="w-full"
            placeholder="اختر الخانة"
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
      المقلى غير موجود
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
            <MeklaDetailWorkbook
              :key="meklaId"
              class="min-h-0 flex-1"
              :mekla-id="meklaId"
              :stats="meklaStats"
              :movements="workbookMovements"
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
  </div>
</template>
