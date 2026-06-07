const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export interface AuthUser {
  id: string
  email: string
  username: string
  role: string
  avatarUrl: string | null
  emailVerified: boolean
  githubUsername: string | null
  lastLoginAt: string | null
  createdAt: string
}

export interface RegisterResult {
  email: string
  username: string
  registered: true
}

async function authFetch(path: string, options: RequestInit = {}):
Promise<Response> {
  return fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

export const authApi = {

  async getMe(): Promise<AuthUser | null> {
    const res = await authFetch('/auth/me')
    if (res.status === 401) return null
    if (!res.ok) return null
    const body = await res.json()
    return body.data?.user ?? null
  },

  async login(data: { email: string; password: string }):
  Promise<AuthUser> {
    const res = await authFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    if (res.status === 401) throw new Error('Invalid email or password')
    if (res.status === 429) throw new Error(
      'Too many attempts. Try again in 15 minutes.'
    )
    if (!res.ok) throw new Error('Login failed. Please try again.')
    const body = await res.json()
    return body.data.user
  },

  async logout(): Promise<void> {
    await authFetch('/auth/logout', { method: 'POST' })
  },

  async register(data: {
    email: string
    password: string
    username: string
  }): Promise<RegisterResult> {
    const res = await authFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    if (res.status === 409) throw new Error('Email already registered')
    if (res.status === 400) {
      const body = await res.json()
      throw new Error(body.error || 'Invalid registration data')
    }
    if (!res.ok) throw new Error('Registration failed. Please try again.')
    return { email: data.email, username: data.username, registered: true }
  },

  async changePassword(data: {
    currentPassword: string
    newPassword: string
  }): Promise<void> {
    const res = await authFetch('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    if (res.status === 401) throw new Error('Current password is incorrect')
    if (!res.ok) throw new Error('Failed to change password')
  },

  async updateProfile(data: {
    username?: string
    avatarUrl?: string
  }): Promise<AuthUser> {
    const res = await authFetch('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Failed to update profile')
    const body = await res.json()
    return body.data.user
  },
}
