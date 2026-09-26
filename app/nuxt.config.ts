// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint', '@nuxt/ui', '@nuxtjs/supabase'],

  ssr: false,

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  imports: {
    dirs: [
      'composables',
      'utils',
      'features/**/composables',
      'features/**/utils'
    ]
  },

  components: [
    { path: '~/components' },
    { path: '~/features/auth/components', pathPrefix: false },
    { path: '~/features/dashboard/components', pathPrefix: false },
    { path: '~/features/suppliers/components', pathPrefix: false },
    { path: '~/features/supplier-stats/components', pathPrefix: false },
    { path: '~/features/purchases/components', pathPrefix: false },
    { path: '~/features/cash-transfers/components', pathPrefix: false },
    { path: '~/features/deliveries/components', pathPrefix: false },
    { path: '~/features/warehouses/components', pathPrefix: false },
    { path: '~/features/stores/components', pathPrefix: false },
    { path: '~/features/meklas/components', pathPrefix: false },
    { path: '~/features/clients/components', pathPrefix: false },
    { path: '~/features/products/components', pathPrefix: false },
    { path: '~/features/stock-statuses/components', pathPrefix: false },
    { path: '~/features/seasons/components', pathPrefix: false }
  ],

  app: {
    head: {
      htmlAttrs: {
        lang: 'ar',
        dir: 'rtl'
      },
      title: 'إدارة حمص الخام',
      meta: [
        { name: 'description', content: 'نظام إدارة شراء وتخزين حمص الخام' }
      ]
    }
  },

  supabase: {
    redirect: true,
    redirectOptions: {
      login: '/login',
      callback: '/confirm',
      include: undefined,
      exclude: ['/login', '/confirm'],
      saveRedirectToCookie: true
    },
    types: '~/types/database.types.ts'
  },

  runtimeConfig: {
    public: {
      supabase: {
        url: process.env.NUXT_PUBLIC_SUPABASE_URL,
        key: process.env.NUXT_PUBLIC_SUPABASE_KEY
      }
    }
  },

  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
