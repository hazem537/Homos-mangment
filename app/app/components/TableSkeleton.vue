<script setup lang="ts">
withDefaults(defineProps<{
  rows?: number
  cols?: number
}>(), {
  rows: 7,
  cols: 6
})
</script>

<template>
  <div class="p-4 space-y-3" aria-busy="true" aria-label="جاري التحميل">
    <div class="flex gap-3 pb-2 border-b border-default">
      <USkeleton
        v-for="c in cols"
        :key="`h-${c}`"
        class="h-4 flex-1 rounded"
      />
    </div>
    <div
      v-for="r in rows"
      :key="`r-${r}`"
      class="flex gap-3 items-center"
    >
      <USkeleton
        v-for="c in cols"
        :key="`c-${r}-${c}`"
        class="h-8 flex-1 rounded"
      />
    </div>
  </div>
</template>
