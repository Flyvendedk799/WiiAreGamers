const io = require('socket.io-client');
const WebSocket = require('ws');
const dgram = require('dgram');
const { spawn } = require('child_process');
const { DSUPacker } = require('./dsu-packer');
const fs = require('fs');
const { resolveRomPath } = require('./lib/catalog');

// CONFIGURATION:
const VPS_URL = 'https://wii.mast3kmedia.dk';
const DOLPHIN_PATH = require('path').join(__dirname, 'Dolphin', 'Dolphin-x64', 'Dolphin.exe'); 
const ROM_PATH = require('path').join(__dirname, 'game.wbfs');

console.log('Connecting to WiiAreGamers VPS...');
const socket = io(VPS_URL);

const udpSocket = dgram.createSocket('udp4');
const dsu = new DSUPacker();

const controllerStates = {
    0: { buttons: {}, gyro: { pitch: 0, yaw: 0, roll: 0 }, accel: { x: 0, y: -1, z: 0 }, stick: { x: 0, y: 0 } },
    1: { buttons: {}, gyro: { pitch: 0, yaw: 0, roll: 0 }, accel: { x: 0, y: -1, z: 0 }, stick: { x: 0, y: 0 } },
    2: { buttons: {}, gyro: { pitch: 0, yaw: 0, roll: 0 }, accel: { x: 0, y: -1, z: 0 }, stick: { x: 0, y: 0 } },
    3: { buttons: {}, gyro: { pitch: 0, yaw: 0, roll: 0 }, accel: { x: 0, y: -1, z: 0 }, stick: { x: 0, y: 0 } }
};

let dolphinPort = 26760;
let ffmpegProcess = null;
let dolphinProcess = null;
let videoSocket = null;


const lastSwingAt = [0, 0, 0, 0];
const swingLockUntil = [0, 0, 0, 0];

function executeToss(slot = 0) {
    const state = controllerStates[slot];
    if (!state) return;
    const now = Date.now();
    if (now - lastSwingAt[slot] < 300) return;
    lastSwingAt[slot] = now;
    swingLockUntil[slot] = now + 180;
    // Upward flick only. Wii Sports treats +Y as the serve toss.
    state.accel = { x: 0.1, y: 1.8, z: 0.1 };
    state.gyro = { pitch: -220, yaw: 0, roll: 0 };
    setTimeout(() => {
        if (lastSwingAt[slot] !== now) return;
        state.accel = { x: 0.0, y: -1.0, z: 0.0 };
        state.gyro = { pitch: 0, yaw: 0, roll: 0 };
    }, 140);
}

function executeSwing(slot = 0) {
    const state = controllerStates[slot];
    if (!state) return;
    const now = Date.now();
    if (now - lastSwingAt[slot] < 300) return;
    lastSwingAt[slot] = now;
    swingLockUntil[slot] = now + 280;
    // Horizontal forehand. Y stays at gravity so this is a hit, not another toss.
    const frames = [
        [0,   { x: -2.2, y: -1.0, z: 0.2 }, { pitch: 0, yaw: -90, roll: 40 }],
        [45,  { x: 0.3, y: -1.0, z: 2.6 },  { pitch: -40, yaw: 700, roll: -240 }],
        [95,  { x: 3.8, y: -1.0, z: 1.5 },  { pitch: -70, yaw: 1300, roll: -520 }],
        [160, { x: 0.6, y: -1.0, z: -0.4 }, { pitch: -15, yaw: 200, roll: -60 }],
        [240, { x: 0.0, y: -1.0, z: 0.0 },  { pitch: 0, yaw: 0, roll: 0 }]
    ];
    for (const [t, accel, gyro] of frames) {
        setTimeout(() => {
            state.accel = accel;
            state.gyro = gyro;
        }, t);
    }
}

socket.on('connect', () => {
    console.log('Connected! Registering as Local Host...');
    socket.emit('register-host', 'SUPER_SECRET_KEY');
});

