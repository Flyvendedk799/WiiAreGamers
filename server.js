const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const path = require('path');
const dgram = require('dgram');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Raw WebSocket Server for JSMPEG Video Streaming (noServer so we can manually route upgrades)
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    
    if (pathname === '/video-stream') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    }
    // Socket.io automatically intercepts its own path (/socket.io/)
    // so we just leave it alone.
});

app.use(express.static(path.join(__dirname, 'frontend/dist')));
app.use(express.json());

let emulatorProcess = null;
let streamProcess = null;

// UDP socket for DSU (iOS app sends here natively, or our wrapper sends here)
const udpSocket = dgram.createSocket('udp4');
udpSocket.bind(26760, () => console.log('UDP DSU listener on 26760 (For iOS DSUController)'));

app.post('/api/start', (req, res) => {
    if (emulatorProcess) {
        return res.json({ status: 'already_running' });
    }

    // Use the bundled Wii Sports ROM to guarantee an immediate playable state
    const romPath = process.env.ROM_PATH || path.join(__dirname, 'game.wbfs');
    // Debian installs games to /usr/games, which isn't in PATH by default. Use nogui version for better headless performance.
    const dolphinPath = '/usr/games/dolphin-emu-nogui';
    
    // Spawn Xvfb manually with access control disabled (-ac)
    const xvfbProcess = spawn('Xvfb', [
        ':99',
        '-screen', '0',
        '1280x720x24',
        '-ac'
    ]);

    // Give Xvfb a moment to boot
    setTimeout(() => {
        emulatorProcess = spawn(dolphinPath, [
            '-e', romPath,
            '-C', 'Display.Fullscreen=True',
            '-C', 'Display.RenderWindowWidth=1280',
            '-C', 'Display.RenderWindowHeight=720',
            '-C', 'Display.RenderToMain=True',
            '-C', 'Display.AspectRatio=3',
            '-C', 'Display.KeepWindowOnTop=True'
        ], {
            env: {
                ...process.env,
                DISPLAY: ':99',
                XDG_RUNTIME_DIR: '/tmp'
            }
        });

        emulatorProcess.stdout.on('data', (data) => console.log('Dolphin stdout:', data.toString()));
        emulatorProcess.stderr.on('data', (data) => console.error('Dolphin stderr:', data.toString()));

        emulatorProcess.on('close', (code) => {
            console.log(`Emulator stopped with code ${code}`);
            emulatorProcess = null;
            if (streamProcess) streamProcess.kill();
            xvfbProcess.kill();
        });

        // Start FFmpeg to capture Xvfb and stream it as MPEG1 for JSMPEG
        streamProcess = spawn('ffmpeg', [
            '-f', 'x11grab',
            '-video_size', '1280x720',
            '-r', '30',
            '-i', ':99',
            '-f', 'mpegts',
            '-codec:v', 'mpeg1video',
            '-s', '1280x720',
            '-b:v', '2000k',
            '-bf', '0',
            '-'
        ]);

        streamProcess.stdout.on('data', (data) => {
            // Broadcast raw video binary data to connected websocket clients
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(data);
                }
            });
        });

        streamProcess.stderr.on('data', (data) => {
            console.error(`FFMPEG: ${data}`); // Uncomment to debug ffmpeg
        });
    }, 500);

    res.json({ status: 'started' });
});

app.post('/api/stop', (req, res) => {
    if (emulatorProcess) {
        emulatorProcess.kill();
        emulatorProcess = null;
    }
    if (streamProcess) {
        streamProcess.kill();
        streamProcess = null;
    }
    res.json({ status: 'stopped' });
});

const { DSUPacker } = require('./dsu-packer');
const dsu = new DSUPacker();

// Store latest controller state per slot (0 to 3)
const controllerStates = {
    0: { buttons: {}, gyro: { pitch: 0, yaw: 0, roll: 0 }, accel: { x: 0, y: -1, z: 0 } },
    1: { buttons: {}, gyro: { pitch: 0, yaw: 0, roll: 0 }, accel: { x: 0, y: -1, z: 0 } },
    2: { buttons: {}, gyro: { pitch: 0, yaw: 0, roll: 0 }, accel: { x: 0, y: -1, z: 0 } },
    3: { buttons: {}, gyro: { pitch: 0, yaw: 0, roll: 0 }, accel: { x: 0, y: -1, z: 0 } }
};

let currentPartyCode = null;
let activePlayers = []; // index = slot, value = socket.id

// Handle WebSocket controller inputs from our custom mobile web UI
io.on('connection', (socket) => {
    console.log('Client connected via Socket.io:', socket.id);

    // Host creates a party
    socket.on('create-party', () => {
        currentPartyCode = Math.random().toString(36).substring(2, 6).toUpperCase();
        activePlayers = []; // Reset players on new party
        socket.emit('party-created', currentPartyCode);
        console.log('Party created:', currentPartyCode);
    });

    // Mobile joins a party
    socket.on('join-party', (code) => {
        if (code.toUpperCase() === currentPartyCode) {
            let slot = activePlayers.indexOf(socket.id);
            if (slot === -1) {
                if (activePlayers.length < 4) {
                    slot = activePlayers.length;
                    activePlayers.push(socket.id);
                } else {
                    return socket.emit('join-error', 'Party is full');
                }
            }
            socket.emit('joined-party', slot + 1); // 1-indexed for UI display
            io.emit('player-joined', slot + 1);
            console.log(`Player joined slot ${slot}`);
        } else {
            socket.emit('join-error', 'Invalid party code');
        }
    });

    socket.on('controller-input', (data) => {
        const slot = activePlayers.indexOf(socket.id);
        if (slot !== -1) {
            const state = controllerStates[slot];
            if (data.type === 'gyro') {
                state.gyro = { pitch: data.alpha, yaw: data.beta, roll: data.gamma };
            } else if (data.type === 'button') {
                state.buttons[data.btn] = data.state;
            }

            const dsuPacket = dsu.createControllerPacket(state, slot);
            udpSocket.send(dsuPacket, 26760, '127.0.0.1');
        }
    });

    socket.on('disconnect', () => {
        const slot = activePlayers.indexOf(socket.id);
        if (slot !== -1) {
            // We could remove them, but for now we leave the slot reserved until party reset
            // so they can reconnect if they refresh.
            console.log(`Player ${slot} disconnected`);
        }
    });
});

// Provide a fallback route for react router
app.use((req, res, next) => {
    if (req.method === 'GET') {
        res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
    } else {
        next();
    }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`ServerHoster Orchestrator running on port ${PORT}`));
