import { useEffect, useMemo, useState } from 'react'
import { ApiError, fetchGames, startGame } from './api.ts'
import { useAuth } from './auth.tsx'
import { ChannelArt } from './ChannelArt.tsx'
import { navigate } from './router.ts'
import type { Game, Shelf } from './types.ts'

const FILTERS: { id: 'all' | Shelf; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'platform', label: 'Platform' },
  { id: 'racing', label: 'Racing' },
  { id: 'motion', label: 'Motion' },
  { id: 'party', label: 'Party' },
  { id: 'adventure', label: 'Adventure' },
]

export function Library() {
  const { profile } = useAuth()
  const [games, setGames] = useState<Game[] | null>(null)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    fetchGames()
      .then((data) => setGames(data.games))
      .catch(() => setError('The shelf did not load.'))
  }, [])

  const ordered = useMemo(() => {
    if (!games || !profile) return []
    return [...games].sort((a, b) => {
      const fav = Number(profile.favorites.includes(b.id)) - Number(profile.favorites.includes(a.id))
      if (fav) return fav
      const ready = Number(b.installed) - Number(a.installed)
      if (ready) return ready
      return 0
    })
  }, [games, profile])

  const visible = ordered.filter((game) => filter === 'all' || game.shelf === filter)
  const hero =
    ordered.find((game) => game.id === profile?.stats.lastGameId && game.installed) ||
    ordered.find((game) => game.installed) ||
    ordered.find((game) => game.id === 'mario-kart-wii') ||
    ordered[0]

  if (!profile) return null

  return (
    <div className="library">
      {hero && (
        <article className="hero">
          <div className="hero-art">
            <ChannelArt game={hero} />
          </div>
          <div className="hero-copy">
            <p className="kicker">{hero.installed ? 'Ready on the television' : 'On the shelf'}</p>
            <h1>{hero.title}</h1>
            <p className="lede">{hero.blurb}</p>
            <div className="hero-actions">
              <button
                className="btn primary"
                disabled={pending}
                onClick={async () => {
                  if (!hero.installed) {
                    navigate(`/title/${hero.id}`)
                    return
                  }
                  setError('')
                  setPending(true)
                  try {
                    await startGame(hero.id)
                    navigate(`/play/${hero.id}`)
                  } catch (err) {
                    setError(err instanceof ApiError ? err.message : 'The console did not start.')
                  } finally {
                    setPending(false)
                  }
                }}
              >
                {pending ? 'Starting' : hero.installed ? 'Play' : 'Open the title'}
              </button>
              <span className="meta-line">
                {hero.year} · {hero.players} players · {hero.genre}
              </span>
            </div>
          </div>
        </article>
      )}

      <section className="couch-strip">
        <div>
          <p className="kicker">In the room</p>
          <h2>{profile.couch.length === 1 ? 'One profile on the couch' : `${profile.couch.length} profiles on the couch`}</h2>
        </div>
        <div className="chips">
          {profile.couch.map((player) => (
            <button key={player.id} className="chip" onClick={() => navigate('/profile')}>
              <span className="dot" style={{ background: player.accent }} />
              {player.name}
            </button>
          ))}
          {profile.couch.length < 4 && (
            <button className="chip add" onClick={() => navigate('/profile')}>
              Add a profile
            </button>
          )}
        </div>
      </section>

      <div className="filters" role="tablist">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={filter === item.id}
            className={filter === item.id ? 'on' : ''}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error && <p className="note bad">{error}</p>}

      <div className="shelf">
        {visible.map((game) => (
          <button key={game.id} className="poster" onClick={() => navigate(`/title/${game.id}`)}>
            <div className="poster-art">
              <ChannelArt game={game} />
              <span className={game.installed ? 'pill ready' : 'pill disc'}>
                {game.installed ? 'Disc in' : 'Add disc'}
              </span>
            </div>
            <div className="poster-meta">
              <h3>{game.title}</h3>
              <p>
                {game.genre} · {game.players}
                {profile.favorites.includes(game.id) ? ' · Kept' : ''}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