socket.on('start-game', (payload) => {
    const gameId = (payload && payload.gameId) || 'wii-sports';
    console.log('Start Game requested from VPS! Launching Dolphin on your PC...', gameId);
    if (dolphinProcess) {
        console.log('Dolphin is already running.');
        socket.emit('host-start-result', { ok: true, status: 'already_running', gameId });
        return;
    }
    const romPath = resolveRomPath(gameId, __dirname) || (gameId === 'wii-sports' && fs.existsSync(ROM_PATH) ? ROM_PATH : null);
    if (!romPath) {
        console.log('Disc not found for', gameId);
        socket.emit('host-start-result', { ok: false, error: 'rom_missing', gameId });
        return;
    }
    socket.emit('host-start-result', { ok: true, status: 'started_on_host', gameId });
    dolphinProcess = spawn(DOLPHIN_PATH, [
        '-b', '-e', romPath,
        '--config=Dolphin.Input.BackgroundInput=True',
        '--config=Dolphin.Core.BackgroundInput=True',
        '--config=Dolphin.Core.EnableAlternateInputSources=True',
        '--config=Dolphin.Core.WiimoteSource0=1',
        '--config=Dolphin.Core.WiimoteSource1=1',
        '--config=Dolphin.Core.WiimoteSource2=1',
        '--config=Dolphin.Core.WiimoteSource3=1'
    ]);
    dolphinProcess.on('close', () => {
        console.log('Dolphin closed.');
        dolphinProcess = null;
        if (ffmpegProcess) ffmpegProcess.kill();
    });
    const wsUrl = VPS_URL.replace('https', 'wss') + '/host-ingest';
    videoSocket = new WebSocket(wsUrl);
    
    videoSocket.on('open', () => {
        console.log('Video ingest socket connected to VPS. Launching FFmpeg & OBS...');
        const obsProcess = spawn('C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe', [
            '--disable-shutdown-check',
            '--startvirtualcam',
            '--minimize-to-tray'
        ], { cwd: 'C:\\Program Files\\obs-studio\\bin\\64bit' });

        obsProcess.on('close', () => { console.log('OBS closed.'); });

        const ffmpegPath = 'C:\\Users\\tobia\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-9.0.2-full_build\\bin\\ffmpeg.exe';
        ffmpegProcess = spawn(ffmpegPath, [
            '-f', 'dshow', '-i', 'video=OBS Virtual Camera',
            '-vf', 'scale=854:-1', '-f', 'image2pipe',
            '-vcodec', 'mjpeg', '-q:v', '3', '-'
        ]);

        let mjpegBuffer = Buffer.alloc(0);
        ffmpegProcess.stdout.on('data', (data) => {
            mjpegBuffer = Buffer.concat([mjpegBuffer, data]);
            let start = mjpegBuffer.indexOf(Buffer.from([0xFF, 0xD8]));
            let end = mjpegBuffer.indexOf(Buffer.from([0xFF, 0xD9]), start);
            while (start !== -1 && end !== -1) {
                let frame = mjpegBuffer.subarray(start, end + 2);
                mjpegBuffer = Buffer.from(mjpegBuffer.subarray(end + 2));
                if (videoSocket.readyState === WebSocket.OPEN) videoSocket.send(frame);
                start = mjpegBuffer.indexOf(Buffer.from([0xFF, 0xD8]));
                end = mjpegBuffer.indexOf(Buffer.from([0xFF, 0xD9]), start);
            }
        });
    });
});

socket.on('stop-game', () => {
    console.log('Stop Game requested from VPS! Shutting down Dolphin and OBS...');
    if (dolphinProcess) { dolphinProcess.kill(); dolphinProcess = null; }
    if (ffmpegProcess) { ffmpegProcess.kill(); ffmpegProcess = null; }
    if (videoSocket) { videoSocket.close(); videoSocket = null; }
    require('child_process').exec('taskkill /IM obs64.exe', (err) => {
        if (!err) console.log('OBS closed.');
    });
});

