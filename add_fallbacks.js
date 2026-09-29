const fs = require('fs');
const file = 'C:\\Users\\tobia\\WiiAreGamers\\Dolphin\\Dolphin-x64\\User\\Config\\WiimoteNew.ini';
let ini = fs.readFileSync(file, 'utf8');

ini = ini.replace(/Buttons\/A = `DSUClient\/[0-3]\/DSU:Circle`/g, (match) => {
    return match + ' | `DInput/0/Keyboard Mouse:Space`';
});
ini = ini.replace(/Buttons\/B = `DSUClient\/[0-3]\/DSU:Cross`/g, (match) => {
    return match + ' | `DInput/0/Keyboard Mouse:X`';
});

fs.writeFileSync(file, ini);
console.log('Added keyboard fallbacks to WiimoteNew.ini');
