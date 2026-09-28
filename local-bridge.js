const io = require('socket.io-client');
const WebSocket = require('ws');
const dgram = require('dgram');
const { spawn } = require('child_process');
const { DSUPacker } = require('./dsu-packer');

// CONFIGURATION:
const VPS_URL = 'https://wii.mast3kmedia.dk';
const DOLPHIN_PATH = 'C:\\Program Files\\Dolphin\\Dolphin.exe'; 
const ROM_PATH = 'game.wbfs';

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

function executeSwing(slot = 0) {
    const state = controllerStates[slot];
    if (!state) return;
    
    // 1. Windup / Backswing
    state.accel = { x: -1.0, y: 0.0, z: -1.5 };
    state.gyro = { pitch: 100, yaw: -100, roll: 0 };
    
    // 2. Powerful forward strike
    setTimeout(() => {
        state.accel = { x: 5.0, y: 1.0, z: 4.0 };
        state.gyro = { pitch: -400, yaw: 600, roll: -600 };
    }, 30);

    // 3. Follow-through
    setTimeout(() => {
        state.accel = { x: 1.2, y: -0.8, z: 0.6 };
        state.gyro = { pitch: -50, yaw: 100, roll: -100 };
    }, 120);

    // 4. Return to rest
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

    // 1. Launch Dolphin automatically (it will open a window on your PC)
    dolphinProcess = spawn(DOLPHIN_PATH, ['-b', '-e', ROM_PATH]);
    dolphinProcess.on('close', () => {
        console.log('Dolphin closed.');
        dolphinProcess = null;
        if (ffmpegProcess) ffmpegProcess.kill();
    });

    // 2. Open WebSocket to VPS for video ingest
    const wsUrl = VPS_URL.replace('https', 'wss') + '/host-ingest';
    videoSocket = new WebSocket(wsUrl);
    
    videoSocket.on('open', () => {
        console.log('Video ingest socket connected to VPS. Launching FFmpeg...');
        
        // 3. Launch FFmpeg to secretly screen-record the Dolphin window and pipe it to WebSocket
        ffmpegProcess = spawn('ffmpeg', [
            '-f', 'gdigrab',
            '-framerate', '30',
            '-i', 'title=Dolphin', // Captures any window starting with Dolphin
            '-f', 'image2pipe',
            '-vcodec', 'mjpeg',
            '-q:v', '3', // Quality setting (lower is better, 3 is good balance)
            '-' // Output to stdout
        ]);

        let mjpegBuffer = Buffer.alloc(0);
        
        ffmpegProcess.stdout.on('data', (data) => {
            mjpegBuffer = Buffer.concat([mjpegBuffer, data]);
            let start = mjpegBuffer.indexOf(Buffer.from([0xFF, 0xD8]));
            let end = mjpegBuffer.indexOf(Buffer.from([0xFF, 0xD9]), start);
            
            while (start !== -1 && end !== -1) {
                let frame = mjpegBuffer.subarray(start, end + 2);
                mjpegBuffer = Buffer.from(mjpegBuffer.subarray(end + 2));
                
                if (videoSocket.readyState === WebSocket.OPEN) {
                    videoSocket.send(frame);
                }
                
                start = mjpegBuffer.indexOf(Buffer.from([0xFF, 0xD8]));
                end = mjpegBuffer.indexOf(Buffer.from([0xFF, 0xD9]), start);
            }
        });

        ffmpegProcess.stderr.on('data', (data) => {
            // Uncomment to debug ffmpeg issues
            // console.error(`FFMPEG: ${data}`);
        });
    });
});

socket.on('remote-input', ({ slot, data }) => {
    const state = controllerStates[slot];
    if (!state) return;
    
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

    if (msg.action === 'swing') {
        executeSwing(slot);
    } else if (msg.action === 'press-button') {
        state.buttons[msg.btn] = true;
        setTimeout(() => state.buttons[msg.btn] = false, 150);
    } else if (msg.action === 'press-ab') {
        state.buttons['A'] = true;
        state.buttons['B'] = true;
        setTimeout(() => {
            state.buttons['A'] = false;
            state.buttons['B'] = false;
        }, 150);
    } else if (msg.action === 'set-stick' || msg.action === 'aim') {
        state.stick = { x: msg.x, y: msg.y };
    }
});

// Broadcast continuous controller state at 60Hz to local Dolphin
setInterval(() => {
    for (let slot = 0; slot < 4; slot++) {
        const state = controllerStates[slot];
        const packet = dsu.createControllerPacket(state, slot);
        udpSocket.send(packet, dolphinPort, '127.0.0.1');
    }
}, 16);

console.log('Bridge is running!');
console.log('Waiting for players to press "Start" on their phones...');
