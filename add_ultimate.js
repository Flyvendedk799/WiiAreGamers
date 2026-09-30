const fs = require('fs');
const file = 'C:\\Users\\tobia\\WiiAreGamers\\Dolphin\\Dolphin-x64\\User\\Config\\WiimoteNew.ini';
let ini = fs.readFileSync(file, 'utf8');

const devices = [
    'DSUClient/0/DSU',
    'DSUClient/0/127.0.0.1',
    'DSUClient/0/127.0.0.1:26760'
];

function buildMap(button) {
    let str = `\`DInput/0/Keyboard Mouse:${button === 'Circle' ? 'Space' : 'X'}\``;
    for (let d of devices) {
        str += ` | \`${d}:${button}\``;
    }
    return str;
}

ini = ini.replace(/Buttons\/A = .*/, 'Buttons/A = ' + buildMap('Circle'));
ini = ini.replace(/Buttons\/B = .*/, 'Buttons/B = ' + buildMap('Cross'));

fs.writeFileSync(file, ini);
console.log('Applied ultimate fallback string to WiimoteNew.ini (Length: ' + buildMap('Circle').length + ')');
