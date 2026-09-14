<script setup lang="ts">
const route = useRoute()
const warehouseId = computed(() => String(route.params.id || ''))
</script>

<template>
  <WarehouseDetailPage :warehouse-id="warehouseId" />
</template>
