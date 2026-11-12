<script setup lang="ts">
const props = withDefaults(defineProps<{
  /** Content key — change this when the visible text changes. */
  contentKey?: string | number
  maxPx?: number
  minPx?: number
  title?: string
}>(), {
  maxPx: 30,
  minPx: 14
})

const { el } = useFitText({
  maxPx: props.maxPx,
  minPx: props.minPx,
  watchSource: () => props.contentKey
})
</script>

<template>
  <p
    ref="el"
    class="w-full overflow-hidden whitespace-nowrap"
    dir="ltr"
    :title="title"
  >
    <slot />
  </p>
</template>
