<script setup lang="ts">
const {
  loading,
  season,
  suppliersCount,
  warehousesCount,
  purchasesCount,
  transfersCount,
  deliveriesCount
} = useDashboardStats()
</script>

<template>
  <div class="space-y-6">
    <div>
      <h2 class="text-2xl font-semibold text-highlighted">
        لوحة التحكم
      </h2>
      <p class="text-muted mt-1">
        ملخص سريع للموسم والمشتريات والتسليمات
      </p>
    </div>

    <CardsSkeleton v-if="loading" :count="6" />

    <div v-else class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <UCard>
        <p class="text-sm text-muted">
          الموسم النشط
        </p>
        <p class="text-xl font-semibold mt-2">
          {{ season?.name || 'لا يوجد' }}
        </p>
        <p v-if="season" class="text-sm text-muted mt-1">
          معامل الأردب: {{ season.ardab_factor }} كجم
        </p>
      </UCard>

      <UCard>
        <p class="text-sm text-muted">
          مشتريات الموسم
        </p>
        <p class="text-xl font-semibold mt-2">
          {{ purchasesCount }}
        </p>
        <UButton to="/suppliers" variant="link" class="px-0 mt-1">
          من كشف المورد
        </UButton>
      </UCard>

      <UCard>
        <p class="text-sm text-muted">
          تحويلات الموسم
        </p>
        <p class="text-xl font-semibold mt-2">
          {{ transfersCount }}
        </p>
        <UButton to="/suppliers" variant="link" class="px-0 mt-1">
          من كشف المورد
        </UButton>
      </UCard>

      <UCard>
        <p class="text-sm text-muted">
          تسليمات الموسم
        </p>
        <p class="text-xl font-semibold mt-2">
          {{ deliveriesCount }}
        </p>
        <UButton to="/suppliers" variant="link" class="px-0 mt-1">
          من كشف المورد
        </UButton>
      </UCard>

      <UCard>
        <p class="text-sm text-muted">
          الموردون النشطون
        </p>
        <p class="text-xl font-semibold mt-2">
          {{ suppliersCount }}
        </p>
        <UButton to="/suppliers" variant="link" class="px-0 mt-1">
          إدارة الموردين
        </UButton>
      </UCard>

      <UCard>
        <p class="text-sm text-muted">
          الشون النشطة
        </p>
        <p class="text-xl font-semibold mt-2">
          {{ warehousesCount }}
        </p>
        <UButton to="/warehouses" variant="link" class="px-0 mt-1">
          إدارة الشون
        </UButton>
      </UCard>
    </div>
  </div>
</template>
