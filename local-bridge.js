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
const connectedClients = new Set();

udpSocket.on('error', (err) => {
    console.error('UDP Error:', err);
});

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

        if (type === 0x100000) { // Version request
            udpSocket.send(dsu.createVersionResponsePacket(), rinfo.port, rinfo.address);
        } else if (type === 0x100001) { // Ports request
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

// Broadcast continuous controller state at 60Hz to all connected DSU Clients
setInterval(() => {
    for (let slot = 0; slot < 4; slot++) {
        const state = controllerStates[slot];
        const packet = dsu.createControllerPacket(state, slot);
        for (const client of connectedClients) {
            udpSocket.send(packet, client.port, client.ip);
        }
    }
}, 16);

console.log('Bridge is running!');
console.log('Waiting for players to press "Start" on their phones...');
