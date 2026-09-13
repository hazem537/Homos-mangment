export function useAuthLogin() {
  const supabase = useSupabaseClient()
  const user = useSupabaseUser()

  const username = ref('')
  const password = ref('')
  const loading = ref(false)
  const errorMessage = ref('')

  watchEffect(() => {
    if (user.value) {
      navigateTo('/')
    }
  })

  const login = async () => {
    errorMessage.value = ''
    loading.value = true
    try {
      const name = normalizeUsername(username.value)
      if (!/^[a-z0-9._-]{3,32}$/.test(name)) {
        errorMessage.value = 'اسم المستخدم غير صالح (3–32 حرف: a-z, 0-9, . _ -).'
        return
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: usernameToAuthEmail(name),
        password: password.value
      })
      if (error) {
        errorMessage.value = 'بيانات الدخول غير صحيحة. تحقق من اسم المستخدم وكلمة المرور.'
        return
      }
      await navigateTo('/')
    } finally {
      loading.value = false
    }
  }

  return {
    username,
    password,
    loading,
    errorMessage,
    login
  }
}
