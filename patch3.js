const fs = require('fs');
const file = 'C:\\Users\\tobia\\WiiAreGamers\\local-bridge.js';
let code = fs.readFileSync(file, 'utf8');

const replacement = `let dolphinSubscribers = new Map();

udpSocket.on('error', (err) => { console.error('UDP Error:', err); });
udpSocket.on('message', (msg, rinfo) => {
    if (msg.length >= 20 && msg.toString('ascii', 0, 4) === 'DSUC') {
        const type = msg.readUInt32LE(16);
        const clientKey = rinfo.address + ':' + rinfo.port;
        
        if (type === 0x100000) {
            udpSocket.send(dsu.createVersionResponsePacket(), rinfo.port, rinfo.address);
        } else if (type === 0x100001) {
            for (let s = 0; s < 4; s++) {
                udpSocket.send(dsu.createPortsInfoPacket(s), rinfo.port, rinfo.address);
            }
        } else if (type === 0x100002) {
            const padId = msg.length > 21 ? msg.readUInt8(20) : 0; // Pad ID is at byte 20!
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
`;

const startIdx = code.indexOf('udpSocket.on(\'error\'');
const endIdx = code.indexOf('process.on(\'SIGINT\'');

if (startIdx !== -1 && endIdx !== -1) {
    code = code.substring(0, startIdx) + replacement + '\n// Handle Ctrl+C gracefully\n' + code.substring(endIdx);
    code = code.replace('const connectedClients = new Set();', '');
    fs.writeFileSync(file, code);
    console.log('Successfully patched bridge!');
} else {
    console.log('Failed to patch bridge: indices not found', startIdx, endIdx);
}
