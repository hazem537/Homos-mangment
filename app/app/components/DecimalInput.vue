<script setup lang="ts">
import { normalizeDecimalInput } from '~/utils/formatNumber'

const props = withDefaults(defineProps<{
  modelValue?: string
  /** Digits only (no decimal point), e.g. year */
  integer?: boolean
  placeholder?: string
  /** Leading label (optional) */
  prefix?: string
  /** Trailing label, e.g. جنيه on money inputs */
  suffix?: string
  disabled?: boolean
  /** Extra classes on the input root (e.g. fixed cell width) */
  class?: string
  title?: string
}>(), {
  modelValue: '',
  integer: false,
  placeholder: '',
  prefix: '',
  suffix: '',
  disabled: false,
  class: 'w-full',
  title: undefined
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const clean = (raw: string) => {
  const normalized = normalizeDecimalInput(raw)
  return props.integer ? normalized.replace(/\./g, '') : normalized
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return

  const nav = [
    'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Home', 'End'
  ]
  if (nav.includes(e.key)) return

  if (e.key === '.' || e.key === ',') {
    if (props.integer) e.preventDefault()
    return
  }

  // Western + Arabic-Indic digits only
  if (/^[0-9٠-٩۰-۹]$/.test(e.key)) return

  e.preventDefault()
}

const onUpdate = (value: unknown) => {
  emit('update:modelValue', clean(String(value ?? '')))
}
</script>

<template>
  <UInput
    :model-value="modelValue"
    type="text"
    :inputmode="integer ? 'numeric' : 'decimal'"
    :class="props.class || 'w-full'"
    :title="title"
    dir="ltr"
    :placeholder="placeholder"
    :disabled="disabled"
    autocomplete="off"
    :ui="{
      base: 'text-right',
      ...(prefix ? { leading: 'pointer-events-none' } : {}),
      ...(suffix ? { trailing: 'pointer-events-none' } : {})
    }"
    @keydown="onKeydown"
    @update:model-value="onUpdate"
  >
    <template v-if="prefix" #leading>
      <span class="text-muted text-sm whitespace-nowrap ps-1">
        {{ prefix }}
      </span>
    </template>
    <template v-if="suffix" #trailing>
      <span class="text-muted text-sm whitespace-nowrap pe-1">
        {{ suffix }}
      </span>
    </template>
  </UInput>
</template>
