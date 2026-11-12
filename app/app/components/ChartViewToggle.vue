<script setup lang="ts">
const isPieView = defineModel<boolean>({ required: true })
</script>

<template>
  <div class="flex items-center gap-2 rounded-lg border border-default bg-elevated/40 px-3 py-2">
    <UIcon
      name="i-lucide-chart-column"
      class="size-4"
      :class="!isPieView ? 'text-primary' : 'text-muted'"
    />
    <USwitch
      v-model="isPieView"
      size="md"
      color="primary"
    />
    <UIcon
      name="i-lucide-chart-pie"
      class="size-4"
      :class="isPieView ? 'text-primary' : 'text-muted'"
    />
    <span class="text-xs font-medium text-muted whitespace-nowrap">
      {{ isPieView ? 'دائرة' : 'أعمدة' }}
    </span>
  </div>
</template>
