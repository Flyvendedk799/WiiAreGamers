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
    
    // Spawn Dolphin in Xvfb (Virtual Framebuffer for headless mode)
    // Display :99 is commonly used. Disable MIT-SHM to avoid Docker 64MB /dev/shm limits causing Bus Errors.
    emulatorProcess = spawn('xvfb-run', [
        '-n', '99',
        '-s', '-screen 0 1280x720x24 -extension MIT-SHM',
        dolphinPath,
        '-e', romPath
    ], {
        env: {
            ...process.env,
            QT_X11_NO_MITSHM: '1',
            XDG_RUNTIME_DIR: '/tmp'
        }
    });

    emulatorProcess.stdout.on('data', (data) => console.log('Dolphin stdout:', data.toString()));
    emulatorProcess.stderr.on('data', (data) => console.error('Dolphin stderr:', data.toString()));

    emulatorProcess.on('close', (code) => {
        console.log(`Emulator stopped with code ${code}`);
        emulatorProcess = null;
        if (streamProcess) streamProcess.kill();
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
        // console.log(`FFMPEG: ${data}`); // Uncomment to debug ffmpeg
    });

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

// Store latest controller state to continuously broadcast if needed, or send on update
const controllerState = {
    buttons: {},
    gyro: { pitch: 0, yaw: 0, roll: 0 },
    accel: { x: 0, y: -1, z: 0 }
};

// Handle WebSocket controller inputs from our custom mobile web UI
io.on('connection', (socket) => {
    console.log('Client connected for controller input via Socket.io');
    
    socket.on('controller-input', (data) => {
        if (data.type === 'gyro') {
            controllerState.gyro = { pitch: data.alpha, yaw: data.beta, roll: data.gamma };
        } else if (data.type === 'button') {
            controllerState.buttons[data.btn] = data.state;
        }

        const dsuPacket = dsu.createControllerPacket(controllerState);
        udpSocket.send(dsuPacket, 26760, '127.0.0.1');
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
