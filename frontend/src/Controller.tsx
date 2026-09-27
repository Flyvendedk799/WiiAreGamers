import { useEffect, useState } from 'react';
import io from 'socket.io-client';
import './Controller.css';

const socket = io(window.location.origin);

export default function Controller() {
    const [connected, setConnected] = useState(false);
    const [gyroEnabled, setGyroEnabled] = useState(false);

    useEffect(() => {
        socket.on('connect', () => setConnected(true));
        socket.on('disconnect', () => setConnected(false));
        return () => {
            socket.off('connect');
            socket.off('disconnect');
        };
    }, []);

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

    return (
        <div className="controller-ui">
            <h2>Wii Web Controller</h2>
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
        </div>
    );
}
