<script setup lang="ts">
import { formatNumber } from '~/utils/formatNumber'

const props = defineProps<{
  warehouseId: string
}>()

const {
  loading,
  saving,
  warehouse,
  filteredSectionCards,
  warehouseLedgerCard,
  showWarehouseLedger,
  warehouseStats,
  selectedSectionId,
  sectionFilterOptions,
  activeSeasonName,
  sectionModalOpen,
  sectionForm,
  transferModalOpen,
  transferFromSection,
  transferForm,
  transferToOptions,
  openCreateSection,
  openEditSection,
  saveSection,
  softDeleteSection,
  openTransfer,
  onTransferKindChange,
  saveTransfer,
  setTransferQty
} = useWarehouseDetail(() => props.warehouseId)

const transferKindOptions = [
  { label: 'مخزن', value: 'store' },
  { label: 'مقلى', value: 'mekla' }
]

const statsCardUi = { body: 'p-2 sm:p-2.5' }
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center gap-3">
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
        class="homos-scroll mx-auto flex flex-nowrap items-stretch justify-center gap-1.5 overflow-x-auto tabular-nums"
      >
        <UCard class="min-w-24 shrink-0 text-center" :ui="statsCardUi">
          <p class="text-xs font-medium text-muted">
            الأرباع
          </p>
          <p class="mt-0.5 text-base font-semibold tracking-tight text-highlighted" dir="ltr">
            {{ warehouseStats.sectionsCount }}
          </p>
        </UCard>
        <UCard class="min-w-28 shrink-0 text-center" :ui="statsCardUi">
          <p class="text-xs font-medium text-muted">
            وارد
          </p>
          <p class="mt-0.5 text-base font-semibold tracking-tight text-highlighted" dir="ltr">
            {{ formatNumber(warehouseStats.kgIn) }}
          </p>
        </UCard>
        <UCard class="min-w-28 shrink-0 text-center" :ui="statsCardUi">
          <p class="text-xs font-medium text-muted">
            منصرف
          </p>
          <p class="mt-0.5 text-base font-semibold tracking-tight text-highlighted" dir="ltr">
            {{ formatNumber(warehouseStats.kgOut) }}
          </p>
        </UCard>
        <UCard class="min-w-28 shrink-0 text-center" :ui="statsCardUi">
          <p class="text-xs font-medium text-muted">
            الرصيد
          </p>
          <p class="mt-0.5 text-base font-semibold tracking-tight text-highlighted" dir="ltr">
            {{ formatNumber(warehouseStats.kgRemaining) }}
          </p>
        </UCard>
      </div>

      <div class="flex flex-1 justify-end">
        <UButton icon="i-lucide-plus" size="sm" @click="openCreateSection">
          إضافة ربع
        </UButton>
      </div>
    </div>

    <div v-if="loading">
      <CardsSkeleton :count="3" />
    </div>

    <template v-else>
      <div class="flex flex-wrap items-end justify-between gap-3">
        <UFormField label="عرض الربع" class="min-w-56">
          <USelect
            v-model="selectedSectionId"
            :items="sectionFilterOptions"
            value-key="value"
            label-key="label"
            class="w-56"
          />
        </UFormField>
      </div>

      <UCard
        v-if="showWarehouseLedger && filteredSectionCards.length"
        class="flex max-h-[min(70vh,36rem)] flex-col overflow-hidden"
        :ui="{ body: 'flex min-h-0 flex-1 flex-col gap-4 space-y-0 overflow-hidden p-4 sm:p-5' }"
      >
        <div class="flex shrink-0 flex-wrap items-center gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="h-4 w-1 shrink-0 rounded-full bg-warning" />
              <h3 class="text-lg font-semibold text-highlighted">
                إجمالي حركات الشونة
              </h3>
            </div>
          </div>

          <div class="homos-scroll mx-auto flex flex-nowrap items-stretch justify-center gap-1.5 overflow-x-auto tabular-nums text-sm">
            <div class="shrink-0 rounded-md bg-elevated/80 px-3 py-1.5 text-center">
              <span class="text-xs text-muted">وارد</span>
              <span class="ms-2 font-semibold" dir="ltr">
                {{ formatNumber(warehouseLedgerCard.kg_in) }}
              </span>
            </div>
            <div class="shrink-0 rounded-md bg-elevated/80 px-3 py-1.5 text-center">
              <span class="text-xs text-muted">منصرف</span>
              <span class="ms-2 font-semibold" dir="ltr">
                {{ formatNumber(warehouseLedgerCard.kg_out) }}
              </span>
            </div>
            <div class="shrink-0 rounded-md bg-warning/10 px-3 py-1.5 text-center">
              <span class="text-xs text-muted">رصيد</span>
              <span class="ms-2 font-semibold text-highlighted" dir="ltr">
                {{ formatNumber(warehouseLedgerCard.kg_remaining) }}
              </span>
            </div>
          </div>

          <div class="flex-1" />
        </div>

        <div class="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-2">
          <div class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-default">
            <div class="flex shrink-0 items-center gap-2 border-b border-default bg-elevated/70 px-3 py-2">
              <UIcon name="i-lucide-arrow-down-left" class="size-4 text-success" />
              <p class="text-sm font-semibold text-highlighted">
                الوارد إلى الشونة
              </p>
              <UBadge size="sm" variant="subtle" color="neutral">
                {{ warehouseLedgerCard.incoming.length }}
              </UBadge>
            </div>
            <div class="homos-scroll min-h-0 flex-1 overflow-auto">
              <table dir="rtl" class="w-full text-sm text-center tabular-nums">
                <thead class="sticky top-0 bg-elevated text-muted">
                  <tr>
                    <th class="p-2 font-medium">
                      التاريخ
                    </th>
                    <th class="p-2 font-medium text-start">
                      الربع
                    </th>
                    <th class="p-2 font-medium">
                      المصدر
                    </th>
                    <th class="p-2 font-medium" title="رصيد الشونة قبل الحركة">
                      قبل
                    </th>
                    <th class="p-2 font-medium">
                      كجم
                    </th>
                    <th class="p-2 font-medium" title="رصيد الشونة بعد الحركة">
                      بعد
                    </th>
                    <th class="p-2 font-medium">
                      ملاحظات
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in warehouseLedgerCard.incoming"
                    :key="`wh-in-${row.id}`"
                    class="border-t border-default"
                  >
                    <td class="p-2" dir="ltr">
                      {{ row.date }}
                    </td>
                    <td class="p-2 text-start font-medium">
                      {{ row.section_name }}
                    </td>
                    <td class="p-2 text-start">
                      {{ row.source }}
                    </td>
                    <td class="p-2 text-muted" dir="ltr">
                      {{ formatNumber(row.qty_before) }}
                    </td>
                    <td class="p-2 font-medium" dir="ltr">
                      {{ formatNumber(row.quantity_kg) }}
                    </td>
                    <td class="p-2 font-medium text-highlighted" dir="ltr">
                      {{ formatNumber(row.qty_after) }}
                    </td>
                    <td class="p-2 text-muted">
                      {{ row.notes || '—' }}
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
          </div>

          <div class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-default">
            <div class="flex shrink-0 items-center gap-2 border-b border-default bg-elevated/70 px-3 py-2">
              <UIcon name="i-lucide-arrow-up-right" class="size-4 text-warning" />
              <p class="text-sm font-semibold text-highlighted">
                المنصرف من الشونة
              </p>
              <UBadge size="sm" variant="subtle" color="neutral">
                {{ warehouseLedgerCard.outgoing.length }}
              </UBadge>
            </div>
            <div class="homos-scroll min-h-0 flex-1 overflow-auto">
              <table dir="rtl" class="w-full text-sm text-center tabular-nums">
                <thead class="sticky top-0 bg-elevated text-muted">
                  <tr>
                    <th class="p-2 font-medium">
                      التاريخ
                    </th>
                    <th class="p-2 font-medium text-start">
                      الربع
                    </th>
                    <th class="p-2 font-medium">
                      الوجهة
                    </th>
                    <th class="p-2 font-medium" title="رصيد الشونة قبل الحركة">
                      قبل
                    </th>
                    <th class="p-2 font-medium">
                      كجم
                    </th>
                    <th class="p-2 font-medium" title="رصيد الشونة بعد الحركة">
                      بعد
                    </th>
                    <th class="p-2 font-medium">
                      ملاحظات
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in warehouseLedgerCard.outgoing"
                    :key="`wh-out-${row.id}`"
                    class="border-t border-default"
                  >
                    <td class="p-2" dir="ltr">
                      {{ row.date }}
                    </td>
                    <td class="p-2 text-start font-medium">
                      {{ row.section_name }}
                    </td>
                    <td class="p-2 text-start">
                      {{ row.destination }}
                    </td>
                    <td class="p-2 text-muted" dir="ltr">
                      {{ formatNumber(row.qty_before) }}
                    </td>
                    <td class="p-2 font-medium" dir="ltr">
                      {{ formatNumber(row.quantity_kg) }}
                    </td>
                    <td class="p-2 font-medium text-highlighted" dir="ltr">
                      {{ formatNumber(row.qty_after) }}
                    </td>
                    <td class="p-2 text-muted">
                      {{ row.notes || '—' }}
                    </td>
                  </tr>
                  <tr v-if="!warehouseLedgerCard.outgoing.length">
                    <td colspan="7" class="p-4 text-center text-muted">
                      لا يوجد منصرف
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </UCard>

      <div
        v-if="!filteredSectionCards.length"
        class="rounded-lg border border-default bg-elevated/40 p-8 text-center text-muted"
      >
        لا توجد أرباع — أضف ربعاً للبدء
      </div>

      <div v-else class="space-y-5">
        <UCard
          v-for="card in filteredSectionCards"
          :key="card.section_id"
          class="flex max-h-[min(70vh,36rem)] flex-col overflow-hidden"
          :ui="{ body: 'flex min-h-0 flex-1 flex-col gap-4 space-y-0 overflow-hidden p-4 sm:p-5' }"
        >
          <div class="flex shrink-0 flex-wrap items-center gap-3">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <span class="h-4 w-1 shrink-0 rounded-full bg-warning" />
                <h3 class="text-lg font-semibold text-highlighted">
                  {{ card.section_name }}
                </h3>
              </div>
              <p v-if="card.notes" class="mt-1 text-sm text-muted">
                {{ card.notes }}
              </p>
            </div>

            <div class="homos-scroll mx-auto flex flex-nowrap items-stretch justify-center gap-1.5 overflow-x-auto tabular-nums text-sm">
              <div class="shrink-0 rounded-md bg-elevated/80 px-3 py-1.5 text-center">
                <span class="text-xs text-muted">وارد</span>
                <span class="ms-2 font-semibold" dir="ltr">
                  {{ formatNumber(card.kg_in) }}
                </span>
              </div>
              <div class="shrink-0 rounded-md bg-elevated/80 px-3 py-1.5 text-center">
                <span class="text-xs text-muted">منصرف</span>
                <span class="ms-2 font-semibold" dir="ltr">
                  {{ formatNumber(card.kg_out) }}
                </span>
              </div>
              <div class="shrink-0 rounded-md bg-warning/10 px-3 py-1.5 text-center">
                <span class="text-xs text-muted">رصيد</span>
                <span class="ms-2 font-semibold text-highlighted" dir="ltr">
                  {{ formatNumber(card.kg_remaining) }}
                </span>
              </div>
            </div>

            <div class="flex flex-1 shrink-0 justify-end gap-1">
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

          <div class="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-2">
            <div class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-default">
              <div class="flex shrink-0 items-center gap-2 border-b border-default bg-elevated/70 px-3 py-2">
                <UIcon name="i-lucide-arrow-down-left" class="size-4 text-success" />
                <p class="text-sm font-semibold text-highlighted">
                  الوارد إلى الربع
                </p>
                <UBadge size="sm" variant="subtle" color="neutral">
                  {{ card.incoming.length }}
                </UBadge>
              </div>
              <div class="homos-scroll min-h-0 flex-1 overflow-auto">
                <table dir="rtl" class="w-full text-sm text-center tabular-nums">
                  <thead class="sticky top-0 bg-elevated text-muted">
                    <tr>
                      <th class="p-2 font-medium">
                        التاريخ
                      </th>
                      <th class="p-2 font-medium">
                        المصدر
                      </th>
                      <th class="p-2 font-medium" title="الرصيد قبل الحركة">
                        قبل
                      </th>
                      <th class="p-2 font-medium">
                        كجم
                      </th>
                      <th class="p-2 font-medium" title="الرصيد بعد الحركة">
                        بعد
                      </th>
                      <th class="p-2 font-medium">
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
                      <td class="p-2" dir="ltr">
                        {{ row.date }}
                      </td>
                      <td class="p-2 text-start">
                        {{ row.source }}
                      </td>
                      <td class="p-2 text-muted" dir="ltr">
                        {{ formatNumber(row.qty_before) }}
                      </td>
                      <td class="p-2 font-medium" dir="ltr">
                        {{ formatNumber(row.quantity_kg) }}
                      </td>
                      <td class="p-2 font-medium text-highlighted" dir="ltr">
                        {{ formatNumber(row.qty_after) }}
                      </td>
                      <td class="p-2 text-muted">
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
            </div>

            <div class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-default">
              <div class="flex shrink-0 items-center gap-2 border-b border-default bg-elevated/70 px-3 py-2">
                <UIcon name="i-lucide-arrow-up-right" class="size-4 text-warning" />
                <p class="text-sm font-semibold text-highlighted">
                  المنصرف من الربع
                </p>
                <UBadge size="sm" variant="subtle" color="neutral">
                  {{ card.outgoing.length }}
                </UBadge>
              </div>
              <div class="homos-scroll min-h-0 flex-1 overflow-auto">
                <table dir="rtl" class="w-full text-sm text-center tabular-nums">
                  <thead class="sticky top-0 bg-elevated text-muted">
                    <tr>
                      <th class="p-2 font-medium">
                        التاريخ
                      </th>
                      <th class="p-2 font-medium">
                        الوجهة
                      </th>
                      <th class="p-2 font-medium" title="الرصيد قبل الحركة">
                        قبل
                      </th>
                      <th class="p-2 font-medium">
                        كجم
                      </th>
                      <th class="p-2 font-medium" title="الرصيد بعد الحركة">
                        بعد
                      </th>
                      <th class="p-2 font-medium">
                        ملاحظات
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in card.outgoing"
                      :key="`out-${row.id}`"
                      class="border-t border-default"
                    >
                      <td class="p-2" dir="ltr">
                        {{ row.date }}
                      </td>
                      <td class="p-2 text-start">
                        {{ row.destination }}
                      </td>
                      <td class="p-2 text-muted" dir="ltr">
                        {{ formatNumber(row.qty_before) }}
                      </td>
                      <td class="p-2 font-medium" dir="ltr">
                        {{ formatNumber(row.quantity_kg) }}
                      </td>
                      <td class="p-2 font-medium text-highlighted" dir="ltr">
                        {{ formatNumber(row.qty_after) }}
                      </td>
                      <td class="p-2 text-muted">
                        {{ row.notes || '—' }}
                      </td>
                    </tr>
                    <tr v-if="!card.outgoing.length">
                      <td colspan="6" class="p-4 text-center text-muted">
                        لا يوجد منصرف
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </UCard>
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

    <UModal v-model:open="transferModalOpen" title="تحويل من ربع">
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-muted">
            من: {{ transferFromSection?.section_name }}
            — المتاح
            <span dir="ltr">{{ formatNumber(transferFromSection?.kg_remaining || 0) }}</span>
            كجم
          </p>
          <UFormField label="التاريخ" required>
            <UInput v-model="transferForm.movement_date" type="date" class="w-full" dir="ltr" />
          </UFormField>
          <UFormField label="نوع الوجهة" required>
            <USelect
              v-model="transferForm.to_kind"
              :items="transferKindOptions"
              value-key="value"
              label-key="label"
              class="w-full"
              @update:model-value="onTransferKindChange"
            />
          </UFormField>
          <UFormField label="الوجهة" required>
            <USelect
              v-model="transferForm.to_id"
              :items="transferToOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>
          <UFormField label="الكمية (كجم)" required>
            <DecimalInput
              :model-value="transferForm.quantity_kg"
              placeholder="كجم"
              @update:model-value="setTransferQty"
            />
          </UFormField>
          <UFormField label="ملاحظات">
            <UTextarea v-model="transferForm.notes" class="w-full" :rows="2" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="transferModalOpen = false">
            إلغاء
          </UButton>
          <UButton :loading="saving" @click="saveTransfer">
            تحويل
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
