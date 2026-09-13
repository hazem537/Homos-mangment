<script setup lang="ts">
const { state, settle } = useConfirmDialog()

const onOpenChange = (open: boolean) => {
  if (!open) settle(false)
}
</script>

<template>
  <UModal
    :open="state.open"
    :title="state.title"
    :description="state.description"
    :ui="{ footer: 'justify-end gap-2' }"
    @update:open="onOpenChange"
  >
    <template #footer>
      <UButton
        color="neutral"
        variant="outline"
        @click="settle(false)"
      >
        {{ state.cancelLabel }}
      </UButton>
      <UButton
        :color="state.confirmColor"
        @click="settle(true)"
      >
        {{ state.confirmLabel }}
      </UButton>
    </template>
  </UModal>
</template>
