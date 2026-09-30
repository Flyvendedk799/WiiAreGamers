const fs = require('fs');
const file = 'C:\\Users\\tobia\\WiiAreGamers\\local-bridge.js';
let code = fs.readFileSync(file, 'utf8');

const startIdx = code.indexOf("udpSocket.on('message'");
const endIdx = code.indexOf('setInterval(() => {');

const newHandler = `udpSocket.on('message', (msg, rinfo) => {
    if (msg.length >= 20 && msg.toString('ascii', 0, 4) === 'DSUC') {
        const type = msg.readUInt32LE(16);
        const clientKey = rinfo.address + ':' + rinfo.port;
        let found = false;
        for (const c of connectedClients) {
            if (c.ip === rinfo.address && c.port === rinfo.port) found = true;
        }
        if (!found) {
            connectedClients.add({ ip: rinfo.address, port: rinfo.port });
            console.log('Dolphin DSU Client Connected: ' + clientKey);
        }
        
        if (type === 0x100000) {
            udpSocket.send(dsu.createVersionResponsePacket(), rinfo.port, rinfo.address);
        } else if (type === 0x100001) {
            for (let s = 0; s < 4; s++) {
                udpSocket.send(dsu.createPortsInfoPacket(s), rinfo.port, rinfo.address);
            }
        } else if (type === 0x100002) {
            // Dolphin subscribing
        }
    }
});

udpSocket.bind(dolphinPort, '127.0.0.1', () => {
    console.log('DSU Server listening on UDP ' + dolphinPort);
});

`;

if (startIdx !== -1 && endIdx !== -1) {
    code = code.substring(0, startIdx) + newHandler + code.substring(endIdx);
    fs.writeFileSync(file, code);
    console.log('Handler replaced successfully!');
} else {
    console.log('Could not find indices! startIdx:', startIdx, 'endIdx:', endIdx);
}
