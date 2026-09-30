const fs = require('fs');
const file = 'C:\\Users\\tobia\\WiiAreGamers\\dsu-packer.js';
let code = fs.readFileSync(file, 'utf8');

const regex = /let b1 = 0;[\s\S]*?payload\.writeUInt8\(b2, 21\);/m;
const replacement = `let b1 = 0;
let b2 = 0;
if (data.buttons?.Share) b1 |= (1 << 0);
if (data.buttons?.L3) b1 |= (1 << 1);
if (data.buttons?.R3) b1 |= (1 << 2);
if (data.buttons?.Options) b1 |= (1 << 3);
if (data.buttons?.UP) b1 |= (1 << 4);
if (data.buttons?.RIGHT) b1 |= (1 << 5);
if (data.buttons?.DOWN) b1 |= (1 << 6);
if (data.buttons?.LEFT) b1 |= (1 << 7);

if (data.buttons?.L2) b2 |= (1 << 0);
if (data.buttons?.R2) b2 |= (1 << 1);
if (data.buttons?.L1) b2 |= (1 << 2);
if (data.buttons?.R1) b2 |= (1 << 3);
if (data.buttons?.Triangle) b2 |= (1 << 4);
if (data.buttons?.A) b2 |= (1 << 5); // Circle
if (data.buttons?.B) b2 |= (1 << 6); // Cross
if (data.buttons?.Square) b2 |= (1 << 7);

payload.writeUInt8(b1, 20);
payload.writeUInt8(b2, 21);`;

code = code.replace(regex, replacement);
fs.writeFileSync(file, code);
console.log('Fixed digital bits!');
