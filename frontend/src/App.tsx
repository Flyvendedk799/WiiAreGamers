import { useState, useEffect, useRef } from 'react'
import io from 'socket.io-client'
import JSMpeg from '@cycjimmy/jsmpeg-player'
import './App.css'

// Socket.io for Controller Inputs
const socket = io(window.location.origin);

function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    // We only mount the video player when playing
    if (isPlaying && canvasRef.current && !playerRef.current) {
      const videoUrl = `ws://${window.location.host}/video-stream`;
      
      // JSMPEG decodes MPEG1 video stream directly in WebGL/Canvas
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
          <div id="video-wrapper" className="video-container">
            <canvas ref={canvasRef} id="video-canvas"></canvas>
          </div>
        ) : (
          <div className="library">
            <p>Select a game to begin streaming.</p>
            {/* Game library UI goes here */}
            <div className="game-card">
              <h3>Mario Kart Wii (Demo)</h3>
            </div>
          </div>
        )}

        <div className="controller-link">
          <p>Playing on desktop? Open this URL on your phone for Gyro Controls:</p>
          <a href="/controller" target="_blank">Mobile Controller</a>
        </div>
      </main>
    </div>
  )
}

export default App
