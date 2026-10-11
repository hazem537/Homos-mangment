<script setup lang="ts">
const route = useRoute()
const meklaId = computed(() => String(route.params.id || ''))
</script>

<template>
  <MeklaDetailPage :mekla-id="meklaId" />
</template>
