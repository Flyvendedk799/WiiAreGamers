import { useEffect, useState } from 'react';
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

    const enableMotion = () => {
        setGyroEnabled(true);

        // Listen to devicemotion for true accelerometer (Gs) and angular rotation velocity (deg/s)
        window.addEventListener('devicemotion', (event) => {
            const acc = event.accelerationIncludingGravity || event.acceleration;
            const rot = event.rotationRate;
            if (acc) {
                const G = 9.80665;
                // Phone held pointing forward like a Wiimote:
                // ax: lateral left/right
                // ay: up/down
                // az: forward/back
                const ax = -(acc.x || 0) / G;
                const ay = -(acc.y || 0) / G;
                const az = (acc.z || 0) / G;

                const pitch = rot?.beta || 0;
                const roll = rot?.gamma || 0;
                const yaw = rot?.alpha || 0;

                socket.emit('controller-input', {
                    type: 'motion',
                    accel: { x: ax, y: ay, z: az },
                    gyro: { pitch, yaw, roll }
                });
            }
        });
    };

    const handleButton = (btn: string, state: boolean) => {
        try { if (state && navigator.vibrate) navigator.vibrate(30); } catch (e) {}
        socket.emit('controller-input', { type: 'button', btn, state });
        if (btn === 'AB' && state) {
            fetch('/api/press-ab', { method: 'POST' }).catch(() => {});
        }
    };

    const triggerSwing = () => {
        try { if (navigator.vibrate) navigator.vibrate(50); } catch (e) {}
        socket.emit('swing');
        fetch('/api/swing', { method: 'POST' }).catch(() => {});
    };

    if (!joinedSlot) {
        return (
            <div className="controller-ui" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#111', color: 'white' }}>
                <h2 style={{ marginBottom: '20px' }}>Join Mobile Party</h2>
                {joinError && <p style={{ color: '#ff4444', marginBottom: '10px' }}>{joinError}</p>}
                <input 
                    type="text" 
                    placeholder="Enter 4-letter Code"
                    value={partyCodeInput}
                    onChange={(e) => setPartyCodeInput(e.target.value.toUpperCase())}
                    style={{ padding: '15px', fontSize: '1.5rem', textAlign: 'center', textTransform: 'uppercase', borderRadius: '8px', border: 'none', marginBottom: '20px', width: '80%', maxWidth: '300px' }}
                    maxLength={6}
                />
                <button 
                    onClick={joinParty}
                    style={{ padding: '15px 40px', fontSize: '1.2rem', background: '#007bff', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                >
                    Join Party
                </button>
            </div>
        );
    }

    return (
        <div className="controller-ui">
            <h2 style={{ margin: '10px 0' }}>Player {joinedSlot} Wiimote</h2>
            <div className="status" style={{ marginBottom: '15px' }}>
                Status: {connected ? '🟢 Connected' : '🔴 Disconnected'}
            </div>
            
            {!gyroEnabled ? (
                <button className="gyro-btn" onClick={requestGyroPermission}>
                    📡 Enable Motion / Swing Tracking
                </button>
            ) : (
                <div className="gyro-status">Motion Tracking Active 📡</div>
            )}

            <button 
                className="btn-swing"
                onTouchStart={(e) => { e.preventDefault(); triggerSwing(); }}
                onMouseDown={(e) => { e.preventDefault(); triggerSwing(); }}
            >
                🎾 Swing / Hit
            </button>

            <div className="d-pad">
                <button 
                    onTouchStart={(e) => { e.preventDefault(); handleButton('UP', true); }} 
                    onTouchEnd={(e) => { e.preventDefault(); handleButton('UP', false); }}
                    onMouseDown={(e) => { e.preventDefault(); handleButton('UP', true); }} 
                    onMouseUp={(e) => { e.preventDefault(); handleButton('UP', false); }}
                >UP</button>
                <div className="d-pad-middle">
                    <button 
                        onTouchStart={(e) => { e.preventDefault(); handleButton('LEFT', true); }} 
                        onTouchEnd={(e) => { e.preventDefault(); handleButton('LEFT', false); }}
                        onMouseDown={(e) => { e.preventDefault(); handleButton('LEFT', true); }} 
                        onMouseUp={(e) => { e.preventDefault(); handleButton('LEFT', false); }}
                    >L</button>
                    <button 
                        onTouchStart={(e) => { e.preventDefault(); handleButton('RIGHT', true); }} 
                        onTouchEnd={(e) => { e.preventDefault(); handleButton('RIGHT', false); }}
                        onMouseDown={(e) => { e.preventDefault(); handleButton('RIGHT', true); }} 
                        onMouseUp={(e) => { e.preventDefault(); handleButton('RIGHT', false); }}
                    >R</button>
                </div>
                <button 
                    onTouchStart={(e) => { e.preventDefault(); handleButton('DOWN', true); }} 
                    onTouchEnd={(e) => { e.preventDefault(); handleButton('DOWN', false); }}
                    onMouseDown={(e) => { e.preventDefault(); handleButton('DOWN', true); }} 
                    onMouseUp={(e) => { e.preventDefault(); handleButton('DOWN', false); }}
                >DOWN</button>
            </div>

            <div className="action-buttons">
                <button 
                    className="btn-a"
                    onTouchStart={(e) => { e.preventDefault(); handleButton('A', true); }} 
                    onTouchEnd={(e) => { e.preventDefault(); handleButton('A', false); }}
                    onMouseDown={(e) => { e.preventDefault(); handleButton('A', true); }} 
                    onMouseUp={(e) => { e.preventDefault(); handleButton('A', false); }}
                    style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
                >A</button>
                <button 
                    className="btn-b"
                    onTouchStart={(e) => { e.preventDefault(); handleButton('B', true); }} 
                    onTouchEnd={(e) => { e.preventDefault(); handleButton('B', false); }}
                    onMouseDown={(e) => { e.preventDefault(); handleButton('B', true); }} 
                    onMouseUp={(e) => { e.preventDefault(); handleButton('B', false); }}
                    style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
                >B</button>
            </div>
            
            <div style={{ marginTop: '20px' }}>
                <button 
                    className="btn-ab"
                    onTouchStart={(e) => { e.preventDefault(); handleButton('AB', true); }} 
                    onTouchEnd={(e) => { e.preventDefault(); handleButton('AB', false); }}
                    onMouseDown={(e) => { e.preventDefault(); handleButton('AB', true); }} 
                    onMouseUp={(e) => { e.preventDefault(); handleButton('AB', false); }}
                    onMouseLeave={() => handleButton('AB', false)}
                    style={{ padding: '12px 24px', fontSize: '1.1rem', background: '#ffaa00', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
                >
                    Press A+B (Menu)
                </button>
            </div>
        </div>
    );
}
