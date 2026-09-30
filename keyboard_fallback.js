const fs = require('fs');
let ini = fs.readFileSync('C:\\Users\\tobia\\WiiAreGamers\\Dolphin\\Dolphin-x64\\User\\Config\\WiimoteNew.ini', 'utf8');

ini = ini.replace(/Buttons\/A = (.*)/, 'Buttons/A = $1 | `DInput/0/Keyboard Mouse:Space`');
ini = ini.replace(/Buttons\/B = (.*)/, 'Buttons/B = $1 | `DInput/0/Keyboard Mouse:Space`');
ini = ini.replace(/Shake\/X = (.*)/, 'Shake/X = $1 | `DInput/0/Keyboard Mouse:Return`');
ini = ini.replace(/Shake\/Y = (.*)/, 'Shake/Y = $1 | `DInput/0/Keyboard Mouse:Return`');
ini = ini.replace(/Shake\/Z = (.*)/, 'Shake/Z = $1 | `DInput/0/Keyboard Mouse:Return`');

fs.writeFileSync('C:\\Users\\tobia\\WiiAreGamers\\Dolphin\\Dolphin-x64\\User\\Config\\WiimoteNew.ini', ini);
console.log('Added Keyboard fallbacks to WiimoteNew.ini');
