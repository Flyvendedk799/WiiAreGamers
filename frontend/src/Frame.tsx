import type { ReactNode } from 'react'
import { useAuth } from './auth.tsx'
import { navigate, useRoute } from './router.ts'

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

export function Frame({ children }: { children: ReactNode }) {
  const { profile } = useAuth()
  const path = useRoute()
  if (!profile) return null

  return (
    <div className="room">
      <header className="topbar">
        <button className="wordmark" onClick={() => navigate('/')}>
          <span className="mark" aria-hidden="true" />
          Wii Are Gamers
        </button>
        <nav className="topnav">
          <button className={path === '/' ? 'on' : ''} onClick={() => navigate('/')}>
            Library
          </button>
          <button className={path === '/profile' ? 'on' : ''} onClick={() => navigate('/profile')}>
            Profiles
          </button>
        </nav>
        <button className="you" onClick={() => navigate('/profile')}>
          <span className="monogram" style={{ background: profile.accent }}>
            {initials(profile.displayName)}
          </span>
          <span className="you-name">{profile.displayName}</span>
        </button>
      </header>
      <div className="room-body">{children}</div>
    </div>
  )
}
