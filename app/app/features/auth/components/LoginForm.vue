<script setup lang="ts">
const {
  username,
  password,
  loading,
  errorMessage,
  login
} = useAuthLogin()
</script>

<template>
  <UCard class="w-full max-w-md">
    <template #header>
      <div class="space-y-1 text-center">
        <h1 class="text-xl font-semibold">
          تسجيل الدخول
        </h1>
        <p class="text-sm text-muted">
          نظام إدارة حمص الخام
        </p>
      </div>
    </template>

    <form class="space-y-4" @submit.prevent="login">
      <UFormField label="اسم المستخدم" name="username" required>
        <UInput
          v-model="username"
          type="text"
          autocomplete="username"
          placeholder="admin"
          class="w-full"
          dir="ltr"
        />
      </UFormField>

      <UFormField label="كلمة المرور" name="password" required>
        <UInput
          v-model="password"
          type="password"
          autocomplete="current-password"
          class="w-full"
          dir="ltr"
        />
      </UFormField>

      <UAlert
        v-if="errorMessage"
        color="error"
        variant="subtle"
        :title="errorMessage"
      />

      <UButton
        type="submit"
        block
        :loading="loading"
      >
        دخول
      </UButton>
    </form>

    <template #footer>
      <p class="text-xs text-muted text-center">
        أنشئ المستخدم في Supabase Auth بالإيميل
        <span dir="ltr" class="font-mono">username@homos.local</span>
        ثم سجّل الدخول باسم المستخدم فقط.
      </p>
    </template>
  </UCard>
</template>
