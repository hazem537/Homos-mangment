<script setup lang="ts">
const route = useRoute()
const supplierId = computed(() => String(route.params.id || ''))
</script>

<template>
  <SupplierDetailPage :supplier-id="supplierId" />
</template>
