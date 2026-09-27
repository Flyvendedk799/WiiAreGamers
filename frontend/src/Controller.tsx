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
        // iOS requires explicit permission for DeviceOrientation
        if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
            try {
                const permission = await (DeviceOrientationEvent as any).requestPermission();
                if (permission === 'granted') {
                    enableGyro();
                }
            } catch (err) {
                console.error('Gyro permission error', err);
            }
        } else {
            enableGyro();
        }
    };

    const enableGyro = () => {
        setGyroEnabled(true);
        window.addEventListener('deviceorientation', (event) => {
            // Send Gyro data to server
            socket.emit('controller-input', {
                type: 'gyro',
                alpha: event.alpha, // z axis
                beta: event.beta,   // x axis
                gamma: event.gamma  // y axis
            });
        });
    };

    const handleButton = (btn: string, state: boolean) => {
        socket.emit('controller-input', { type: 'button', btn, state });
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
            <h2>Player {joinedSlot} Web Controller</h2>
            <div className="status">
                Status: {connected ? '🟢 Connected' : '🔴 Disconnected'}
            </div>
            
            {!gyroEnabled ? (
                <button className="gyro-btn" onClick={requestGyroPermission}>
                    Enable Motion/Gyro
                </button>
            ) : (
                <div className="gyro-status">Motion Active 📡</div>
            )}

            <div className="d-pad">
                <button 
                    onPointerDown={() => handleButton('UP', true)} 
                    onPointerUp={() => handleButton('UP', false)}
                >UP</button>
                <div className="d-pad-middle">
                    <button 
                        onPointerDown={() => handleButton('LEFT', true)} 
                        onPointerUp={() => handleButton('LEFT', false)}
                    >L</button>
                    <button 
                        onPointerDown={() => handleButton('RIGHT', true)} 
                        onPointerUp={() => handleButton('RIGHT', false)}
                    >R</button>
                </div>
                <button 
                    onPointerDown={() => handleButton('DOWN', true)} 
                    onPointerUp={() => handleButton('DOWN', false)}
                >DOWN</button>
            </div>

            <div className="action-buttons">
                <button 
                    className="btn-a"
                    onPointerDown={() => handleButton('A', true)} 
                    onPointerUp={() => handleButton('A', false)}
                >A</button>
                <button 
                    className="btn-b"
                    onPointerDown={() => handleButton('B', true)} 
                    onPointerUp={() => handleButton('B', false)}
                >B</button>
            </div>
            
            <div style={{ marginTop: '20px' }}>
                <button 
                    className="btn-ab"
                    onPointerDown={() => { handleButton('A', true); handleButton('B', true); }} 
                    onPointerUp={() => { handleButton('A', false); handleButton('B', false); }}
                    style={{ padding: '15px 30px', fontSize: '1.2rem', background: '#ffaa00', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}
                >
                    Press A+B (Menu)
                </button>
            </div>
        </div>
    );
}
