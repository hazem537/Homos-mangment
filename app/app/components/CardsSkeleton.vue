<script setup lang="ts">
withDefaults(defineProps<{
  count?: number
}>(), {
  count: 6
})
</script>

<template>
  <div
    class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
    aria-busy="true"
    aria-label="جاري التحميل"
  >
    <UCard
      v-for="i in count"
      :key="i"
    >
      <USkeleton class="h-4 w-24 rounded" />
      <USkeleton class="h-8 w-36 mt-3 rounded" />
      <USkeleton class="h-3 w-28 mt-2 rounded" />
    </UCard>
  </div>
</template>