socket.on('remote-input', ({ slot, data }) => {
    const state = controllerStates[slot];
    if (!state) return;
    if (data.type === 'button') console.log('[Phone] Player ' + slot + ' pressed: ' + data.btn);
    if (data.type === 'button') {
        state.buttons[data.btn] = data.state;
    } else if (data.type === 'motion') {
        if (data.accel) state.accel = data.accel;
        if (data.gyro) state.gyro = data.gyro;
        if (data.stick) state.stick = data.stick;
    } else if (data.stick) {
        state.stick = data.stick;
    }
});

socket.on('remote-action', (msg) => {
    const slot = msg.slot || 0;
    const state = controllerStates[slot];
    if (!state) return;
    console.log('[Phone] Player ' + slot + ' triggered action: ' + msg.action);
    if (msg.action === 'toss') {
        executeToss(slot);
    } else if (msg.action === 'swing') {
        executeSwing(slot);
    } else if (msg.action === 'press-button') {
        state.buttons[msg.btn] = true;
        setTimeout(() => state.buttons[msg.btn] = false, 500);
    } else if (msg.action === 'press-ab') {
        state.buttons['A'] = true;
        state.buttons['B'] = true;
        setTimeout(() => { state.buttons['A'] = false; state.buttons['B'] = false; }, 500);
    }
});

let dolphinSubscribers = new Map();
const seenListPorts = new Set();

udpSocket.on('error', (err) => { console.error('UDP Error:', err); });
udpSocket.on('message', (msg, rinfo) => {
    if (msg.length >= 20 && msg.toString('ascii', 0, 4) === 'DSUC') {
        const type = msg.readUInt32LE(16);
        const clientKey = rinfo.address + ':' + rinfo.port;
        
        if (type === 0x100000) {
            udpSocket.send(dsu.createVersionResponsePacket(), rinfo.port, rinfo.address);
        } else if (type === 0x100001) {
            if (!seenListPorts.has(clientKey)) {
                seenListPorts.add(clientKey);
                console.log('Dolphin is polling the local DSU server from ' + clientKey);
            }
            for (let s = 0; s < 4; s++) {
                udpSocket.send(dsu.createPortsInfoPacket(s), rinfo.port, rinfo.address);
            }
        } else if (type === 0x100002) {
            // Cemuhook PadDataReq: flags at byte 20, pad id at byte 21.
            // 0 = all pads, 1 = pad id, 2 = MAC.
            let padId = 0;
            const flags = msg.length > 20 ? msg.readUInt8(20) : 0;
            if ((flags & 0x02) && msg.length >= 28) {
                padId = msg.readUInt8(27) - 0x55;
            } else if (msg.length >= 22) {
                padId = msg.readUInt8(21);
            }
            if (padId < 0 || padId > 3) padId = 0;
            if (!dolphinSubscribers.has(clientKey)) {
                console.log('Dolphin DSU Client Connected: ' + clientKey + ' for Pad ' + padId);
            }
            dolphinSubscribers.set(clientKey, { ip: rinfo.address, port: rinfo.port, padId, lastSeen: Date.now() });
            udpSocket.send(dsu.createControllerPacket(controllerStates[padId], padId), rinfo.port, rinfo.address);
        }
    }
});

udpSocket.bind(dolphinPort, '127.0.0.1', () => {
    console.log('DSU Server listening on UDP ' + dolphinPort);
});

setInterval(() => {
    const now = Date.now();
    for (const [key, sub] of dolphinSubscribers.entries()) {
        if (now - sub.lastSeen > 5000) {
            dolphinSubscribers.delete(key);
            console.log('Dolphin disconnected: ' + key);
            continue;
        }
        const packet = dsu.createControllerPacket(controllerStates[sub.padId], sub.padId);
        udpSocket.send(packet, sub.port, sub.ip);
    }
}, 16);

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log('\\nGracefully shutting down bridge...');
    if (dolphinProcess) dolphinProcess.kill();
    if (ffmpegProcess) ffmpegProcess.kill();
    require('child_process').execSync('taskkill /IM obs64.exe');
    process.exit(0);
});

console.log('Bridge is running!');
console.log('Waiting for players to press "Start" on their phones...');
