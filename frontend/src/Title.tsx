import { useEffect, useState } from 'react'
import { ApiError, fetchGames, fetchStatus, startGame, toggleFavorite } from './api.ts'
import { useAuth } from './auth.tsx'
import { ChannelArt } from './ChannelArt.tsx'
import { navigate } from './router.ts'
import type { Game, StreamStatus } from './types.ts'

export function Title({ id }: { id: string }) {
  const { profile, setProfile } = useAuth()
  const [game, setGame] = useState<Game | null>(null)
  const [missing, setMissing] = useState(false)
  const [status, setStatus] = useState<StreamStatus | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    fetchGames()
      .then((data) => {
        const found = data.games.find((entry) => entry.id === id) || null
        setGame(found)
        setMissing(!found)
      })
      .catch(() => setError('The title did not load.'))
    fetchStatus()
      .then(setStatus)
      .catch(() => {})
  }, [id])

  if (!profile) return null
  if (missing) {
    return (
      <div className="title-page">
        <p className="note">That title is not on the shelf.</p>
        <button className="btn quiet" onClick={() => navigate('/')}>
          Back to the library
        </button>
      </div>
    )
  }
  if (!game) return <p className="boot-line">Finding the disc…</p>

  const kept = profile.favorites.includes(game.id)
  const otherRunning = Boolean(status?.running && status.gameId && status.gameId !== game.id)

  const play = async () => {
    setError('')
    setPending(true)
    try {
      await startGame(game.id)
      navigate(`/play/${game.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The console did not start.')
    } finally {
      setPending(false)
    }
  }

  const favorite = async () => {
    const result = await toggleFavorite(game.id)
    setProfile(result.profile)
  }

  return (
    <article className="title-page">
      <div className="title-art">
        <ChannelArt game={game} />
      </div>
      <div className="title-copy">
        <button className="text-link" onClick={() => navigate('/')}>
          Library
        </button>
        <p className="kicker">
          {game.year} · {game.genre}
        </p>
        <h1>{game.title}</h1>
        <p className="lede">{game.blurb}</p>
        <dl className="facts">
          <div>
            <dt>Players</dt>
            <dd>{game.players}</dd>
          </div>
          <div>
            <dt>How it plays</dt>
            <dd>{game.playNote}</dd>
          </div>
          <div>
            <dt>Disc</dt>
            <dd>{game.installed ? 'In the library' : `Looking for ${game.fileHint}`}</dd>
          </div>
        </dl>

        {otherRunning && (
          <p className="note">
            Something else is already on the television.{' '}
            <button className="text-link" onClick={() => navigate(`/play/${status?.gameId}`)}>
              Go to it
            </button>
          </p>
        )}
        {error && <p className="note bad">{error}</p>}
        {!game.installed && !error && (
          <p className="note">
            Put your own copy in the <code>roms</code> folder as <code>{game.fileHint}</code>, or use the full title
            as the file name. The shelf notices it on the next visit.
          </p>
        )}

        <div className="hero-actions">
          <button className="btn primary" onClick={play} disabled={pending}>
            {pending ? 'Starting' : game.installed ? 'Play' : 'Try to play'}
          </button>
          <button className="btn quiet" onClick={favorite}>
            {kept ? 'Kept on your profile' : 'Keep on your profile'}
          </button>
        </div>
      </div>
    </article>
  )
}
