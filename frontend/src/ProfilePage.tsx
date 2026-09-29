import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { addCouch, logout, patchMe, removeCouch } from './api.ts'
import { ApiError } from './api.ts'
import { useAuth } from './auth.tsx'
import { navigate } from './router.ts'
import { ACCENTS } from './types.ts'
import type { Game } from './types.ts'
import { fetchGames } from './api.ts'

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
}

export function ProfilePage() {
  const { profile, setProfile } = useAuth()
  const [displayName, setDisplayName] = useState(profile?.displayName || '')
  const [tagline, setTagline] = useState(profile?.tagline || '')
  const [accent, setAccent] = useState(profile?.accent || ACCENTS[0])
  const [playerName, setPlayerName] = useState('')
  const [playerAccent, setPlayerAccent] = useState<string>(ACCENTS[1])
  const [games, setGames] = useState<Game[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.displayName)
    setTagline(profile.tagline)
    setAccent(profile.accent)
  }, [profile])

  useEffect(() => {
    fetchGames()
      .then((data) => setGames(data.games))
      .catch(() => {})
  }, [])

  if (!profile) return null

  const titleFor = (id: string | null) => games.find((game) => game.id === id)?.title || 'A game from the shelf'

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setMessage('')
    try {
      const result = await patchMe({ displayName, tagline, accent })
      setProfile(result.profile)
      setMessage('Profile saved.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The profile did not save.')
    }
  }

  const addPlayer = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    try {
      const result = await addCouch({ name: playerName, accent: playerAccent })
      setProfile(result.profile)
      setPlayerName('')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That player did not join the couch.')
    }
  }

  const signOut = async () => {
    await logout()
    setProfile(null)
    navigate('/')
  }

  return (
    <div className="profile-page">
      <header className="profile-head">
        <span className="monogram xl" style={{ background: profile.accent }}>
          {initials(profile.displayName)}
        </span>
        <div>
          <p className="kicker">@{profile.username}</p>
          <h1>{profile.displayName}</h1>
          <p className="lede">{profile.tagline || 'A profile for this television.'}</p>
        </div>
      </header>

      <section className="stats">
        <article>
          <p className="kicker">Evenings</p>
          <strong>{profile.stats.plays}</strong>
          <span>times the console started</span>
        </article>
        <article>
          <p className="kicker">On the television</p>
          <strong>{profile.stats.minutes}</strong>
          <span>{profile.stats.minutes === 1 ? 'minute' : 'minutes'}</span>
        </article>
        <article>
          <p className="kicker">Last disc</p>
          <strong className="stat-title">{profile.stats.lastGameId ? titleFor(profile.stats.lastGameId) : 'None yet'}</strong>
          <span>from this profile</span>
        </article>
      </section>

      <div className="profile-grid">
        <form className="panel" onSubmit={save}>
          <h2>This profile</h2>
          <label className="field">
            <span>Display name</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={24} required />
          </label>
          <label className="field">
            <span>Line under the name</span>
            <input
              value={tagline}
              onChange={(event) => setTagline(event.target.value)}
              maxLength={80}
              placeholder="Usually holds the wheel"
            />
          </label>
          <div className="field">
            <span>Color</span>
            <div className="swatches">
              {ACCENTS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={accent === color ? 'swatch on' : 'swatch'}
                  style={{ background: color }}
                  aria-label={color}
                  onClick={() => setAccent(color)}
                />
              ))}
            </div>
          </div>
          {message && <p className="note good">{message}</p>}
          {error && <p className="note bad">{error}</p>}
          <div className="hero-actions">
            <button className="btn primary" type="submit">
              Save profile
            </button>
            <button className="btn quiet" type="button" onClick={signOut}>
              Sign out
            </button>
          </div>
        </form>

        <section className="panel">
          <h2>The couch</h2>
          <p className="fine">
            Up to four people. They show on the library and take a phone when the party code is up. They do not need
            their own password.
          </p>
          <ul className="couch-list">
            {profile.couch.map((player) => (
              <li key={player.id}>
                <span className="dot" style={{ background: player.accent }} />
                <span>{player.name}</span>
                <button
                  className="text-link"
                  onClick={async () => {
                    const result = await removeCouch(player.id)
                    setProfile(result.profile)
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          {profile.couch.length < 4 && (
            <form className="add-player" onSubmit={addPlayer}>
              <input
                value={playerName}
                onChange={(event) => setPlayerName(event.target.value)}
                placeholder="Name"
                maxLength={24}
                aria-label="Player name"
                required
              />
              <button className="btn quiet" type="submit">
                Add
              </button>
              <div className="swatches compact">
                {ACCENTS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={playerAccent === color ? 'swatch on' : 'swatch'}
                    style={{ background: color }}
                    aria-label={color}
                    onClick={() => setPlayerAccent(color)}
                  />
                ))}
              </div>
            </form>
          )}
        </section>
      </div>

      <section className="panel recent-panel">
        <h2>Recently on</h2>
        {profile.recent.length === 0 ? (
          <p className="fine">Nothing played from this profile yet.</p>
        ) : (
          <ul className="recent">
            {profile.recent.map((session) => (
              <li key={`${session.gameId}-${session.startedAt}`}>
                <button className="text-link" onClick={() => navigate(`/title/${session.gameId}`)}>
                  {titleFor(session.gameId)}
                </button>
                <time dateTime={new Date(session.startedAt).toISOString()}>
                  {new Intl.DateTimeFormat(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  }).format(session.startedAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
        {profile.favorites.length > 0 && (
          <div className="kept">
            <p className="kicker">Kept</p>
            <div className="chips">
              {profile.favorites.map((id) => (
                <button key={id} className="chip" onClick={() => navigate(`/title/${id}`)}>
                  {titleFor(id)}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
