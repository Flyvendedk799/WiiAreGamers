import { useEffect, useState, useRef } from 'react';
import io from 'socket.io-client';
import './Controller.css';

const socket = io(window.location.origin, { transports: ['websocket'] });

// Low-latency Web Audio Synthesizer for tactile haptic clicks on iOS
let audioCtx: AudioContext | null = null;
function playHapticThump(freq = 55, duration = 0.04) {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(20, audioCtx.currentTime + duration);
        gain.gain.setValueAtTime(1.0, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
}

export default function Controller() {
    const [connected, setConnected] = useState(false);
    const [gyroEnabled, setGyroEnabled] = useState(false);
    const [gyroAimActive, setGyroAimActive] = useState(true);
    const [sensitivity, setSensitivity] = useState<'normal' | 'fast' | 'smooth'>('normal');
    const [showPwaTip, setShowPwaTip] = useState(false);
    const [recenteredToast, setRecenteredToast] = useState(false);
    
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

    // Gyro & Pointer State Refs
    const baseYaw = useRef<number | null>(null);
    const basePitch = useRef<number | null>(null);
    const baseRoll = useRef<number | null>(null);
    
    const currentYaw = useRef(0);
    const currentPitch = useRef(0);
    const currentRoll = useRef(0);

    const smoothStickX = useRef(0);
    const smoothStickY = useRef(0);

    const latestAccel = useRef({ x: 0, y: -1, z: 0 });
    const latestGyro = useRef({ pitch: 0, yaw: 0, roll: 0 });

    const wakeLockRef = useRef<any>(null);

    // Check if running on iOS Safari in regular browser (prompt to Add to Home Screen)
    useEffect(() => {
        const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        const isStandalone = (window.navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches;
        if (isIos && !isStandalone) {
            setShowPwaTip(true);
        }
    }, []);

    // Screen Wake Lock API
    const requestWakeLock = async () => {
        try {
            if ('wakeLock' in navigator) {
                wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
            }
        } catch (e) {}
    };

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                requestWakeLock();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (wakeLockRef.current) {
                wakeLockRef.current.release().catch(() => {});
            }
        };
    }, []);

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
            requestWakeLock();
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
        playHapticThump(80, 0.05);
        requestWakeLock();

        try {
            if (typeof (DeviceMotionEvent as any)?.requestPermission === 'function') {
                const res = await (DeviceMotionEvent as any).requestPermission();
                if (res !== 'granted') console.warn('DeviceMotion permission not granted');
            }
            if (typeof (DeviceOrientationEvent as any)?.requestPermission === 'function') {
                await (DeviceOrientationEvent as any).requestPermission();
            }
            enableSensors();
        } catch (err) {
            console.error('Motion permission error', err);
            enableSensors();
        }
    };

    const triggerSwing = () => {
        playHapticThump(50, 0.08);
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

    // Center laser aim to current wrist orientation
    const recenterPointer = () => {
        playHapticThump(120, 0.03);
        try { if (navigator.vibrate) navigator.vibrate(20); } catch (e) {}
        
        baseYaw.current = currentYaw.current;
        basePitch.current = currentPitch.current;
        baseRoll.current = currentRoll.current;
        
        smoothStickX.current = 0;
        smoothStickY.current = 0;

        socket.emit('controller-input', {
            stick: { x: 0, y: 0 }
        });

        setRecenteredToast(true);
        setTimeout(() => setRecenteredToast(false), 900);
    };

    const enableSensors = () => {
        setGyroEnabled(true);

        // 1. DeviceOrientation for High-Precision Wii Pointer Aiming
        window.addEventListener('deviceorientation', (event) => {
            // Compass heading or alpha
            let yaw = 0;
            if ((event as any).webkitCompassHeading !== undefined && (event as any).webkitCompassHeading !== null) {
                yaw = (event as any).webkitCompassHeading;
            } else if (event.alpha !== null) {
                yaw = (360 - event.alpha) % 360;
            }

            const pitch = event.beta ?? 55;
            const roll = event.gamma ?? 0;

            currentYaw.current = yaw;
            currentPitch.current = pitch;
            currentRoll.current = roll;

            // Auto-calibrate center on first reading
            if (baseYaw.current === null) {
                baseYaw.current = yaw;
                basePitch.current = pitch;
                baseRoll.current = roll;
            }

            // If manual touch trackpad is actively touched, do not override with gyro
            if (isTouchingTrackpad.current || !gyroAimActive) return;

            // Sensitivity configurations
            let reachX = 16.0; // degrees of horizontal wrist angle
            let reachY = 13.0; // degrees of vertical tilt
            if (sensitivity === 'fast') {
                reachX = 11.0;
                reachY = 9.0;
            } else if (sensitivity === 'smooth') {
                reachX = 22.0;
                reachY = 17.0;
            }

            // Calculate shortest angular difference (-180 to +180)
            const diffYaw = ((yaw - baseYaw.current + 540) % 360) - 180;
            const diffPitch = pitch - (basePitch.current ?? 55);
            const diffRoll = roll - (baseRoll.current ?? 0);

            // Ergonomic wrist fusion: when pointing left/right, wrist naturally rolls slightly
            const effectiveDiffX = diffYaw + diffRoll * 0.22;
            const effectiveDiffY = diffPitch;

            const targetX = Math.max(-1.0, Math.min(1.0, effectiveDiffX / reachX));
            const targetY = Math.max(-1.0, Math.min(1.0, effectiveDiffY / reachY));

            // Low-pass exponential moving average filter for sub-pixel jitter elimination
            smoothStickX.current = smoothStickX.current * 0.65 + targetX * 0.35;
            smoothStickY.current = smoothStickY.current * 0.65 + targetY * 0.35;
        });

        // 2. DeviceMotion for Physical Swings & Wii Remote Motion Physics
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

                latestAccel.current = { x: ax, y: ay, z: az };
                latestGyro.current = { pitch, yaw, roll };

                // Swing gesture detection
                const totalAccel = Math.sqrt(ax * ax + ay * ay + az * az);
                const rotMagnitude = Math.sqrt(pitch * pitch + yaw * yaw + roll * roll);
                const now = Date.now();

                if ((totalAccel > 2.0 || rotMagnitude > 240) && (now - lastSwingTime.current > 320)) {
                    lastSwingTime.current = now;
                    triggerSwing();
                }

                // Continuous stream at 60Hz (~16ms) matching Dolphin DSU input rate
                if (now - lastMotionEmit.current > 16) {
                    lastMotionEmit.current = now;
                    socket.emit('controller-input', {
                        type: 'motion',
                        stick: { x: smoothStickX.current, y: smoothStickY.current },
                        accel: latestAccel.current,
                        gyro: latestGyro.current
                    });
                }
            }
        });
    };

    const handleButton = (btn: string, state: boolean) => {
        if (state) {
            playHapticThump(90, 0.025);
            try { if (navigator.vibrate) navigator.vibrate(20); } catch (e) {}
        }
        socket.emit('controller-input', { type: 'button', btn, state });
        if (btn === 'AB' && state) {
            fetch('/api/press-ab', { method: 'POST' }).catch(() => {});
        }
    };

    // Virtual Trackpad / Manual Aim Controls
    const handleTrackpadTouch = (e: React.TouchEvent | React.MouseEvent) => {
        if (!trackpadRef.current) return;
        const rect = trackpadRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

        const relX = (clientX - rect.left) / rect.width;
        const relY = (clientY - rect.top) / rect.height;

        const stickX = Math.max(-1.0, Math.min(1.0, (relX - 0.5) * 2.2));
        const stickY = Math.max(-1.0, Math.min(1.0, -(relY - 0.5) * 2.2));

        smoothStickX.current = stickX;
        smoothStickY.current = stickY;

        socket.emit('controller-input', {
            stick: { x: stickX, y: stickY }
        });
    };

    const releaseTrackpad = () => {
        isTouchingTrackpad.current = false;
        // If gyro is active, reset smoothly to current phone aim
        if (!gyroAimActive) {
            smoothStickX.current = 0;
            smoothStickY.current = 0;
            socket.emit('controller-input', {
                stick: { x: 0, y: 0 }
            });
        }
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
                    <p className="join-hint">Hold phone pointing towards TV for laser aim.</p>
                </div>
            </div>
        );
    }

    const playerColors = ['#0088ff', '#ff3b30', '#34c759', '#ffcc00'];
    const pColor = playerColors[(joinedSlot - 1) % playerColors.length];

    return (
        <div className={`controller-ui ${swingEffect ? 'swing-active' : ''}`}>
            {/* iOS PWA Home Screen Banner */}
            {showPwaTip && (
                <div className="pwa-banner">
                    <span>📲 <strong>Add to Home Screen</strong> for full borderless fullscreen!</span>
                    <button onClick={() => setShowPwaTip(false)} className="btn-close-tip">✕</button>
                </div>
            )}

            {/* Recenter Toast */}
            {recenteredToast && (
                <div className="recenter-toast">
                    🎯 Pointer Centered!
                </div>
            )}

            {/* Top Bar */}
            <div className="top-bar">
                <div className="player-badge" style={{ backgroundColor: pColor }}>
                    Player {joinedSlot}
                </div>
                <div className="conn-status">
                    {connected ? '🟢 Connected' : '🔴 Offline'}
                </div>
            </div>

            {/* Motion Sensor Activation & Gyro Pointer Bar */}
            <div className="motion-section">
                {!gyroEnabled ? (
                    <button className="gyro-btn" onClick={requestGyroPermission}>
                        📡 Enable Motion & Gyro Pointer
                    </button>
                ) : (
                    <div className="gyro-controls-card">
                        <div className="gyro-actions-row">
                            <button 
                                className="btn-recenter"
                                onClick={recenterPointer}
                                title="Point phone at screen center and tap"
                            >
                                🎯 Recenter Pointer
                            </button>
                            <button 
                                className={`btn-toggle-aim ${gyroAimActive ? 'active' : ''}`}
                                onClick={() => {
                                    playHapticThump(100, 0.02);
                                    setGyroAimActive(!gyroAimActive);
                                }}
                            >
                                {gyroAimActive ? 'Laser Aim: ON' : 'Laser Aim: OFF'}
                            </button>
                        </div>
                        <div className="sensitivity-selector">
                            <span className="sens-label">Speed:</span>
                            <button 
                                className={`btn-sens ${sensitivity === 'smooth' ? 'active' : ''}`}
                                onClick={() => setSensitivity('smooth')}
                            >Smooth</button>
                            <button 
                                className={`btn-sens ${sensitivity === 'normal' ? 'active' : ''}`}
                                onClick={() => setSensitivity('normal')}
                            >Normal</button>
                            <button 
                                className={`btn-sens ${sensitivity === 'fast' ? 'active' : ''}`}
                                onClick={() => setSensitivity('fast')}
                            >Fast</button>
                        </div>
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
                <div className="aim-label">
                    {gyroEnabled && gyroAimActive 
                        ? "Point phone at TV, or drag thumb here to aim" 
                        : "Drag thumb here to aim pointer"}
                </div>
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
                            onTouchStart={(e) => { e.preventDefault(); handleButton('-', true); }} 
                            onTouchEnd={(e) => { e.preventDefault(); handleButton('-', false); }}
                        >-</button>
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
