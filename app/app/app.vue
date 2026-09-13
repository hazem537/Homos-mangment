<script setup lang="ts">
import { ar } from '@nuxt/ui/locale'

useHead({
  link: [
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap'
    }
  ],
  htmlAttrs: {
    lang: 'ar',
    dir: 'rtl'
  }
})
</script>

<template>
  <UApp dir="rtl" :locale="ar">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <ConfirmDialog />
  </UApp>
</template>
