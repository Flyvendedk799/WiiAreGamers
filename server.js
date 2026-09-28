const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const path = require('path');
const dgram = require('dgram');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Raw WebSocket Server for JSMPEG Video Streaming (noServer so we can manually route upgrades)
const wss = new WebSocket.Server({ noServer: true });
// WebSocket Server for zero-latency MJPEG video
const wssMjpeg = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    
    if (pathname === '/video-stream') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    } else if (pathname === '/mjpeg-stream') {
        wssMjpeg.handleUpgrade(request, socket, head, (ws) => {
            wssMjpeg.emit('connection', ws, request);
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
    
    // Clean up any stale X11 lock files or zombie processes
    try {
        require('child_process').execSync('pkill -9 Xvfb; pkill -9 fluxbox; pkill -9 ffmpeg; pkill -9 dolphin; pkill -9 pulseaudio || true');
    } catch (e) {}
    try {
        if (fs.existsSync('/tmp/.X99-lock')) fs.unlinkSync('/tmp/.X99-lock');
        if (fs.existsSync('/tmp/.X11-unix/X99')) fs.unlinkSync('/tmp/.X11-unix/X99');
        if (fs.existsSync('/var/run/pulse/pid')) fs.unlinkSync('/var/run/pulse/pid');
    } catch (e) {}

    // Initialize PulseAudio daemon for in-game sound
    try {
        require('child_process').execSync('rm -f /var/run/pulse/pid; pulseaudio --system --disallow-exit --no-cpu-limit -D || true');
    } catch (e) {}

    // Spawn Xvfb manually with access control disabled (-ac)
    const xvfbProcess = spawn('Xvfb', [
        ':99',
        '-screen', '0',
        '854x480x24',
        '-ac'
    ]);

    // Give Xvfb and PulseAudio a moment to boot
    setTimeout(() => {
        try {
            if (!fs.existsSync('/root/.fluxbox')) fs.mkdirSync('/root/.fluxbox', { recursive: true });
            fs.writeFileSync('/root/.fluxbox/init', 'session.screen0.toolbar.visible: false\n');
            fs.writeFileSync('/root/.fluxbox/apps', '[app] (name=.*)\n  [Deco] {NONE}\n  [Maximized] {yes}\n[end]\n');
        } catch (e) {}
        const wmProcess = require('child_process').spawn('fluxbox', ['-display', ':99']);

        // Start Dolphin with Pulse audio backend for game sound and real-time clock synchronization
        emulatorProcess = spawn(dolphinPath, [
            '-e', romPath,
            '-p', 'x11',
            '-C', 'Core.CPUThread=True',
            '-C', 'Core.Fastmem=True',
            '-C', 'Core.DSPHLE=True',
            '-C', 'DSP.DSPHLE=True',
            '-C', 'DSP.DSPThread=True',
            '-C', 'DSP.Backend=Pulse',
            '-C', 'Core.SyncGPU=False',
            '-C', 'Core.SyncOnSkipIdle=True',
            '-C', 'Wii.Widescreen=True',
            '-C', 'Display.Fullscreen=True'
        ], {
            env: {
                ...process.env,
                DISPLAY: ':99',
                XDG_RUNTIME_DIR: '/tmp',
                LP_NUM_THREADS: '5'
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

        // Start FFmpeg to capture video and stereo audio
        // Output 1 (pipe:1): MPEG-TS Audio-only stream to JSMpeg
        // Output 2 (pipe:3): MJPEG Video-only stream to Custom Canvas Player
        streamProcess = spawn('ffmpeg', [
            '-fflags', 'nobuffer',
            '-f', 'x11grab',
            '-thread_queue_size', '512',
            '-video_size', '854x480',
            '-framerate', '30',
            '-i', ':99',
            '-f', 'pulse',
            '-thread_queue_size', '512',
            '-i', 'default',
            
            // Audio Output
            '-f', 'mpegts',
            '-vn', // No video
            '-codec:a', 'mp2',
            '-ar', '44100',
            '-ac', '2',
            '-b:a', '128k',
            'pipe:1',
            
            // Video Output
            '-f', 'image2pipe',
            '-vcodec', 'mjpeg',
            '-s', '640x360',
            '-q:v', '6', // Decent quality, low bitrate
            '-an', // No audio
            'pipe:3'
        ], {
            stdio: ['ignore', 'pipe', 'pipe', 'pipe']
        });

        streamProcess.stdout.on('data', (data) => {
            // Broadcast audio binary data to connected websocket clients
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(data);
                }
            });
        });

        let mjpegBuffer = Buffer.alloc(0);
        let frameCount = 0;
        streamProcess.stdio[3].on('data', (data) => {
            mjpegBuffer = Buffer.concat([mjpegBuffer, data]);
            let start = mjpegBuffer.indexOf(Buffer.from([0xFF, 0xD8]));
            let end = mjpegBuffer.indexOf(Buffer.from([0xFF, 0xD9]), start);
            
            while (start !== -1 && end !== -1) {
                let frame = mjpegBuffer.slice(start, end + 2);
                mjpegBuffer = mjpegBuffer.slice(end + 2);
                frameCount++;
                
                wssMjpeg.clients.forEach(client => {
                    // Send if buffer is small (< 100KB, about 3-5 frames)
                    if (client.readyState === WebSocket.OPEN && client.bufferedAmount < 100000) {
                        client.send(frame.toString('base64'));
                    }
                });
                
                if (frameCount % 100 === 0 && wssMjpeg.clients.size > 0) {
                    console.log(`Sent 100 MJPEG frames. Clients: ${wssMjpeg.clients.size}`);
                }
                
                start = mjpegBuffer.indexOf(Buffer.from([0xFF, 0xD8]));
                end = mjpegBuffer.indexOf(Buffer.from([0xFF, 0xD9]), start);
            }
        });

        streamProcess.stderr.on('data', (data) => {
            // console.error(`FFMPEG: ${data}`); // Uncomment to debug ffmpeg
        });
    }, 600);

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
    require('child_process').exec('pkill Xvfb');
    res.json({ status: 'stopped' });
});

app.get('/api/debug-dsu', (req, res) => {
    res.json({
        subscribers: Array.from(dolphinSubscribers.entries()),
        states: controllerStates
    });
});

app.post('/api/press-ab', (req, res) => {
    const slot = 0;
    const state = controllerStates[slot];
    state.buttons['A'] = true;
    state.buttons['B'] = true;
    io.emit('debug-input', { slot, btn: 'AB', state: true });
    
    setTimeout(() => {
        state.buttons['A'] = false;
        state.buttons['B'] = false;
        io.emit('debug-input', { slot, btn: 'AB', state: false });
    }, 1200);

    res.json({ status: 'pressed' });
});

app.get('/api/status', (req, res) => {
    res.json({
        running: !!emulatorProcess,
        partyCode: currentPartyCode,
        players: activePlayers.length
    });
});

app.all('/api/press-button', (req, res) => {
    const btn = req.query.btn || req.body?.btn || 'A';
    const slot = parseInt(req.query.slot ?? req.body?.slot ?? 0);
    const duration = parseInt(req.query.duration ?? req.body?.duration ?? 300);
    const state = controllerStates[slot];
    if (state) {
        state.buttons[btn] = true;
        setTimeout(() => {
            state.buttons[btn] = false;
        }, duration);
    }
    res.json({ status: 'pressed', btn, slot });
});

app.all('/api/set-stick', (req, res) => {
    const x = parseFloat(req.query.x ?? req.body?.x ?? 0);
    const y = parseFloat(req.query.y ?? req.body?.y ?? 0);
    const slot = parseInt(req.query.slot ?? req.body?.slot ?? 0);
    const state = controllerStates[slot];
    if (state) {
        state.stick = { x, y };
    }
    res.json({ status: 'ok', stick: { x, y }, slot });
});

function executeSwing(slot = 0) {
    const state = controllerStates[slot];
    if (!state) return;
    
    // 1. Windup + trigger shake
    state.buttons['R1'] = true;
    state.accel = { x: -2.0, y: -0.5, z: 1.0 };
    state.gyro = { pitch: 120, yaw: -180, roll: 250 };
    
    // 2. Powerful forward stroke
    setTimeout(() => {
        state.buttons['R1'] = true;
        state.accel = { x: 5.0, y: 1.0, z: 4.0 };
        state.gyro = { pitch: -400, yaw: 600, roll: -600 };
    }, 50);

    // 3. Follow-through & release shake
    setTimeout(() => {
        state.buttons['R1'] = false;
        state.accel = { x: 1.2, y: -0.8, z: 0.6 };
        state.gyro = { pitch: -50, yaw: 100, roll: -100 };
    }, 160);

    // 4. Return to rest
    setTimeout(() => {
        state.buttons['R1'] = false;
        state.accel = { x: 0.0, y: -1.0, z: 0.0 };
        state.gyro = { pitch: 0, yaw: 0, roll: 0 };
    }, 300);
}

app.all('/api/swing', (req, res) => {
    const slot = parseInt(req.query.slot ?? req.body?.slot ?? 0);
    executeSwing(slot);
    res.json({ status: 'swung', slot });
});

app.all('/api/aim', (req, res) => {
    const x = parseFloat(req.query.x ?? req.body?.x ?? 0);
    const y = parseFloat(req.query.y ?? req.body?.y ?? 0);
    const slot = parseInt(req.query.slot ?? req.body?.slot ?? 0);
    if (controllerStates[slot]) {
        controllerStates[slot].stick = { x, y };
    }
    res.json({ status: 'aimed', x, y, slot });
});

const { DSUPacker } = require('./dsu-packer');
const dsu = new DSUPacker();

// Store latest controller state per slot (0 to 3)
const controllerStates = {
    0: { buttons: {}, gyro: { pitch: 0, yaw: 0, roll: 0 }, accel: { x: 0, y: -1, z: 0 }, stick: { x: 0, y: 0 } },
    1: { buttons: {}, gyro: { pitch: 0, yaw: 0, roll: 0 }, accel: { x: 0, y: -1, z: 0 }, stick: { x: 0, y: 0 } },
    2: { buttons: {}, gyro: { pitch: 0, yaw: 0, roll: 0 }, accel: { x: 0, y: -1, z: 0 }, stick: { x: 0, y: 0 } },
    3: { buttons: {}, gyro: { pitch: 0, yaw: 0, roll: 0 }, accel: { x: 0, y: -1, z: 0 }, stick: { x: 0, y: 0 } }
};

let currentPartyCode = null;
let activePlayers = []; // index = slot, value = socket.id

const dolphinSubscribers = new Map(); // key: "address:port" -> { address, port, lastSeen }

// Handle DSU Handshakes and Data Requests from Dolphin
udpSocket.on('message', (msg, rinfo) => {
    if (msg.length >= 20 && msg.toString('ascii', 0, 4) === 'DSUC') {
        const type = msg.readUInt32LE(16);
        const clientKey = `${rinfo.address}:${rinfo.port}`;
        dolphinSubscribers.set(clientKey, { address: rinfo.address, port: rinfo.port, lastSeen: Date.now() });

        if (type === 0x100000) {
            // Dolphin requesting Protocol Version
            const res = dsu.createVersionResponsePacket();
            udpSocket.send(res, rinfo.port, rinfo.address);
        } else if (type === 0x100001) {
            // Dolphin requesting Ports Info (ListPorts)
            for (let s = 0; s < 4; s++) {
                const res = dsu.createPortsInfoPacket(s);
                udpSocket.send(res, rinfo.port, rinfo.address);
            }
        } else if (type === 0x100002) {
            // Dolphin requesting Pad Data
            const padId = msg.length > 21 ? msg.readUInt8(21) : 0;
            dolphinSubscribers.set(clientKey, { address: rinfo.address, port: rinfo.port, padId, lastSeen: Date.now() });
            const state = controllerStates[padId] || controllerStates[0];
            const packet = dsu.createControllerPacket(state, padId);
            udpSocket.send(packet, rinfo.port, rinfo.address);
        }
    }
});

// Automatically discover Dolphin UDP ports from /proc/net/udp
function updateDolphinPorts() {
    try {
        if (fs.existsSync('/proc/net/udp')) {
            const lines = fs.readFileSync('/proc/net/udp', 'utf8').split('\n').slice(1);
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length > 2) {
                    const port = parseInt(parts[1].split(':')[1], 16);
                    if (port > 0 && port !== 26760) {
                        const key = `127.0.0.1:${port}`;
                        if (!dolphinSubscribers.has(key)) {
                            dolphinSubscribers.set(key, { address: '127.0.0.1', port, lastSeen: Date.now() });
                        } else {
                            dolphinSubscribers.get(key).lastSeen = Date.now();
                        }
                    }
                }
            }
        }
    } catch (e) {}
}
setInterval(updateDolphinPorts, 1000);
updateDolphinPorts();

