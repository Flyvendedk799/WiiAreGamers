import { useEffect, useRef, useState } from 'react'
import io from 'socket.io-client'
import JSMpeg from '@cycjimmy/jsmpeg-player'
import { fetchGames, fetchStatus, pressButton, stopGame } from './api.ts'
import { navigate } from './router.ts'
import type { Controls, Game } from './types.ts'

export function Theater({ id }: { id: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const playerRef = useRef<any>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [isAudioEnabled, setIsAudioEnabled] = useState(false)
  const [partyCode, setPartyCode] = useState<string | null>(null)
  const [players, setPlayers] = useState<number[]>([])

  useEffect(() => {
    fetchGames()
      .then((data) => setGame(data.games.find((entry) => entry.id === id) || null))
      .catch(() => {})
    fetchStatus()
      .then((status) => {
        setIsPlaying(status.running)
        setRunningId(status.gameId)
        if (status.partyCode) setPartyCode(status.partyCode)
      })
      .catch(() => {})
  }, [id])

  useEffect(() => {
    const socket = io(window.location.origin, { transports: ['websocket'] })
    socket.on('party-created', (code: string) => setPartyCode(code))
    socket.on('game-stopped', () => {
      setIsPlaying(false)
      setPartyCode(null)
      setRunningId(null)
    })
    socket.on('player-joined', (slot: number) => {
      setPlayers((prev) => (prev.includes(slot) ? prev : [...prev, slot]))
    })
    return () => {
      socket.close()
    }
  }, [])

  useEffect(() => {
    if (!isPlaying || runningId !== id || !canvasRef.current || playerRef.current) return

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const videoUrl = `${wsProtocol}//${window.location.host}/video-stream`
    playerRef.current = new JSMpeg.VideoElement(
      '#jsmpeg-hidden',
      videoUrl,
      { autoplay: true, loop: false, control: false, video: false },
      { audio: true, audioBufferSize: 128 * 1024 }
    )

    const mjpegUrl = `${wsProtocol}//${window.location.host}/mjpeg-stream`
    const mjpegWs = new WebSocket(mjpegUrl)
    mjpegWs.binaryType = 'blob'

    let latestBitmap: ImageBitmap | null = null
    let isDrawing = false
    let isDecoding = false

    const drawLoop = () => {
      if (latestBitmap && canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d', { alpha: false })
        if (ctx) ctx.drawImage(latestBitmap, 0, 0, 854, 480)
        latestBitmap.close()
        latestBitmap = null
      }
      isDrawing = false
    }

    mjpegWs.onmessage = async (event) => {
      if (!canvasRef.current || !(event.data instanceof Blob)) return
      if (isDecoding) return
      try {
        isDecoding = true
        const bitmap = await createImageBitmap(event.data)
        isDecoding = false
        if (latestBitmap) latestBitmap.close()
        latestBitmap = bitmap
        if (!isDrawing) {
          isDrawing = true
          requestAnimationFrame(drawLoop)
        }
      } catch (err) {
        isDecoding = false
        console.error('Frame decode error', err)
      }
    }

    playerRef.current.mjpegWs = mjpegWs

    return () => {
      if (playerRef.current) {
        playerRef.current.mjpegWs?.close()
        playerRef.current.destroy()
        playerRef.current = null
      }
    }
  }, [isPlaying, runningId, id])

  const unlockAudio = () => {
    try {
      const player = playerRef.current
      if (player?.player?.audioOut) {
        player.player.audioOut.unlock?.()
        if (player.player.audioOut.context?.state === 'suspended') {
          player.player.audioOut.context.resume()
        }
      }
      if (player?.onUnlockAudio && player.els?.wrapper) {
        player.onUnlockAudio(player.els.wrapper, { preventDefault: () => {}, stopPropagation: () => {} })
      }
      if (player?.player) player.player.volume = 1
      setIsAudioEnabled(true)
    } catch (err) {
      console.error('Audio unlock error:', err)
    }
  }

  const createParty = () => {
    const socket = io(window.location.origin, { transports: ['websocket'] })
    socket.on('party-created', (code: string) => {
      setPartyCode(code)
      socket.close()
    })
    socket.emit('create-party')
  }

  const end = async () => {
    await stopGame()
    setIsPlaying(false)
    setRunningId(null)
    navigate(`/title/${id}`)
  }

  const toggleFullscreen = () => {
    const el = document.getElementById('video-wrapper')
    if (!el) return
    if (!document.fullscreenElement) el.requestFullscreen().catch(() => {})
    else document.exitFullscreen().catch(() => {})
  }

  const controls: Controls = game?.controls || 'motion'
  const live = isPlaying && runningId === id
  const joinUrl = partyCode
    ? `${window.location.origin}/controller?code=${partyCode}`
    : `${window.location.origin}/controller`

  return (
    <div className="theater">
      <div className="theater-head">
        <div>
          <button className="text-link" onClick={() => navigate(game ? `/title/${game.id}` : '/')}>
            {game ? game.title : 'Back'}
          </button>
          <p className="fine">{game?.playNote}</p>
        </div>
        {live && (
          <button className="btn danger" onClick={end}>
            Stop
          </button>
        )}
      </div>

      {live ? (
        <div id="video-wrapper" className="stage">
          <canvas
            ref={canvasRef}
            width={854}
            height={480}
            onClick={() => {
              pressButton('A')
              if (!isAudioEnabled) unlockAudio()
            }}
          />
          <div id="jsmpeg-hidden" className="jsmpeg-hidden" />
          {!isAudioEnabled && (
            <button className="unmute" onClick={unlockAudio}>
              Tap for game sound
            </button>
          )}
          <div className="stage-bar">
            <button onClick={unlockAudio}>{isAudioEnabled ? 'Sound on' : 'Sound'}</button>
            {(controls === 'motion' || controls === 'party') && (
              <button onClick={() => fetch('/api/swing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slot: 0 }) })}>
                Swing
              </button>
            )}
            {controls === 'motion' && (
              <button onClick={() => fetch('/api/toss', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slot: 0 }) })}>
                Toss
              </button>
            )}
            <button onClick={() => pressButton('A')}>A</button>
            <button onClick={() => pressButton('B')}>B</button>
            {controls === 'racing' && <button onClick={() => pressButton('+')}>+</button>}
            <button onClick={() => fetch('/api/press-ab', { method: 'POST' })}>A+B</button>
            <button onClick={toggleFullscreen}>Fullscreen</button>
          </div>
        </div>
      ) : (
        <div className="stage idle">
          <p>
            {isPlaying && runningId
              ? 'Another disc is already running.'
              : 'The television is dark. Start this disc from its title.'}
          </p>
          <button
            className="btn primary"
            onClick={() => navigate(isPlaying && runningId ? `/play/${runningId}` : `/title/${id}`)}
          >
            {isPlaying && runningId ? 'Open what is playing' : 'Back to the title'}
          </button>
        </div>
      )}

      <aside className="party">
        {!partyCode ? (
          <>
            <h2>Phones as remotes</h2>
            <p className="fine">Up to four. Each phone takes the next slot when it joins.</p>
            <button className="btn primary" onClick={createParty}>
              Make a party code
            </button>
          </>
        ) : (
          <>
            <p className="kicker">Party code</p>
            <p className="code">{partyCode}</p>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=168x168&margin=12&data=${encodeURIComponent(joinUrl)}`}
              alt="Scan to join with a phone"
            />
            <p className="fine">
              <a href={joinUrl}>{joinUrl}</a>
            </p>
            <p className="fine">
              {players.length === 0 ? 'Waiting for the first phone.' : players.map((slot) => `Player ${slot}`).join(', ')}
            </p>
          </>
        )}
      </aside>
    </div>
  )
}
