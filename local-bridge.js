const io = require('socket.io-client');
const dgram = require('dgram');
const { DSUPacker } = require('./dsu-packer');

console.log('Connecting to WiiAreGamers VPS...');
const socket = io('https://wii.mast3kmedia.dk');

const udpSocket = dgram.createSocket('udp4');
const dsu = new DSUPacker();

const controllerStates = {
    0: { buttons: {}, gyro: { pitch: 0, yaw: 0, roll: 0 }, accel: { x: 0, y: -1, z: 0 }, stick: { x: 0, y: 0 } },
    1: { buttons: {}, gyro: { pitch: 0, yaw: 0, roll: 0 }, accel: { x: 0, y: -1, z: 0 }, stick: { x: 0, y: 0 } },
    2: { buttons: {}, gyro: { pitch: 0, yaw: 0, roll: 0 }, accel: { x: 0, y: -1, z: 0 }, stick: { x: 0, y: 0 } },
    3: { buttons: {}, gyro: { pitch: 0, yaw: 0, roll: 0 }, accel: { x: 0, y: -1, z: 0 }, stick: { x: 0, y: 0 } }
};

let dolphinPort = 26760;

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

    // 4. Return to rest (Gravity)
    setTimeout(() => {
        state.accel = { x: 0.0, y: -1.0, z: 0.0 };
        state.gyro = { pitch: 0, yaw: 0, roll: 0 };
    }, 250);
}

socket.on('connect', () => {
    console.log('Connected! Registering as Local Host...');
    socket.emit('register-host', 'SUPER_SECRET_KEY');
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
console.log('Open Dolphin.exe locally, enable DSU Server on port 26760, and load Wii Sports!');