// Broadcast continuous controller state at 60Hz to all active Dolphin subscribers
setInterval(() => {
    if (dolphinSubscribers.size === 0) return;
    const now = Date.now();
    for (const [key, client] of dolphinSubscribers.entries()) {
        if (now - client.lastSeen > 10000) {
            dolphinSubscribers.delete(key);
            continue;
        }
        const padId = client.padId !== undefined ? client.padId : 0;
        const state = controllerStates[padId] || controllerStates[0];
        const packet = dsu.createControllerPacket(state, padId);
        udpSocket.send(packet, client.port, client.address);
    }
}, 16);

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
        if (currentPartyCode && code.toUpperCase() === currentPartyCode) {
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
        let slot = activePlayers.indexOf(socket.id);
        if (slot === -1) slot = 0; // Default to player 1

        const state = controllerStates[slot];
        if (!state) return;
        if (data.type === 'motion') {
            if (data.accel) state.accel = data.accel;
            if (data.gyro) state.gyro = data.gyro;
        } else if (data.type === 'gyro') {
            state.gyro = { pitch: data.alpha || 0, yaw: data.beta || 0, roll: data.gamma || 0 };
        } else if (data.type === 'button') {
            state.buttons[data.btn] = data.state;
            if (data.btn === 'AB') {
                state.buttons['A'] = !!data.state;
                state.buttons['B'] = !!data.state;
            }
        }
        if (data.stick) {
            state.stick = data.stick;
        }

        // Send immediate UDP packet to subscribers on input change
        for (const [key, client] of dolphinSubscribers.entries()) {
            if (client.padId === undefined || client.padId === slot) {
                const dsuPacket = dsu.createControllerPacket(state, slot);
                udpSocket.send(dsuPacket, client.port, client.address);
            }
        }
    });

    socket.on('swing', () => {
        let slot = activePlayers.indexOf(socket.id);
        if (slot === -1) slot = 0;
        executeSwing(slot);
    });

    socket.on('disconnect', () => {
        const slot = activePlayers.indexOf(socket.id);
        if (slot !== -1) {
            console.log(`Player ${slot} disconnected`);
        }
    });
});

// Provide a fallback route for react router
app.use((req, res, next) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
        res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
    } else {
        next();
    }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`ServerHoster Orchestrator running on port ${PORT}`));
