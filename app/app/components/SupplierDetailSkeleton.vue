<script setup lang="ts">
</script>

<template>
  <div class="space-y-4" aria-busy="true" aria-label="جاري التحميل">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <USkeleton class="size-8 rounded-md" />
        <div class="space-y-2">
          <USkeleton class="h-6 w-40 rounded" />
          <USkeleton class="h-3 w-28 rounded" />
        </div>
      </div>
      <USkeleton class="h-8 w-20 rounded-md" />
    </div>

    <div class="overflow-x-auto py-2">
      <div class="flex flex-nowrap items-stretch gap-x-6">
        <div
          v-for="group in [2, 2, 5]"
          :key="group"
          class="flex flex-nowrap items-stretch gap-1.5 shrink-0"
        >
          <UCard
            v-for="i in group"
            :key="i"
            class="min-w-28"
            :ui="{ body: 'p-2 sm:p-2.5 space-y-1' }"
          >
            <USkeleton class="h-3 w-16 rounded" />
            <USkeleton class="h-5 w-20 rounded" />
          </UCard>
        </div>
      </div>
    </div>

    <USkeleton class="h-10 w-full rounded-lg" />
    <UCard :ui="{ body: 'p-0' }">
      <TableSkeleton :rows="6" :cols="5" />
    </UCard>
  </div>
</template>
