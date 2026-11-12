<script setup lang="ts">
import type { AccountTypeRow } from '~/composables/useAccountTypes'

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  /** Fired after types list changes so parent select can refresh selection. */
  changed: []
}>()

const {
  types,
  loading,
  saving,
  loadTypes,
  createType,
  updateType,
  deactivateType
} = useAccountTypes()

const { confirm: askConfirm } = useConfirmDialog()

type DraftRow = {
  id: string
  name: string
  notes: string
  /** Snapshot for dirty detection */
  originalName: string
  originalNotes: string
}

type NewRow = {
  name: string
  notes: string
}

const drafts = ref<DraftRow[]>([])
const newRow = ref<NewRow>({ name: '', notes: '' })
const focusKey = ref<string | null>(null)
const cellSaving = ref(false)

const syncDrafts = () => {
  drafts.value = types.value.map((t: AccountTypeRow) => ({
    id: t.id,
    name: t.name,
    notes: t.notes || '',
    originalName: t.name,
    originalNotes: t.notes || ''
  }))
  newRow.value = { name: '', notes: '' }
}

watch(open, async (isOpen) => {
  if (!isOpen) return
  await loadTypes()
  syncDrafts()
  await nextTick()
  focusKey.value = drafts.value.length ? `name:${drafts.value[0]!.id}` : 'new:name'
})

watch(types, () => {
  if (open.value) syncDrafts()
})

const isDirty = (row: DraftRow) =>
  row.name.trim() !== row.originalName.trim()
  || row.notes.trim() !== row.originalNotes.trim()

const commitRow = async (row: DraftRow) => {
  if (!isDirty(row) || cellSaving.value) return
  const name = row.name.trim()
  if (!name) {
    row.name = row.originalName
    return
  }
  cellSaving.value = true
  try {
    const ok = await updateType(row.id, {
      name,
      notes: row.notes
    })
    if (ok) emit('changed')
    else {
      row.name = row.originalName
      row.notes = row.originalNotes
    }
  } finally {
    cellSaving.value = false
  }
}

const commitNew = async () => {
  const name = newRow.value.name.trim()
  if (!name || cellSaving.value) return
  cellSaving.value = true
  try {
    const id = await createType(name, newRow.value.notes)
    if (id) {
      emit('changed')
      newRow.value = { name: '', notes: '' }
      focusKey.value = 'new:name'
    }
  } finally {
    cellSaving.value = false
  }
}

/** Only create when focus leaves the whole new-row (not when tabbing name → notes). */
const onNewBlur = async (e: FocusEvent) => {
  await nextTick()
  const related = e.relatedTarget as HTMLElement | null
  if (related?.closest?.('[data-new-row]')) return
  await commitNew()
}

const onHide = async (row: DraftRow) => {
  const ok = await askConfirm(
    `إخفاء النوع «${row.name}»؟\nلن يظهر في القوائم الجديدة، والموردون المرتبطون يحتفظون به.`
  )
  if (!ok) return
  const done = await deactivateType(row.id)
  if (done) emit('changed')
}

const onKeyCell = async (
  e: KeyboardEvent,
  kind: 'draft' | 'new',
  field: 'name' | 'notes',
  row?: DraftRow
) => {
  if (e.key === 'Enter') {
    e.preventDefault()
    if (kind === 'draft' && row) await commitRow(row)
    else await commitNew()
  }
  if (e.key === 'Escape' && kind === 'draft' && row) {
    row.name = row.originalName
    row.notes = row.originalNotes
    ;(e.target as HTMLInputElement)?.blur()
  }
}

const inputClass
  = 'w-full rounded-none border-0 bg-transparent px-2 py-1.5 text-sm shadow-none ring-0 focus:bg-default focus:ring-1 focus:ring-primary'
</script>

<template>
  <UModal
    v-model:open="open"
    title="إدارة أنواع الحساب"
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <p class="mb-3 text-xs text-muted">
        عدّل الخلايا مباشرة مثل Excel — Enter أو الخروج من الخلية يحفظ. الصف الأخير لإضافة نوع جديد.
      </p>

      <div
        v-if="loading && !drafts.length"
        class="py-8 text-center text-muted"
      >
        جاري التحميل…
      </div>

      <div
        v-else
        class="overflow-hidden rounded-lg border border-default"
      >
        <div class="overflow-x-auto">
          <table
            dir="rtl"
            class="w-full min-w-[28rem] text-sm"
          >
            <thead class="bg-accented text-highlighted">
              <tr>
                <th class="w-[40%] p-2 text-start font-semibold">
                  الاسم
                </th>
                <th class="p-2 text-start font-semibold">
                  ملاحظات
                </th>
                <th class="w-24 p-2 text-center font-semibold">
                  إجراءات
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in drafts"
                :key="row.id"
                class="border-t border-default"
                :class="isDirty(row) ? 'bg-primary/5' : 'hover:bg-muted/40'"
              >
                <td class="border-e border-default/60 p-0">
                  <input
                    v-model="row.name"
                    type="text"
                    :class="inputClass"
                    :disabled="saving || cellSaving"
                    @focus="focusKey = `name:${row.id}`"
                    @blur="commitRow(row)"
                    @keydown="onKeyCell($event, 'draft', 'name', row)"
                  >
                </td>
                <td class="border-e border-default/60 p-0">
                  <input
                    v-model="row.notes"
                    type="text"
                    :class="inputClass"
                    :disabled="saving || cellSaving"
                    placeholder="—"
                    @focus="focusKey = `notes:${row.id}`"
                    @blur="commitRow(row)"
                    @keydown="onKeyCell($event, 'draft', 'notes', row)"
                  >
                </td>
                <td class="p-1 text-center">
                  <UButton
                    size="xs"
                    color="error"
                    variant="ghost"
                    icon="i-lucide-eye-off"
                    :disabled="saving || cellSaving"
                    title="إخفاء"
                    @click="onHide(row)"
                  />
                </td>
              </tr>

              <tr
                data-new-row
                class="border-t border-dashed border-default bg-muted/30"
              >
                <td class="border-e border-default/60 p-0">
                  <input
                    v-model="newRow.name"
                    type="text"
                    :class="inputClass"
                    :disabled="saving || cellSaving"
                    placeholder="نوع جديد…"
                    @focus="focusKey = 'new:name'"
                    @blur="onNewBlur"
                    @keydown="onKeyCell($event, 'new', 'name')"
                  >
                </td>
                <td class="border-e border-default/60 p-0">
                  <input
                    v-model="newRow.notes"
                    type="text"
                    :class="inputClass"
                    :disabled="saving || cellSaving"
                    placeholder="ملاحظات (اختياري)"
                    @focus="focusKey = 'new:notes'"
                    @blur="onNewBlur"
                    @keydown="onKeyCell($event, 'new', 'notes')"
                  >
                </td>
                <td class="p-1 text-center text-xs text-muted">
                  جديد
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <p class="text-xs text-muted">
          يظهر الاسم الجديد لكل الموردين والشون بهذا النوع
        </p>
        <UButton
          color="neutral"
          variant="outline"
          @click="open = false"
        >
          إغلاق
        </UButton>
      </div>
    </template>
  </UModal>
</template>
