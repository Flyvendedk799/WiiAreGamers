import { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import './Controller.css';

const socket = io(window.location.origin, { transports: ['websocket'] });

export default function Controller() {
    const [connected, setConnected] = useState(false);
    const [gyroEnabled, setGyroEnabled] = useState(false);
    
    // Party system state
    const [partyCodeInput, setPartyCodeInput] = useState('');
    const [joinedSlot, setJoinedSlot] = useState<number | null>(null);
    const [joinError, setJoinError] = useState('');
    const [swingEffect, setSwingEffect] = useState(false);

    // Trackpad ref
    const trackpadRef = useRef<HTMLDivElement>(null);
    const isTouchingTrackpad = useRef(false);
    const lastSwingTime = useRef(0);
    const lastMotionEmit = useRef(0);

    // Auto-join if code is in URL query parameters
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        if (code) {
            setPartyCodeInput(code.toUpperCase());
            socket.emit('join-party', code.toUpperCase());
        }
    }, []);

    useEffect(() => {
        socket.on('connect', () => setConnected(true));
        socket.on('disconnect', () => setConnected(false));
        
        socket.on('joined-party', (slot) => {
            setJoinedSlot(slot);
            setJoinError('');
        });
        socket.on('join-error', (err) => {
            setJoinError(err);
        });

        return () => {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('joined-party');
            socket.off('join-error');
        };
    }, []);

    const joinParty = () => {
        if (!partyCodeInput.trim()) return;
        socket.emit('join-party', partyCodeInput.trim());
    };

    const requestGyroPermission = async () => {
        try {
            if (typeof (DeviceMotionEvent as any)?.requestPermission === 'function') {
                const res = await (DeviceMotionEvent as any).requestPermission();
                if (res !== 'granted') console.warn('DeviceMotion permission not granted');
            }
            if (typeof (DeviceOrientationEvent as any)?.requestPermission === 'function') {
                await (DeviceOrientationEvent as any).requestPermission();
            }
            enableMotion();
        } catch (err) {
            console.error('Motion permission error', err);
            enableMotion();
        }
    };

    const triggerSwing = () => {
        try { if (navigator.vibrate) navigator.vibrate([40, 20, 40]); } catch (e) {}
        setSwingEffect(true);
        setTimeout(() => setSwingEffect(false), 280);
        socket.emit('swing');
        fetch('/api/swing', { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slot: (joinedSlot ? joinedSlot - 1 : 0) })
        }).catch(() => {});
    };

    const enableMotion = () => {
        setGyroEnabled(true);

        window.addEventListener('devicemotion', (event) => {
            const acc = event.accelerationIncludingGravity || event.acceleration;
            const rot = event.rotationRate;
            if (acc) {
                const G = 9.80665;
                const ax = -(acc.x || 0) / G;
                const ay = -(acc.y || 0) / G;
                const az = (acc.z || 0) / G;

                const pitch = rot?.beta || 0;
                const roll = rot?.gamma || 0;
                const yaw = rot?.alpha || 0;

                // 1. Automatic physical swing gesture detection
                const totalAccel = Math.sqrt(ax * ax + ay * ay + az * az);
                const rotMagnitude = Math.sqrt(pitch * pitch + yaw * yaw + roll * roll);
                const now = Date.now();

                if ((totalAccel > 2.2 || rotMagnitude > 260) && (now - lastSwingTime.current > 350)) {
                    lastSwingTime.current = now;
                    triggerSwing();
                }

                // 2. Throttled continuous stream at ~30Hz (every 33ms) to prevent network socket congestion
                if (now - lastMotionEmit.current > 33) {
                    lastMotionEmit.current = now;
                    socket.emit('controller-input', {
                        type: 'motion',
                        accel: { x: ax, y: ay, z: az },
                        gyro: { pitch, yaw, roll }
                    });
                }
            }
        });
    };

    const handleButton = (btn: string, state: boolean) => {
        try { if (state && navigator.vibrate) navigator.vibrate(25); } catch (e) {}
        socket.emit('controller-input', { type: 'button', btn, state });
        if (btn === 'AB' && state) {
            fetch('/api/press-ab', { method: 'POST' }).catch(() => {});
        }
    };

    // Virtual Trackpad / Aim controls for navigating menus effortlessly
    const handleTrackpadTouch = (e: React.TouchEvent | React.MouseEvent) => {
        if (!trackpadRef.current) return;
        const rect = trackpadRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        const relX = (clientX - rect.left) / rect.width;
        const relY = (clientY - rect.top) / rect.height;

        // Map 0..1 to -1.0 .. 1.0 (with slight deadzone)
        const stickX = Math.max(-1.0, Math.min(1.0, (relX - 0.5) * 2.2));
        const stickY = Math.max(-1.0, Math.min(1.0, -(relY - 0.5) * 2.2));

        socket.emit('controller-input', {
            stick: { x: stickX, y: stickY }
        });
    };

    const releaseTrackpad = () => {
        isTouchingTrackpad.current = false;
        socket.emit('controller-input', {
            stick: { x: 0, y: 0 }
        });
    };

    if (!joinedSlot) {
        return (
            <div className="controller-join-screen">
                <div className="join-card">
                    <h2>🎮 Join Wii Party</h2>
                    {joinError && <p className="join-error">{joinError}</p>}
                    <input 
                        type="text" 
                        placeholder="ENTER 4-LETTER CODE"
                        value={partyCodeInput}
                        onChange={(e) => setPartyCodeInput(e.target.value.toUpperCase())}
                        maxLength={6}
                    />
                    <button onClick={joinParty} className="btn-join">
                        Connect Controller
                    </button>
                    <p className="join-hint">Make sure your phone is connected to the internet.</p>
                </div>
            </div>
        );
    }

    const playerColors = ['#0088ff', '#ff3b30', '#34c759', '#ffcc00'];
    const pColor = playerColors[(joinedSlot - 1) % playerColors.length];

    return (
        <div className={`controller-ui ${swingEffect ? 'swing-active' : ''}`}>
            {/* Top Bar */}
            <div className="top-bar">
                <div className="player-badge" style={{ backgroundColor: pColor }}>
                    Player {joinedSlot}
                </div>
                <div className="conn-status">
                    {connected ? '🟢 Connected' : '🔴 Offline'}
                </div>
            </div>

            {/* Motion Sensor Activation */}
            <div className="motion-section">
                {!gyroEnabled ? (
                    <button className="gyro-btn" onClick={requestGyroPermission}>
                        📡 Enable Motion & Swing Tracking
                    </button>
                ) : (
                    <div className="gyro-active-badge">
                        📡 Motion Active (Swing Phone to Hit!)
                    </div>
                )}
            </div>

            {/* Prominent Swing Button */}
            <button 
                className={`btn-swing ${swingEffect ? 'pulsing' : ''}`}
                onTouchStart={(e) => { e.preventDefault(); triggerSwing(); }}
                onMouseDown={(e) => { e.preventDefault(); triggerSwing(); }}
            >
                🎾 SWING / HIT
            </button>

            {/* Aim Trackpad for Menu Navigation */}
            <div 
                ref={trackpadRef}
                className="aim-trackpad"
                onTouchStart={(e) => { isTouchingTrackpad.current = true; handleTrackpadTouch(e); }}
                onTouchMove={(e) => { if (isTouchingTrackpad.current) handleTrackpadTouch(e); }}
                onTouchEnd={releaseTrackpad}
                onMouseDown={(e) => { isTouchingTrackpad.current = true; handleTrackpadTouch(e); }}
                onMouseMove={(e) => { if (isTouchingTrackpad.current) handleTrackpadTouch(e); }}
                onMouseUp={releaseTrackpad}
            >
                <div className="aim-crosshair">🎯</div>
                <div className="aim-label">Drag to Aim Pointer in Menus</div>
            </div>

            {/* Main Primary Action Buttons: Big A and B */}
            <div className="primary-buttons">
                <button 
                    className="btn-a"
                    onTouchStart={(e) => { e.preventDefault(); handleButton('A', true); }} 
                    onTouchEnd={(e) => { e.preventDefault(); handleButton('A', false); }}
                    onMouseDown={(e) => { e.preventDefault(); handleButton('A', true); }} 
                    onMouseUp={(e) => { e.preventDefault(); handleButton('A', false); }}
                >
                    A
                </button>
                <button 
                    className="btn-b"
                    onTouchStart={(e) => { e.preventDefault(); handleButton('B', true); }} 
                    onTouchEnd={(e) => { e.preventDefault(); handleButton('B', false); }}
                    onMouseDown={(e) => { e.preventDefault(); handleButton('B', true); }} 
                    onMouseUp={(e) => { e.preventDefault(); handleButton('B', false); }}
                >
                    B
                </button>
            </div>

            {/* D-Pad & Menu Row */}
            <div className="bottom-controls">
                <div className="d-pad">
                    <button 
                        onTouchStart={(e) => { e.preventDefault(); handleButton('UP', true); }} 
                        onTouchEnd={(e) => { e.preventDefault(); handleButton('UP', false); }}
                        onMouseDown={(e) => { e.preventDefault(); handleButton('UP', true); }} 
                        onMouseUp={(e) => { e.preventDefault(); handleButton('UP', false); }}
                    >▲</button>
                    <div className="d-pad-middle">
                        <button 
                            onTouchStart={(e) => { e.preventDefault(); handleButton('LEFT', true); }} 
                            onTouchEnd={(e) => { e.preventDefault(); handleButton('LEFT', false); }}
                            onMouseDown={(e) => { e.preventDefault(); handleButton('LEFT', true); }} 
                            onMouseUp={(e) => { e.preventDefault(); handleButton('LEFT', false); }}
                        >◀</button>
                        <button 
                            onTouchStart={(e) => { e.preventDefault(); handleButton('RIGHT', true); }} 
                            onTouchEnd={(e) => { e.preventDefault(); handleButton('RIGHT', false); }}
                            onMouseDown={(e) => { e.preventDefault(); handleButton('RIGHT', true); }} 
                            onMouseUp={(e) => { e.preventDefault(); handleButton('RIGHT', false); }}
                        >▶</button>
                    </div>
                    <button 
                        onTouchStart={(e) => { e.preventDefault(); handleButton('DOWN', true); }} 
                        onTouchEnd={(e) => { e.preventDefault(); handleButton('DOWN', false); }}
                        onMouseDown={(e) => { e.preventDefault(); handleButton('DOWN', true); }} 
                        onMouseUp={(e) => { e.preventDefault(); handleButton('DOWN', false); }}
                    >▼</button>
                </div>

                <div className="menu-shortcuts">
                    <button 
                        className="btn-ab"
                        onTouchStart={(e) => { e.preventDefault(); handleButton('AB', true); }} 
                        onTouchEnd={(e) => { e.preventDefault(); handleButton('AB', false); }}
                        onMouseDown={(e) => { e.preventDefault(); handleButton('AB', true); }} 
                        onMouseUp={(e) => { e.preventDefault(); handleButton('AB', false); }}
                    >
                        Press A+B
                    </button>
                    <div className="aux-row">
                        <button 
                            onTouchStart={(e) => { e.preventDefault(); handleButton('1', true); }} 
                            onTouchEnd={(e) => { e.preventDefault(); handleButton('1', false); }}
                        >1</button>
                        <button 
                            onTouchStart={(e) => { e.preventDefault(); handleButton('2', true); }} 
                            onTouchEnd={(e) => { e.preventDefault(); handleButton('2', false); }}
                        >2</button>
                        <button 
                            onTouchStart={(e) => { e.preventDefault(); handleButton('+', true); }} 
                            onTouchEnd={(e) => { e.preventDefault(); handleButton('+', false); }}
                        >+</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
