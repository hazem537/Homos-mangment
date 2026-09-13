<script setup lang="ts">
import { useActiveSeason } from '~/composables/useActiveSeason'

const route = useRoute()
const supabase = useSupabaseClient()
const user = useSupabaseUser()
const { season } = useActiveSeason()

const sidebarOpen = useCookie<boolean>('homos-sidebar-open', {
  default: () => true,
  maxAge: 60 * 60 * 24 * 365
})

const links = [
  {
    label: 'لوحة التحكم',
    icon: 'i-lucide-layout-dashboard',
    to: '/'
  },
  {
    label: 'الموردون',
    icon: 'i-lucide-users',
    to: '/suppliers'
  },
  {
    label: 'المشتريات',
    icon: 'i-lucide-shopping-cart',
    to: '/purchases'
  },
  {
    label: 'التحويلات',
    icon: 'i-lucide-banknote',
    to: '/cash-transfers'
  },
  {
    label: 'التسليمات',
    icon: 'i-lucide-truck',
    to: '/deliveries'
  },
  {
    label: 'الشون',
    icon: 'i-lucide-warehouse',
    to: '/warehouses'
  },
  {
    label: 'المواسم',
    icon: 'i-lucide-calendar',
    to: '/settings/seasons'
  }
]

const isActive = (to: string) =>
  route.path === to || (to !== '/' && route.path.startsWith(`${to}/`))

const toggleSidebar = () => {
  sidebarOpen.value = !sidebarOpen.value
}

const logout = async () => {
  await supabase.auth.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen bg-default flex">
    <aside
      class="shrink-0 border-e border-default bg-elevated/50 flex flex-col gap-4 transition-all duration-200 overflow-hidden"
      :class="sidebarOpen ? 'w-64 p-4' : 'w-16 p-2'"
    >
      <div :class="sidebarOpen ? '' : 'flex justify-center pt-1'">
        <template v-if="sidebarOpen">
          <p class="text-xs text-muted mb-1">
            نظام إدارة
          </p>
          <h1 class="text-lg font-semibold text-highlighted">
            حمص الخام
          </h1>
        </template>
        <UButton
          v-else
          icon="i-lucide-wheat"
          variant="ghost"
          color="neutral"
          square
          :to="'/'"
        />
      </div>

      <nav class="flex flex-col gap-1 flex-1">
        <UTooltip
          v-for="link in links"
          :key="link.to"
          :text="link.label"
          :disabled="sidebarOpen"
          :content="{ side: 'left' }"
        >
          <UButton
            :to="link.to"
            :icon="link.icon"
            :variant="isActive(link.to) ? 'soft' : 'ghost'"
            :color="isActive(link.to) ? 'primary' : 'neutral'"
            :block="sidebarOpen"
            :square="!sidebarOpen"
            :class="sidebarOpen ? 'justify-start' : 'mx-auto'"
          >
            <span v-if="sidebarOpen">{{ link.label }}</span>
          </UButton>
        </UTooltip>
      </nav>

      <div class="border-t border-default pt-3 space-y-2" :class="sidebarOpen ? '' : 'flex flex-col items-center'">
        <p v-if="sidebarOpen" class="text-xs text-muted truncate">
          {{ user?.email }}
        </p>
        <UTooltip text="تسجيل الخروج" :disabled="sidebarOpen" :content="{ side: 'left' }">
          <UButton
            icon="i-lucide-log-out"
            color="neutral"
            variant="outline"
            :block="sidebarOpen"
            :square="!sidebarOpen"
            @click="logout"
          >
            <span v-if="sidebarOpen">تسجيل الخروج</span>
          </UButton>
        </UTooltip>
      </div>
    </aside>

    <div class="flex-1 flex flex-col min-w-0">
      <header class="h-14 border-b border-default px-4 sm:px-6 flex items-center justify-between gap-3 bg-default/80 backdrop-blur">
        <div class="flex items-center gap-3 min-w-0">
          <UButton
            :icon="sidebarOpen ? 'i-lucide-panel-right-close' : 'i-lucide-panel-right-open'"
            color="neutral"
            variant="ghost"
            square
            @click="toggleSidebar"
          />
          <p class="font-medium text-highlighted truncate hidden sm:block">
            إدارة حمص الخام
          </p>
        </div>

        <div class="flex items-center gap-2 sm:gap-3">
          <UButton
            to="/settings/seasons"
            color="neutral"
            variant="soft"
            size="sm"
            icon="i-lucide-calendar"
            class="max-w-[220px]"
          >
            <span class="truncate">
              <template v-if="season">
                {{ season.name }}
              </template>
              <template v-else>
                لا يوجد موسم نشط
              </template>
            </span>
          </UButton>
          <UColorModeButton />
        </div>
      </header>

      <main class="flex-1 p-6 overflow-auto">
        <slot />
      </main>
    </div>
  </div>
</template>
