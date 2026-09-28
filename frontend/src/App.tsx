import { useState, useEffect, useRef } from 'react'
import io from 'socket.io-client';
// @ts-ignore
import JSMpeg from '@cycjimmy/jsmpeg-player'
import './App.css'

const socket = io(window.location.origin, { transports: ['websocket'] });

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [partyCode, setPartyCode] = useState<string | null>(null);
  const [players, setPlayers] = useState<number[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<any>(null);

  // Check if emulator is already running on mount
  useEffect(() => {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        if (data.running) setIsPlaying(true);
        if (data.partyCode) setPartyCode(data.partyCode);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    socket.on('party-created', (code) => setPartyCode(code));
    socket.on('player-joined', (slot) => {
      setPlayers(prev => prev.includes(slot) ? prev : [...prev, slot]);
    });

    return () => {
      socket.off('party-created');
      socket.off('player-joined');
    };
  }, []);

  const [isAudioEnabled, setIsAudioEnabled] = useState(false);

  useEffect(() => {
    if (isPlaying && canvasRef.current && !playerRef.current) {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const videoUrl = `${wsProtocol}//${window.location.host}/video-stream`;
      // Setup Audio Stream via JSMpeg (Video Disabled)
      // We render it into a hidden div so it doesn't steal the WebGL/2D context of our main canvas
      playerRef.current = new JSMpeg.VideoElement(
        '#jsmpeg-hidden',
        videoUrl,
        {
          autoplay: true,
          loop: false,
          control: false,
          video: false // Disable JSMpeg's slow Javascript video decoder!
        },
        {
          audio: true,
          audioBufferSize: 128 * 1024
        }
      );

      // Setup Zero-Latency Video Stream via MJPEG
      const mjpegUrl = `${wsProtocol}//${window.location.host}/mjpeg-stream`;
      const mjpegWs = new WebSocket(mjpegUrl);
      mjpegWs.binaryType = 'blob';
      
      let latestBitmap: ImageBitmap | null = null;
      let isDrawing = false;

      const drawLoop = () => {
        if (latestBitmap && canvasRef.current) {
          const ctx = canvasRef.current.getContext('2d', { alpha: false });
          if (ctx) ctx.drawImage(latestBitmap, 0, 0, 854, 480);
          latestBitmap.close(); // Free memory immediately
          latestBitmap = null;
        }
        isDrawing = false;
      };

      mjpegWs.onmessage = async (event) => {
        if (!canvasRef.current || !(event.data instanceof Blob)) return;
        
        try {
          // Off-main-thread hardware-accelerated decode
          const bitmap = await createImageBitmap(event.data);
          
          if (latestBitmap) {
            // Drop old undisplayed frame to stay perfectly real-time
            latestBitmap.close(); 
          }
          latestBitmap = bitmap;
          
          if (!isDrawing) {
            isDrawing = true;
            requestAnimationFrame(drawLoop);
          }
        } catch (e) {
          console.error("Frame decode error", e);
        }
      };

      // Store WS so we can close it
      (playerRef.current as any).mjpegWs = mjpegWs;
    }
    
    return () => {
      if (playerRef.current) {
        if ((playerRef.current as any).mjpegWs) {
          (playerRef.current as any).mjpegWs.close();
        }
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [isPlaying]);

  const unlockAudio = () => {
    try {
      if (playerRef.current) {
        if (playerRef.current.player?.audioOut) {
          playerRef.current.player.audioOut.unlock?.();
          if (playerRef.current.player.audioOut.context?.state === 'suspended') {
            playerRef.current.player.audioOut.context.resume();
          }
        }
        if (playerRef.current.onUnlockAudio && playerRef.current.els?.wrapper) {
          playerRef.current.onUnlockAudio(playerRef.current.els.wrapper, { preventDefault: () => {}, stopPropagation: () => {} });
        }
        if (playerRef.current.player) {
          playerRef.current.player.volume = 1;
        }
      }
      setIsAudioEnabled(true);
    } catch (e) {
      console.error('Audio unlock error:', e);
    }
  };

  const startGame = async () => {
    const res = await fetch('/api/start', { method: 'POST' });
    if (res.ok) {
      setIsPlaying(true);
    }
  };

  const stopGame = async () => {
    await fetch('/api/stop', { method: 'POST' });
    setIsPlaying(false);
  };

  const createParty = () => {
    socket.emit('create-party');
  };

  const pressButton = (btn: string) => {
    fetch('/api/press-button', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ btn, slot: 0 })
    }).catch(() => {});
  };

  const triggerSwing = () => {
    fetch('/api/swing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot: 0 })
    }).catch(() => {});
  };

  const toggleFullscreen = () => {
    const el = document.getElementById('video-wrapper');
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const joinUrl = partyCode ? `${window.location.origin}/controller?code=${partyCode}` : `${window.location.origin}/controller`;

  return (
    <div className="App">
      <header>
        <h1>Wii Are Gamers</h1>
        <div className="controls">
          {!isPlaying ? (
            <button onClick={startGame} className="btn-primary">▶ Start Stream</button>
          ) : (
            <button onClick={stopGame} className="btn-danger">⏹ Stop Stream</button>
          )}
        </div>
      </header>

      <main>
        {isPlaying ? (
          <div 
            id="video-wrapper" 
            className="video-container" 
            style={{ 
              position: 'relative', 
              width: '100%', 
              maxWidth: '960px', 
              margin: '0 auto', 
              background: '#000', 
              borderRadius: '12px', 
              overflow: 'hidden',
              boxShadow: '0 12px 40px rgba(0,0,0,0.7)'
            }}
          >
            <canvas 
              ref={canvasRef} 
              id="video-canvas"
              width={854}
              height={480}
              onClick={() => {
                pressButton('A');
                if (!isAudioEnabled) unlockAudio();
              }}
              title="Click to press A and enable sound"
              style={{ 
                width: '100%', 
                height: 'auto', 
                display: 'block', 
                aspectRatio: '16/9', 
                cursor: 'pointer',
                imageRendering: 'crisp-edges'
              }}
            ></canvas>
            <div id="jsmpeg-hidden" style={{ display: 'none' }}></div>

            {/* Unmute Game Audio Banner Overlay */}
            {!isAudioEnabled && (
              <div 
                onClick={unlockAudio}
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  background: 'rgba(0, 0, 0, 0.82)',
                  backdropFilter: 'blur(8px)',
                  padding: '16px 26px',
                  borderRadius: '14px',
                  border: '2px solid #10b981',
                  color: '#fff',
                  fontSize: '17px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  zIndex: 20,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                  userSelect: 'none'
                }}
              >
                <span style={{ fontSize: '24px' }}>🔊</span>
                <span>Click / Tap anywhere to Enable Game Sound</span>
              </div>
            )}

            {/* Quick Action Overlay Controls */}
            <div style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              display: 'flex',
              gap: '8px',
              zIndex: 10
            }}>
              <button 
                onClick={unlockAudio}
                style={{
                  background: isAudioEnabled ? '#10b981' : '#f59e0b',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
                }}
              >
                {isAudioEnabled ? '🔊 Sound Active' : '🔇 Enable Sound'}
              </button>

              <button 
                onClick={triggerSwing}
                style={{
                  background: 'linear-gradient(135deg, #ff6b35, #f72585)',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
                }}
              >
                🎾 Swing / Hit
              </button>

              <button 
                onClick={() => pressButton('A')}
                style={{
                  background: '#0088ff',
                  color: '#fff',
                  border: 'none',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
                }}
              >
                A Button
              </button>

              <button 
                onClick={() => fetch('/api/press-ab', { method: 'POST' }).catch(() => {})}
                style={{
                  background: '#ffaa00',
                  color: '#000',
                  border: 'none',
                  padding: '8px 14px',
                  borderRadius: '6px',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
                }}
              >
                Press A+B
              </button>
            </div>

            <button 
              onClick={toggleFullscreen}
              style={{
                position: 'absolute',
                bottom: 12,
                right: 12,
                background: 'rgba(0,0,0,0.7)',
                color: '#fff',
                border: '1px solid #666',
                padding: '8px 14px',
                borderRadius: '6px',
                fontWeight: 'bold',
                cursor: 'pointer',
                zIndex: 10
              }}
            >
              ⛶ Fullscreen
            </button>
          </div>
        ) : (
          <div className="library">
            <p>Select a game to begin streaming.</p>
            <div className="game-card" onClick={startGame}>
              <h3>🎾 Wii Sports</h3>
            </div>
          </div>
        )}

        <div className="controller-link" style={{ marginTop: '30px' }}>
          {!partyCode ? (
            <button 
              onClick={createParty} 
              style={{ 
                padding: '12px 28px', 
                fontSize: '1.2rem', 
                background: 'linear-gradient(135deg, #0088ff, #0055cc)', 
                color: 'white', 
                border: 'none', 
                borderRadius: '8px', 
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(0, 136, 255, 0.4)'
              }}
            >
              📱 Connect Phones as Wiimotes
            </button>
          ) : (
            <div style={{ 
              background: 'rgba(255, 255, 255, 0.05)', 
              border: '1px solid rgba(255, 255, 255, 0.1)', 
              padding: '24px', 
              borderRadius: '16px', 
              maxWidth: '480px', 
              margin: '0 auto',
              boxShadow: '0 8px 30px rgba(0,0,0,0.5)'
            }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem' }}>
                Party Code: <span style={{ color: '#00ff88', letterSpacing: '3px', fontWeight: 900 }}>{partyCode}</span>
              </h2>
              
              <div style={{ margin: '16px 0' }}>
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(joinUrl)}`} 
                  alt="Scan to join" 
                  style={{ borderRadius: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', background: '#fff', padding: '6px' }} 
                />
              </div>

              <p style={{ fontSize: '0.95rem', color: '#ccc' }}>
                Scan QR or open on phone: <br />
                <a href={joinUrl} target="_blank" rel="noreferrer" style={{ color: '#00aaff', wordBreak: 'break-all' }}>
                  {joinUrl}
                </a>
              </p>
              
              <div style={{ marginTop: '16px', fontSize: '1rem', color: '#aaa' }}>
                Active Controllers: <strong style={{ color: '#fff' }}>{players.length === 0 ? "Waiting for players..." : players.map(p => `Player ${p}`).join(', ')}</strong>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
