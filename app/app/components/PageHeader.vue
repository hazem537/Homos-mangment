<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  seasonName?: string | null
}>()
</script>

<template>
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="text-2xl font-semibold text-highlighted">
          {{ title }}
        </h2>
        <UBadge
          v-if="seasonName"
          variant="subtle"
          size="sm"
          color="warning"
        >
          {{ seasonName }}
        </UBadge>
      </div>
      <p
        v-if="description"
        class="mt-1 text-muted"
      >
        {{ description }}
      </p>
    </div>
    <div
      v-if="$slots.actions"
      class="flex flex-wrap items-end gap-3"
    >
      <slot name="actions" />
    </div>
  </div>
</template>
