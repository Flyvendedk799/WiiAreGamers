const fs = require('fs');
const file = 'C:\\Users\\tobia\\WiiAreGamers\\local-bridge.js';
let code = fs.readFileSync(file, 'utf8');

const replacement = `let padId = 0;
            const flags = msg.length > 20 ? msg.readUInt8(20) : 0;
            if (flags === 1 && msg.length >= 28) {
                padId = msg.readUInt8(27) - 0x55;
            } else if (flags === 2 && msg.length >= 22) {
                padId = msg.readUInt8(21);
            }
            if (padId < 0 || padId > 3) padId = 0;`;

// Handle my previous comments
code = code.replace(/const padId = msg\.length > 21 \? msg\.readUInt8\(\d+\) : 0;( \/\/.*)?/, replacement);

fs.writeFileSync(file, code);
console.log('Fixed Pad ID parsing for MAC addresses!');
