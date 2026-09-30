import type { Game, Profile, StreamStatus } from './types.ts'

export class ApiError extends Error {
  code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const body = data as { error?: string; message?: string }
    throw new ApiError(body.error || 'failed', body.message || 'Something went wrong.')
  }
  return data as T
}

export function fetchLobby() {
  return request<{ hasProfiles: boolean }>('/api/auth/lobby')
}

export function register(body: { username: string; password: string; displayName: string }) {
  return request<{ profile: Profile }>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) })
}

export function login(body: { username: string; password: string }) {
  return request<{ profile: Profile }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) })
}

export function logout() {
  return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })
}

export async function fetchMe(): Promise<Profile | null> {
  const res = await fetch('/api/me', { credentials: 'include' })
  if (res.status === 401) return null
  if (!res.ok) return null
  const data = (await res.json()) as { profile: Profile }
  return data.profile
}

export function patchMe(body: { displayName?: string; tagline?: string; accent?: string }) {
  return request<{ profile: Profile }>('/api/me', { method: 'PATCH', body: JSON.stringify(body) })
}

export function addCouch(body: { name: string; accent: string }) {
  return request<{ profile: Profile }>('/api/me/couch', { method: 'POST', body: JSON.stringify(body) })
}

export function removeCouch(id: string) {
  return request<{ profile: Profile }>(`/api/me/couch/${id}`, { method: 'DELETE' })
}

export function toggleFavorite(gameId: string) {
  return request<{ profile: Profile }>('/api/me/favorite', { method: 'POST', body: JSON.stringify({ gameId }) })
}

export function fetchGames() {
  return request<{ games: Game[] }>('/api/games')
}

export function startGame(gameId: string) {
  return request<{ status: string; gameId: string }>('/api/start', {
    method: 'POST',
    body: JSON.stringify({ gameId }),
  })
}

export function stopGame() {
  return request<{ status: string }>('/api/stop', { method: 'POST' })
}

export function fetchStatus() {
  return request<StreamStatus>('/api/status')
}

export function pressButton(btn: string) {
  return fetch('/api/press-button', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ btn, slot: 0 }),
  }).catch(() => {})
}
