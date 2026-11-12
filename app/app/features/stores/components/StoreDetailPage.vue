<script setup lang="ts">
import { formatNumber } from '~/utils/formatNumber'

const props = defineProps<{
  storeId: string
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
  transferToLabel,
  needsTransferDestination,
  transferStatusOptions,
  transferAvailableKg,
  openTransfer,
  onTransferKindChange,
  cancelTransfer,
  saveTransfer,
  setTransferQty
} = useStoreDetail(() => props.storeId)

const showProductCol = computed(() => !selectedProductId.value)
const tableColspan = computed(() => (showProductCol.value ? 8 : 7))

type MovementDir = 'in' | 'out'
type StoreMovementRow = {
  id: string
  dir: MovementDir
  date: string
  created_at: string
  party: string
  product_name: string | null
  status_name: string | null
  quantity_kg: number
  qty_before: number
  qty_after: number
  notes: string | null
}

const sortByDate = <T extends { date: string, created_at: string }>(rows: T[]) =>
  [...rows].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    if (byDate !== 0) return byDate
    return a.created_at.localeCompare(b.created_at)
  })

const movements = computed((): StoreMovementRow[] =>
  sortByDate([
    ...ledger.value.incoming.map(row => ({
      id: `in-${row.id}`,
      dir: 'in' as const,
      date: row.date,
      created_at: row.created_at,
      party: row.counterparty,
      product_name: row.product_name,
      status_name: row.status_name,
      quantity_kg: row.quantity_kg,
      qty_before: row.qty_before,
      qty_after: row.qty_after,
      notes: row.notes
    })),
    ...ledger.value.outgoing.map(row => ({
      id: `out-${row.id}`,
      dir: 'out' as const,
      date: row.date,
      created_at: row.created_at,
      party: row.counterparty,
      product_name: row.product_name,
      status_name: row.status_name,
      quantity_kg: row.quantity_kg,
      qty_before: row.qty_before,
      qty_after: row.qty_after,
      notes: row.notes
    }))
  ])
)

const statsCardUi = { body: 'p-2 sm:p-2.5' }
const cellInputUi = { base: 'px-1.5 py-1.5 text-sm rounded-sm tabular-nums' }
const tableClass = 'w-max min-w-full border-collapse text-sm text-center whitespace-nowrap tabular-nums'
const tablePanelClass = 'flex w-max min-w-full flex-col rounded-lg border border-default'
const cellNowrapClass = 'p-2 whitespace-nowrap'
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-nowrap items-center gap-2 sm:gap-3">
      <div class="flex min-w-0 shrink items-center gap-2">
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

      <div
        v-if="!loading"
        class="homos-scroll mx-auto flex min-w-0 flex-1 flex-nowrap items-stretch justify-center gap-1.5 overflow-x-auto tabular-nums"
      >
        <UCard
          class="min-w-24 shrink-0 text-center"
          :ui="statsCardUi"
        >
          <p class="text-xs font-medium text-muted">
            وارد
          </p>
          <p
            class="mt-0.5 text-base font-semibold tracking-tight text-highlighted"
            dir="ltr"
          >
            {{ formatNumber(stats.kgIn) }}
          </p>
        </UCard>
        <UCard
          class="min-w-24 shrink-0 text-center"
          :ui="statsCardUi"
        >
          <p class="text-xs font-medium text-muted">
            منصرف
          </p>
          <p
            class="mt-0.5 text-base font-semibold tracking-tight text-highlighted"
            dir="ltr"
          >
            {{ formatNumber(stats.kgOut) }}
          </p>
        </UCard>
        <UCard
          class="min-w-24 shrink-0 text-center"
          :ui="statsCardUi"
        >
          <p class="text-xs font-medium text-muted">
            الرصيد
          </p>
          <p
            class="mt-0.5 text-base font-semibold tracking-tight text-highlighted"
            dir="ltr"
          >
            {{ formatNumber(stats.kgRemaining) }}
          </p>
        </UCard>
      </div>

      <div class="flex shrink-0 flex-nowrap items-center justify-end gap-2">
        <UButton
          v-if="!loading"
          icon="i-lucide-arrow-left-right"
          size="sm"
          color="primary"
          class="shrink-0"
          :disabled="!selectedProductId || stats.kgRemaining <= 0.001"
          @click="openTransfer"
        >
          تحويل
        </UButton>
      </div>
    </div>

    <div
      v-if="transferOpen"
      class="homos-scroll w-full overflow-x-auto rounded-lg border border-primary/40 bg-primary/5"
    >
      <div class="flex w-max min-w-full items-end gap-2 p-3">
        <div class="min-w-40 shrink-0">
          <p class="mb-1 text-xs text-muted">
            المصدر
          </p>
          <p class="text-sm font-medium text-highlighted whitespace-nowrap">
            {{ entity?.name || 'المخزن' }}
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
        <div class="w-44 shrink-0">
          <p class="mb-1 text-xs text-muted">
            ملاحظات
          </p>
          <UInput
            v-model="transferForm.notes"
            class="w-full"
            :ui="cellInputUi"
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
      <TableSkeleton :cols="6" />
    </div>

    <div
      v-else-if="!entity"
      class="rounded-lg border border-default p-8 text-center text-muted"
    >
      المخزن غير موجود
    </div>

    <div
      v-else
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

      <div class="homos-scroll overflow-x-auto">
        <div :class="tablePanelClass">
          <div class="flex shrink-0 items-center gap-2 border-b border-default bg-elevated/70 px-3 py-2">
            <p class="text-sm font-semibold text-highlighted">
              الحركة علي المخزن
            </p>
            <UBadge
              size="sm"
              variant="subtle"
              color="neutral"
            >
              {{ movements.length }}
            </UBadge>
          </div>
          <table
            dir="rtl"
            :class="tableClass"
          >
            <thead class="bg-elevated text-muted">
              <tr>
                <th :class="cellNowrapClass + ' font-medium'" />
                <th :class="cellNowrapClass + ' font-medium'">
                  التاريخ
                </th>
                <th :class="cellNowrapClass + ' font-medium text-start'">
                  الطرف
                </th>
                <th
                  v-if="showProductCol"
                  :class="cellNowrapClass + ' font-medium text-start'"
                >
                  الصنف
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
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in movements"
                :key="row.id"
                class="border-t border-default"
              >
                <td :class="cellNowrapClass">
                  <UIcon
                    :name="row.dir === 'in' ? 'i-lucide-arrow-down-left' : 'i-lucide-arrow-up-right'"
                    :class="row.dir === 'in' ? 'size-4 text-success' : 'size-4 text-primary'"
                  />
                </td>
                <td
                  :class="cellNowrapClass"
                  dir="ltr"
                >
                  {{ row.date }}
                </td>
                <td :class="cellNowrapClass + ' text-start'">
                  {{ row.party }}
                </td>
                <td
                  v-if="showProductCol"
                  :class="cellNowrapClass + ' text-start'"
                >
                  {{ row.product_name || '—' }}
                </td>
                <td :class="cellNowrapClass + ' text-start'">
                  {{ row.status_name || '—' }}
                </td>
                <td
                  :class="cellNowrapClass + ' text-muted'"
                  dir="ltr"
                >
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
                <td
                  :class="cellNowrapClass + ' font-medium text-highlighted'"
                  dir="ltr"
                >
                  {{ formatNumber(row.qty_after) }}
                </td>
              </tr>
              <tr v-if="!movements.length">
                <td
                  :colspan="tableColspan"
                  class="p-4 text-center text-muted"
                >
                  لا توجد حركات
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
