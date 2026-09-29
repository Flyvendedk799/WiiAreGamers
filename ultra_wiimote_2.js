const fs = require('fs');

const devices = [
    'DSUClient/0/DSU', 
    'DSUClient/0/DSUClient', 
    'DSUClient/0/127.0.0.1', 
    'DSUClient/0/127.0.0.1:26760',
    'DSUClient/0/00:11:22:33:44:55',
    'DSUClient/0/00-11-22-33-44-55',
    'Alternate Input/0/DSU',
    'Alternate Input/0/DSUClient',
    'Alternate Input/0/127.0.0.1',
    'Alternate Input/0/00:11:22:33:44:55',
    'Alternate Input/0/00-11-22-33-44-55'
];

function map(input) {
    return devices.map(d => `\`${d}:${input}\``).join(' | ');
}

const ini = `[Wiimote1]
Source = 1
Device = DSUClient/0/00:11:22:33:44:55
Buttons/A = ${map('Circle')}
Buttons/B = ${map('Cross')}
Buttons/1 = ${map('Triangle')}
Buttons/2 = ${map('Square')}
Buttons/- = ${map('Share')}
Buttons/+ = ${map('Options')}
Buttons/Home = ${map('PS')}
D-Pad/Up = ${map('Pad N')}
D-Pad/Down = ${map('Pad S')}
D-Pad/Left = ${map('Pad W')}
D-Pad/Right = ${map('Pad E')}
IR/Up = ${map('Left Y-')}
IR/Down = ${map('Left Y+')}
IR/Left = ${map('Left X-')}
IR/Right = ${map('Left X+')}
IR/Total Pitch = 27.
IR/Total Yaw = 33.
Shake/X = ${map('R1')}
Shake/Y = ${map('R1')}
Shake/Z = ${map('R1')}
IMUAccelerometer/Up = ${map('Accel Up')}
IMUAccelerometer/Down = ${map('Accel Down')}
IMUAccelerometer/Left = ${map('Accel Left')}
IMUAccelerometer/Right = ${map('Accel Right')}
IMUAccelerometer/Forward = ${map('Accel Forward')}
IMUAccelerometer/Backward = ${map('Accel Backward')}
IMUGyroscope/Pitch Up = ${map('Gyro Pitch Up')}
IMUGyroscope/Pitch Down = ${map('Gyro Pitch Down')}
IMUGyroscope/Roll Left = ${map('Gyro Roll Left')}
IMUGyroscope/Roll Right = ${map('Gyro Roll Right')}
IMUGyroscope/Yaw Left = ${map('Gyro Yaw Left')}
IMUGyroscope/Yaw Right = ${map('Gyro Yaw Right')}
`;

fs.writeFileSync('C:\\Users\\tobia\\WiiAreGamers\\Dolphin\\Dolphin-x64\\User\\Config\\WiimoteNew.ini', ini);
console.log('Written mega-robust WiimoteNew.ini!');
