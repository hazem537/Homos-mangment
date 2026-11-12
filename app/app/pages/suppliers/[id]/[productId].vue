<script setup lang="ts">
const route = useRoute()
const supplierId = computed(() => String(route.params.id || ''))
const productId = computed(() => String(route.params.productId || ''))
</script>

<template>
  <SupplierDetailPage
    :supplier-id="supplierId"
    :product-id="productId"
  />
</template>
