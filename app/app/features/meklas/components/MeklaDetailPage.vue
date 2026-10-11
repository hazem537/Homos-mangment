<script setup lang="ts">
import { formatNumber } from '~/utils/formatNumber'

const props = defineProps<{
  meklaId: string
}>()

const {
  loading,
  saving,
  entity,
  activeSeasonName,
  selectedProductId,
  productOptions,
  ledger,
  stats,
  listPath,
  transferOpen,
  transferForm,
  transferKindOptions,
  transferStatusOptions,
  transferAvailableKg,
  openTransfer,
  cancelTransfer,
  saveTransfer,
  setTransferQty
} = useMeklaDetail(() => props.meklaId)

const statsCardUi = { body: 'p-2 sm:p-2.5' }
const cellInputUi = { base: 'px-1.5 py-1.5 text-sm rounded-sm tabular-nums' }
const tableClass = 'w-max min-w-full border-collapse text-sm text-center whitespace-nowrap tabular-nums'
const tablePanelClass = 'flex min-w-max flex-1 flex-col rounded-lg border border-default'
const tablesRowClass = 'flex w-max min-w-full items-stretch gap-3'
const cellNowrapClass = 'p-2 whitespace-nowrap'
const notesThClass = 'p-2 font-medium whitespace-nowrap'
const notesTdClass = 'p-2 text-muted text-start whitespace-nowrap'
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
              {{ entity?.name || 'المقلى' }}
            </h2>
            <UBadge
              v-if="activeSeasonName"
              variant="subtle"
              size="sm"
              color="warning"
            >
              {{ activeSeasonName }}
            </UBadge>
          </div>
          <p v-if="entity?.notes" class="mt-1 truncate text-sm text-muted">
            {{ entity.notes }}
          </p>
        </div>
      </div>

      <div
        v-if="!loading"
        class="homos-scroll mx-auto flex min-w-0 flex-1 flex-nowrap items-stretch justify-center gap-1.5 overflow-x-auto tabular-nums"
      >
        <UCard class="min-w-24 shrink-0 text-center" :ui="statsCardUi">
          <p class="text-xs font-medium text-muted">
            وارد
          </p>
          <p class="mt-0.5 text-base font-semibold tracking-tight text-highlighted" dir="ltr">
            {{ formatNumber(stats.kgIn) }}
          </p>
        </UCard>
        <UCard class="min-w-24 shrink-0 text-center" :ui="statsCardUi">
          <p class="text-xs font-medium text-muted">
            منصرف
          </p>
          <p class="mt-0.5 text-base font-semibold tracking-tight text-highlighted" dir="ltr">
            {{ formatNumber(stats.kgOut) }}
          </p>
        </UCard>
        <UCard class="min-w-24 shrink-0 text-center" :ui="statsCardUi">
          <p class="text-xs font-medium text-muted">
            الرصيد
          </p>
          <p class="mt-0.5 text-base font-semibold tracking-tight text-highlighted" dir="ltr">
            {{ formatNumber(stats.kgRemaining) }}
          </p>
        </UCard>
      </div>

      <div class="flex shrink-0 flex-nowrap items-center justify-end gap-2">
        <USelect
          v-if="!loading && productOptions.length"
          v-model="selectedProductId"
          :items="productOptions"
          value-key="value"
          label-key="label"
          class="w-40 shrink-0"
          placeholder="الصنف"
        />
        <UButton
          v-if="!loading"
          icon="i-lucide-arrow-left-right"
          size="sm"
          color="warning"
          variant="soft"
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
      class="homos-scroll w-full overflow-x-auto rounded-lg border border-warning/40 bg-warning/5"
    >
      <div class="flex w-max min-w-full items-end gap-2 p-3">
        <div class="min-w-40 shrink-0">
          <p class="mb-1 text-xs text-muted">
            المصدر
          </p>
          <p class="text-sm font-medium text-highlighted whitespace-nowrap">
            {{ entity?.name || 'المقلى' }}
            <span class="ms-1 text-muted font-normal" dir="ltr">
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
      المقلى غير موجود
    </div>

    <div
      v-else
      class="homos-scroll overflow-x-auto"
    >
      <div :class="tablesRowClass">
        <div :class="tablePanelClass">
          <div class="flex shrink-0 items-center gap-2 border-b border-default bg-elevated/70 px-3 py-2">
            <UIcon name="i-lucide-arrow-down-left" class="size-4 text-success" />
            <p class="text-sm font-semibold text-highlighted">
              الوارد إلى المقلى
            </p>
            <UBadge size="sm" variant="subtle" color="neutral">
              {{ ledger.incoming.length }}
            </UBadge>
          </div>
          <table dir="rtl" :class="tableClass">
            <thead class="bg-elevated text-muted">
              <tr>
                <th :class="cellNowrapClass + ' font-medium'">
                  التاريخ
                </th>
                <th :class="cellNowrapClass + ' font-medium text-start'">
                  المصدر
                </th>
                <th :class="cellNowrapClass + ' font-medium text-start'">
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
                <th :class="notesThClass">
                  ملاحظات
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in ledger.incoming"
                :key="`in-${row.id}`"
                class="border-t border-default"
              >
                <td :class="cellNowrapClass" dir="ltr">
                  {{ row.date }}
                </td>
                <td :class="cellNowrapClass + ' text-start'">
                  {{ row.counterparty }}
                </td>
                <td :class="cellNowrapClass + ' text-start'">
                  {{ row.product_name || '—' }}
                </td>
                <td :class="cellNowrapClass + ' text-start'">
                  {{ row.status_name || '—' }}
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
              <tr v-if="!ledger.incoming.length">
                <td colspan="8" class="p-4 text-center text-muted">
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
              المنصرف من المقلى
            </p>
            <UBadge size="sm" variant="subtle" color="neutral">
              {{ ledger.outgoing.length }}
            </UBadge>
          </div>
          <table dir="rtl" :class="tableClass">
            <thead class="bg-elevated text-muted">
              <tr>
                <th :class="cellNowrapClass + ' font-medium'">
                  التاريخ
                </th>
                <th :class="cellNowrapClass + ' font-medium text-start'">
                  الوجهة
                </th>
                <th :class="cellNowrapClass + ' font-medium text-start'">
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
                <th :class="notesThClass">
                  ملاحظات
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in ledger.outgoing"
                :key="`out-${row.id}`"
                class="border-t border-default"
              >
                <td :class="cellNowrapClass" dir="ltr">
                  {{ row.date }}
                </td>
                <td :class="cellNowrapClass + ' text-start'">
                  {{ row.counterparty }}
                </td>
                <td :class="cellNowrapClass + ' text-start'">
                  {{ row.product_name || '—' }}
                </td>
                <td :class="cellNowrapClass + ' text-start'">
                  {{ row.status_name || '—' }}
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
              <tr v-if="!ledger.outgoing.length">
                <td colspan="8" class="p-4 text-center text-muted">
                  لا يوجد منصرف
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
