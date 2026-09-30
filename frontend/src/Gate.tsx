import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { fetchLobby, login, register } from './api.ts'
import { ApiError } from './api.ts'
import { useAuth } from './auth.tsx'

export function Gate() {
  const { setProfile } = useAuth()
  const [mode, setMode] = useState<'enter' | 'create'>('enter')
  const [lobbyReady, setLobbyReady] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    fetchLobby()
      .then((lobby) => {
        if (!lobby.hasProfiles) setMode('create')
      })
      .catch(() => {})
      .finally(() => setLobbyReady(true))
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setPending(true)
    try {
      const result =
        mode === 'create'
          ? await register({ username, password, displayName: displayName || username })
          : await login({ username, password })
      setProfile(result.profile)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The room did not open.')
    } finally {
      setPending(false)
    }
  }

  if (!lobbyReady) {
    return (
      <div className="boot">
        <p className="kicker">Wii Are Gamers</p>
        <p className="boot-line">Warming the room</p>
      </div>
    )
  }

  return (
    <div className="gate">
      <section className="gate-copy">
        <p className="kicker">Four remotes. One television.</p>
        <h1>
          The living room
          <em> is the console.</em>
        </h1>
        <p className="lede">
          Sign in, pick a disc, and hand the phones a code. New Super Mario Bros. Wii, Mario Kart Wii,
          and the rest of the shelf are waiting on the same screen.
        </p>
      </section>

      <section className="gate-panel">
        <div className="gate-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'enter'}
            className={mode === 'enter' ? 'on' : ''}
            onClick={() => {
              setMode('enter')
              setError('')
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'create'}
            className={mode === 'create' ? 'on' : ''}
            onClick={() => {
              setMode('create')
              setError('')
            }}
          >
            Create a profile
          </button>
        </div>

        <form onSubmit={submit}>
          <h2>{mode === 'create' ? 'Open a profile' : 'Welcome back'}</h2>
          {mode === 'create' && (
            <label className="field">
              <span>What should we call you</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="nickname"
                maxLength={24}
                placeholder="Alex"
              />
            </label>
          )}
          <label className="field">
            <span>Name</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
              minLength={3}
              maxLength={20}
              pattern="[A-Za-z0-9_]+"
              spellCheck={false}
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
              required
              minLength={8}
            />
          </label>
          {error && <p className="note bad">{error}</p>}
          <button className="btn primary wide" type="submit" disabled={pending}>
            {pending ? 'One moment' : mode === 'create' ? 'Create profile' : 'Enter the library'}
          </button>
          <p className="fine">
            {mode === 'create'
              ? 'The name is how you sign in. The couch can hold three more people after this.'
              : 'Profiles stay on this console. Phones join a party without their own account.'}
          </p>
        </form>
      </section>
    </div>
  )
}
