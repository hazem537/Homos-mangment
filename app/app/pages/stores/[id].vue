<script setup lang="ts">
const route = useRoute()
const storeId = computed(() => String(route.params.id || ''))
</script>

<template>
  <StoreDetailPage :store-id="storeId" />
</template>
