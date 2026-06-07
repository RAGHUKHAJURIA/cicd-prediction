'use client'

import useSWR from 'swr'
import { useRouter } from 'next/navigation'
import { authApi } from '../auth-api'
import type { AuthUser, RegisterResult } from '../auth-api'

export function useAuth() {
  const router = useRouter()

  const { data: user, isLoading, mutate } = useSWR<AuthUser | null>(
    'auth-me',
    () => authApi.getMe(),
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 30000,
      onError: () => null,
    }
  )

  const login = async (email: string, password: string): Promise<void> => {
    await authApi.login({ email, password })
    await mutate()
    const params = new URLSearchParams(window.location.search)
    const from = params.get('from') || '/repos'
    router.push(from)
  }

  const logout = async (): Promise<void> => {
    await authApi.logout()
    mutate(null, { revalidate: false })
    router.push('/login')
  }

  const register = async (data: {
    email: string
    password: string
    username: string
  }): Promise<RegisterResult> => {
    const result = await authApi.register(data)
    return result
  }

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    login,
    logout,
    register,
    mutate,
  }
}
