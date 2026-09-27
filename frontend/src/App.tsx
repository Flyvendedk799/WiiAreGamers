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
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    socket.on('party-created', (code) => setPartyCode(code));
    socket.on('player-joined', (slot) => {
      setPlayers(prev => prev.includes(slot) ? prev : [...prev, slot]);
    });
    socket.on('debug-input', (data) => {
      setDebugLog(prev => [`Slot ${data.slot} | Btn: ${data.btn} | State: ${data.state}`, ...prev].slice(0, 10));
    });

    return () => {
      socket.off('party-created');
      socket.off('player-joined');
      socket.off('debug-input');
    };
  }, []);

  useEffect(() => {
    if (isPlaying && canvasRef.current && !playerRef.current) {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const videoUrl = `${wsProtocol}//${window.location.host}/video-stream`;
      
      playerRef.current = new JSMpeg.VideoElement(
        '#video-wrapper',
        videoUrl,
        {
          canvas: canvasRef.current,
          autoplay: true,
          loop: false
        }
      );
    }
    
    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [isPlaying]);

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

  return (
    <div className="App">
      <header>
        <h1>Dolphin Cloud Gaming</h1>
        <div className="controls">
          {!isPlaying ? (
            <button onClick={startGame}>Start Game</button>
          ) : (
            <button onClick={stopGame}>Stop Game</button>
          )}
        </div>
      </header>

      <main>
        {isPlaying ? (
          <div id="video-wrapper" className="video-container" style={{ position: 'relative' }}>
            <canvas ref={canvasRef} id="video-canvas"></canvas>
            <div style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(0,0,0,0.7)', color: '#0f0', padding: '10px', fontFamily: 'monospace', textAlign: 'left', zIndex: 100, borderRadius: '5px', pointerEvents: 'none' }}>
              <h4>Debug Inputs:</h4>
              {debugLog.length === 0 ? <p>No inputs received yet...</p> : null}
              {debugLog.map((log, i) => <div key={i}>{log}</div>)}
            </div>
          </div>
        ) : (
          <div className="library">
            <p>Select a game to begin streaming.</p>
            <div className="game-card">
              <h3>Wii Sports</h3>
            </div>
          </div>
        )}

        <div className="controller-link" style={{ marginTop: '40px' }}>
          {!partyCode ? (
            <button onClick={createParty} style={{ padding: '10px 20px', fontSize: '1.2rem', background: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
              Create Mobile Party
            </button>
          ) : (
            <div style={{ background: '#222', padding: '20px', borderRadius: '8px' }}>
              <h2 style={{ margin: 0 }}>Party Code: <span style={{ color: '#00ff88', letterSpacing: '2px' }}>{partyCode}</span></h2>
              <p>Scan or open on your phone: <a href="/controller" target="_blank" rel="noreferrer">/controller</a></p>
              <p style={{ marginTop: '10px', fontSize: '1.1rem' }}>
                Players Joined: {players.length === 0 ? "None yet" : players.map(p => `Player ${p}`).join(', ')}
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
