export function useAuthConfirm() {
  const user = useSupabaseUser()

  watchEffect(() => {
    navigateTo(user.value ? '/' : '/login')
  })
}
