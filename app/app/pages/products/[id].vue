<script setup lang="ts">
const route = useRoute()
const productId = computed(() => String(route.params.id || ''))
</script>

<template>
  <ProductDetailPage :product-id="productId" />
</template>
