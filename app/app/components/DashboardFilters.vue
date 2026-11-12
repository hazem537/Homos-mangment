<script setup lang="ts">
export type SelectOption = {
  label: string
  value: string
}

withDefaults(defineProps<{
  accountTypeOptions: SelectOption[]
  supplierOptions: SelectOption[]
  productOptions: SelectOption[]
  disabled?: boolean
  refreshing?: boolean
  showReset?: boolean
}>(), {
  disabled: false,
  refreshing: false,
  showReset: false
})

const emit = defineEmits<{
  reset: []
}>()

const selectedAccountTypeId = defineModel<string>('accountTypeId', { required: true })
const selectedSupplierId = defineModel<string>('supplierId', { required: true })
const selectedProductId = defineModel<string>('productId', { required: true })

const fieldUi = {
  root: 'gap-1.5'
}

const searchInput = {
  placeholder: 'بحث…',
  autofocus: true
}
</script>

<template>
  <div
    class="rounded-xl border border-default bg-elevated p-3 sm:p-4"
    :class="disabled ? 'opacity-70' : ''"
  >
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2 min-w-0">
        <UIcon
          name="i-lucide-sliders-horizontal"
          class="size-4 shrink-0 text-primary"
        />
        <p class="text-sm font-medium text-highlighted">
          تصفية العرض
        </p>
        <UIcon
          v-if="refreshing"
          name="i-lucide-loader-circle"
          class="size-4 shrink-0 animate-spin text-primary"
          aria-label="جاري التحديث"
        />
        <span
          v-if="refreshing"
          class="text-xs text-muted"
        >
          جاري التحديث…
        </span>
      </div>

      <UButton
        v-if="showReset"
        color="neutral"
        variant="ghost"
        size="xs"
        icon="i-lucide-rotate-ccw"
        :disabled="disabled || refreshing"
        @click="emit('reset')"
      >
        إعادة الضبط
      </UButton>
    </div>

    <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <UFormField
        label="نوع الحساب"
        :ui="fieldUi"
      >
        <USelectMenu
          v-model="selectedAccountTypeId"
          :items="accountTypeOptions"
          value-key="value"
          label-key="label"
          icon="i-lucide-tags"
          :search-input="searchInput"
          :disabled="disabled"
          placeholder="اختر نوع الحساب"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="المورد"
        :ui="fieldUi"
      >
        <USelectMenu
          v-model="selectedSupplierId"
          :items="supplierOptions"
          value-key="value"
          label-key="label"
          icon="i-lucide-users"
          :search-input="searchInput"
          :disabled="disabled"
          placeholder="اختر المورد"
          class="w-full"
        />
      </UFormField>

      <UFormField
        label="الصنف"
        :ui="fieldUi"
        class="sm:col-span-2 lg:col-span-1"
      >
        <USelectMenu
          v-model="selectedProductId"
          :items="productOptions"
          value-key="value"
          label-key="label"
          icon="i-lucide-wheat"
          :search-input="searchInput"
          :disabled="disabled"
          placeholder="اختر الصنف"
          class="w-full"
        />
      </UFormField>
    </div>
  </div>
</template>
