<script setup lang="ts">
const model = defineModel<string>({ default: '' })

const {
  typeOptions,
  loading,
  saving,
  loadTypes,
  createType,
  renameType,
  types
} = useAccountTypes()

const addOpen = ref(false)
const renameOpen = ref(false)
const addName = ref('')
const renameName = ref('')

onMounted(loadTypes)

const openAdd = () => {
  addName.value = ''
  addOpen.value = true
}

const openRename = () => {
  if (!model.value) {
    return
  }
  renameName.value = types.value.find(t => t.id === model.value)?.name || ''
  renameOpen.value = true
}

const saveAdd = async () => {
  const id = await createType(addName.value)
  if (id) {
    model.value = id
    addOpen.value = false
  }
}

const saveRename = async () => {
  if (!model.value) return
  const ok = await renameType(model.value, renameName.value)
  if (ok) renameOpen.value = false
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-2">
      <USelect
        v-model="model"
        :items="typeOptions"
        value-key="value"
        label-key="label"
        class="min-w-0 flex-1"
        :loading="loading"
        placeholder="اختر النوع"
      />
      <UButton
        size="sm"
        variant="soft"
        icon="i-lucide-plus"
        :disabled="saving"
        @click="openAdd"
      >
        إضافة
      </UButton>
      <UButton
        size="sm"
        variant="ghost"
        icon="i-lucide-pencil"
        :disabled="saving || !model"
        @click="openRename"
      >
        تعديل
      </UButton>
    </div>

    <UModal v-model:open="addOpen" title="إضافة نوع حساب">
      <template #body>
        <UFormField label="الاسم" required>
          <UInput v-model="addName" class="w-full" placeholder="مثال: استثمار" />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="addOpen = false">
            إلغاء
          </UButton>
          <UButton :loading="saving" @click="saveAdd">
            حفظ
          </UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="renameOpen" title="تعديل اسم النوع">
      <template #body>
        <UFormField label="الاسم" required>
          <UInput v-model="renameName" class="w-full" />
        </UFormField>
        <p class="mt-2 text-xs text-muted">
          يظهر الاسم الجديد لكل الموردين والشون بهذا النوع
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="outline" @click="renameOpen = false">
            إلغاء
          </UButton>
          <UButton :loading="saving" @click="saveRename">
            حفظ
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>
