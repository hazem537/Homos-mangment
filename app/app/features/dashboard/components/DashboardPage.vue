<script setup lang="ts">
const {
  initialLoading,
  isRefreshing,
  filtersReadyUi,
  hasActiveFilters,
  resetFilters,
  season,
  productOptions,
  accountTypeOptions,
  supplierOptions,
  selectedProductId,
  selectedAccountTypeId,
  selectedSupplierId,
  purchasedKg,
  deliveredKg,
  remainingKg,
  placeBars
} = useDashboardStats()

const hoveredPieKey = ref<string | null>(null)

const summaryCards = computed(() => [
  {
    value: purchasedKg.value,
    label: 'مشتريات'
  },
  {
    value: deliveredKg.value,
    label: 'تسليمات'
  },
  {
    value: remainingKg.value,
    label: 'لم يُسلَّم بعد'
  }
])

const showFilters = computed(() =>
  Boolean(season.value) || filtersReadyUi.value || initialLoading.value
)
</script>

<template>
  <div class="space-y-6">
    <PageHeader
      title="لوحة التحكم"
      description="أين الكمية؟ من المشتريات إلى أماكن التخزين"
      :season-name="season?.name"
    />

    <DashboardFilters
      v-if="showFilters"
      v-model:account-type-id="selectedAccountTypeId"
      v-model:supplier-id="selectedSupplierId"
      v-model:product-id="selectedProductId"
      :account-type-options="accountTypeOptions"
      :supplier-options="supplierOptions"
      :product-options="productOptions"
      :disabled="!filtersReadyUi || initialLoading"
      :refreshing="isRefreshing"
      :show-reset="hasActiveFilters"
      @reset="resetFilters"
    />

    <CardsSkeleton
      v-if="initialLoading"
      :count="3"
    />

    <UCard
      v-else-if="!season"
      :ui="{ body: 'p-8 text-center text-muted' }"
    >
      لا يوجد موسم نشط — فعّل موسماً من شاشة المواسم أولاً.
    </UCard>

    <div
      v-else
      class="relative space-y-6 transition-opacity duration-200"
      :class="isRefreshing ? 'opacity-50 pointer-events-none' : 'opacity-100'"
      :aria-busy="isRefreshing"
    >
      <div
        v-if="isRefreshing"
        class="pointer-events-none absolute inset-0 z-10 flex items-start justify-center pt-10"
      >
        <div class="flex items-center gap-2 rounded-full border border-default bg-default/90 px-3 py-1.5 text-sm text-muted shadow-sm backdrop-blur-sm">
          <UIcon
            name="i-lucide-loader-circle"
            class="size-4 animate-spin text-primary"
          />
          تحديث البيانات…
        </div>
      </div>

      <MetricSummaryCards :cards="summaryCards" />

      <UCard>
        <div class="mb-5">
          <h3 class="text-lg font-semibold text-highlighted">
            توزيع الكمية
          </h3>
          <p class="mt-0.5 text-sm text-muted">
            دائرة أماكن الكمية (مورد / شون / مخازن / مقالي / مبيعات)
          </p>
        </div>

        <QuantityPieChart
          v-model:hovered-key="hoveredPieKey"
          :bars="placeBars"
        />
      </UCard>
    </div>
  </div>
</template>
