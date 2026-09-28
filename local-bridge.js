const io = require('socket.io-client');
const WebSocket = require('ws');
const dgram = require('dgram');
const { spawn } = require('child_process');
const { DSUPacker } = require('./dsu-packer');

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
const connectedClients = new Set();

function executeSwing(slot = 0) {
    const state = controllerStates[slot];
    if (!state) return;
    state.accel = { x: -1.0, y: 0.0, z: -1.5 };
    state.gyro = { pitch: 100, yaw: -100, roll: 0 };
    setTimeout(() => {
        state.accel = { x: 5.0, y: 1.0, z: 4.0 };
        state.gyro = { pitch: -400, yaw: 600, roll: -600 };
    }, 30);
    setTimeout(() => {
        state.accel = { x: 1.2, y: -0.8, z: 0.6 };
        state.gyro = { pitch: -50, yaw: 100, roll: -100 };
    }, 120);
    setTimeout(() => {
        state.accel = { x: 0.0, y: -1.0, z: 0.0 };
        state.gyro = { pitch: 0, yaw: 0, roll: 0 };
    }, 250);
}

socket.on('connect', () => {
    console.log('Connected! Registering as Local Host...');
    socket.emit('register-host', 'SUPER_SECRET_KEY');
});

socket.on('start-game', () => {
    console.log('Start Game requested from VPS! Launching Dolphin on your PC...');
    if (dolphinProcess) {
        console.log('Dolphin is already running.');
        return;
    }
    dolphinProcess = spawn(DOLPHIN_PATH, ['-b', '-e', ROM_PATH]);
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
    if (msg.action === 'swing') {
        executeSwing(slot);
    } else if (msg.action === 'press-button') {
        state.buttons[msg.btn] = true;
        setTimeout(() => state.buttons[msg.btn] = false, 150);
    } else if (msg.action === 'press-ab') {
        state.buttons['A'] = true;
        state.buttons['B'] = true;
        setTimeout(() => { state.buttons['A'] = false; state.buttons['B'] = false; }, 150);
    }
});

udpSocket.on('error', (err) => { console.error('UDP Error:', err); });
udpSocket.on('message', (msg, rinfo) => {
    if (msg.length >= 20 && msg.toString('utf8', 0, 4) === 'DSUC') {
        const type = msg.readUInt32LE(16);
        let found = false;
        for (const c of connectedClients) {
            if (c.ip === rinfo.address && c.port === rinfo.port) found = true;
        }
        if (!found) {
            connectedClients.add({ ip: rinfo.address, port: rinfo.port });
            console.log('Dolphin DSU Client Connected:', rinfo.address + ':' + rinfo.port);
        }
        if (type === 0x100000) {
            udpSocket.send(dsu.createVersionResponsePacket(), rinfo.port, rinfo.address);
        } else if (type === 0x100001) {
            udpSocket.send(dsu.createPortsInfoPacket(0), rinfo.port, rinfo.address);
            udpSocket.send(dsu.createPortsInfoPacket(1), rinfo.port, rinfo.address);
            udpSocket.send(dsu.createPortsInfoPacket(2), rinfo.port, rinfo.address);
            udpSocket.send(dsu.createPortsInfoPacket(3), rinfo.port, rinfo.address);
        }
    }
});

udpSocket.bind(dolphinPort, '127.0.0.1', () => {
    console.log('DSU Server listening on UDP ' + dolphinPort);
});

setInterval(() => {
    for (let slot = 0; slot < 4; slot++) {
        const state = controllerStates[slot];
        const packet = dsu.createControllerPacket(state, slot);
        for (const client of connectedClients) {
            udpSocket.send(packet, client.port, client.ip);
        }
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
