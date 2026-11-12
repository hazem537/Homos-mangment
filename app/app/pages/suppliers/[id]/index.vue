<script setup lang="ts">
/** Legacy /suppliers/:id → redirect once profile product is known. */
const route = useRoute()
const router = useRouter()
const client = useSupabaseClient()

const supplierId = computed(() => String(route.params.id || ''))

onMounted(async () => {
  const id = supplierId.value
  if (!id) {
    await router.replace('/suppliers')
    return
  }
  const { data, error } = await client
    .from('suppliers')
    .select('product_id')
    .eq('id', id)
    .maybeSingle()
  if (error || !data?.product_id) {
    await router.replace('/suppliers')
    return
  }
  await router.replace(`/suppliers/${id}/${data.product_id}`)
})
</script>

<template>
  <div class="flex items-center justify-center py-16 text-muted text-sm">
    جاري فتح كشف المورد…
  </div>
</template>
