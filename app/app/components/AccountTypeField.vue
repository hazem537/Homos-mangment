<script setup lang="ts">
const model = defineModel<string>({ default: '' })

const {
  typeOptions,
  loading,
  loadTypes,
  ensureDefaultTypeId
} = useAccountTypes()

const typesOpen = ref(false)

onMounted(loadTypes)

const onTypesChanged = async () => {
  await loadTypes()
  if (model.value && !typeOptions.value.some(o => o.value === model.value)) {
    model.value = ensureDefaultTypeId()
  }
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-2">
      <USelectMenu
        v-model="model"
        :items="typeOptions"
        value-key="value"
        label-key="label"
        class="min-w-0 flex-1"
        :loading="loading"
        :search-input="{ placeholder: 'بحث…' }"
        placeholder="اختر النوع"
      />
      <UButton
        size="sm"
        variant="soft"
        icon="i-lucide-table-2"
        @click="typesOpen = true"
      >
        الأنواع
      </UButton>
    </div>

    <AccountTypesGridModal
      v-model:open="typesOpen"
      @changed="onTypesChanged"
    />
  </div>
</template>
