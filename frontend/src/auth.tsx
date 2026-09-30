import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { fetchMe } from './api.ts'
import type { Profile } from './types.ts'

type AuthValue = {
  profile: Profile | null
  ready: boolean
  setProfile: (profile: Profile | null) => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    fetchMe()
      .then(setProfile)
      .finally(() => setReady(true))
  }, [])

  return <AuthContext.Provider value={{ profile, ready, setProfile }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('Auth is missing')
  return value
}
