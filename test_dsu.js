const dgram = require('dgram');
const { spawn } = require('child_process');
const socket = dgram.createSocket('udp4');

socket.on('message', (msg) => {
    console.log('Received from Dolphin:', msg.toString('hex'));
    require('child_process').execSync('taskkill /F /IM Dolphin.exe');
    process.exit(0);
});

socket.bind(26760, '127.0.0.1', () => {
    console.log('Test Server listening on 26760. Launching Dolphin...');
    spawn('C:\\Users\\tobia\\WiiAreGamers\\Dolphin\\Dolphin-x64\\Dolphin.exe', ['-b', '-e', 'C:\\Users\\tobia\\WiiAreGamers\\game.wbfs']);
});

setTimeout(() => { 
    console.log('Timeout - Dolphin never connected.'); 
    try { require('child_process').execSync('taskkill /F /IM Dolphin.exe'); } catch(e) {}
    process.exit(1); 
}, 5000);
