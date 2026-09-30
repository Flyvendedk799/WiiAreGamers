const crc32 = require('crc-32');

function normalizeButtons(raw = {}) {
    const buttons = { ...raw };
    if (buttons['1']) buttons.Triangle = true;
    if (buttons['2']) buttons.Square = true;
    if (buttons['-'] || buttons.Minus) buttons.Share = true;
    if (buttons['+'] || buttons.Plus) buttons.Options = true;
    if (buttons.Home) buttons.PS = true;
    if (buttons.AB) {
        buttons.A = true;
        buttons.B = true;
    }
    return buttons;
}

class DSUPacker {
    constructor() {
        this.serverId = Math.floor(Math.random() * 0xFFFFFFFF);
        this.packetId = 0;
    }

    createHeader(payloadLength) {
        const buffer = Buffer.alloc(16);
        buffer.write('DSUS', 0); // Server magic is 'DSUS'
        buffer.writeUInt16LE(1001, 4); // Protocol version
        buffer.writeUInt16LE(payloadLength, 6);
        buffer.writeUInt32LE(0, 8); // CRC placeholder
        buffer.writeUInt32LE(this.serverId, 12);
        return buffer;
    }

    createVersionResponsePacket() {
        const payloadLength = 8;
        const header = this.createHeader(payloadLength);
        const payload = Buffer.alloc(payloadLength);
        payload.writeUInt32LE(0x100000, 0); // Type: VersionResponse
        payload.writeUInt16LE(1001, 4);     // Max protocol version
        payload.writeUInt16LE(0, 6);        // Padding

        const packet = Buffer.concat([header, payload]);
        packet.writeUInt32LE(crc32.buf(packet) >>> 0, 8);
        return packet;
    }

    createPortsInfoPacket(slot = 0) {
        const payloadLength = 16;
        const header = this.createHeader(payloadLength);
        const payload = Buffer.alloc(payloadLength);
        
        payload.writeUInt32LE(0x100001, 0); // Message type: PortInfo (0x100001)
        payload.writeUInt8(slot, 4);        // Pad ID
        payload.writeUInt8(2, 5);           // State: Connected (0x02)
        payload.writeUInt8(2, 6);           // Model: FullGyro (0x02)
        payload.writeUInt8(1, 7);           // Connection: Usb (0x01)
        
        // Pad MAC Address (00:11:22:33:44:55 + slot)
        payload.writeUInt8(0x00, 8);
        payload.writeUInt8(0x11, 9);
        payload.writeUInt8(0x22, 10);
        payload.writeUInt8(0x33, 11);
        payload.writeUInt8(0x44, 12);
        payload.writeUInt8((0x55 + slot) & 0xFF, 13);
        
        payload.writeUInt8(5, 14); // Battery: Full (0x05)
        payload.writeUInt8(0, 15); // Padding

        const packet = Buffer.concat([header, payload]);
        packet.writeUInt32LE(crc32.buf(packet) >>> 0, 8);
        return packet;
    }

    createControllerPacket(data = {}, slot = 0) {
        this.packetId++;
        const payloadLength = 84;
        const header = this.createHeader(payloadLength);
        const payload = Buffer.alloc(payloadLength);

        payload.writeUInt32LE(0x100002, 0); // Type: PadDataResponse (0x100002)
        payload.writeUInt8(slot, 4);
        payload.writeUInt8(2, 5); // Connected
        payload.writeUInt8(2, 6); // FullGyro
        payload.writeUInt8(1, 7); // Usb
        
        payload.writeUInt8(0x00, 8);
        payload.writeUInt8(0x11, 9);
        payload.writeUInt8(0x22, 10);
        payload.writeUInt8(0x33, 11);
        payload.writeUInt8(0x44, 12);
        payload.writeUInt8((0x55 + slot) & 0xFF, 13);

        payload.writeUInt8(5, 14); // Battery Full
        payload.writeUInt8(1, 15); // Active state
        payload.writeUInt32LE(this.packetId, 16);

        // Phone UI names (A/B/1/2/+/-/AB) and cemuhook names share one mask.
        // Dolphin reads face buttons and the D-pad from the analog bytes below,
        // and Share/Options/PS from these digital bits.
        const buttons = normalizeButtons(data.buttons);

        let b1 = 0;
        let b2 = 0;
        if (buttons.Share) b1 |= (1 << 0);
        if (buttons.L3) b1 |= (1 << 1);
        if (buttons.R3) b1 |= (1 << 2);
        if (buttons.Options) b1 |= (1 << 3);
        if (buttons.UP) b1 |= (1 << 4);
        if (buttons.RIGHT) b1 |= (1 << 5);
        if (buttons.DOWN) b1 |= (1 << 6);
        if (buttons.LEFT) b1 |= (1 << 7);

        if (buttons.L2) b2 |= (1 << 0);
        if (buttons.R2) b2 |= (1 << 1);
        if (buttons.L1) b2 |= (1 << 2);
        if (buttons.R1) b2 |= (1 << 3);
        if (buttons.Triangle) b2 |= (1 << 4);
        if (buttons.A) b2 |= (1 << 5); // Circle
        if (buttons.B) b2 |= (1 << 6); // Cross
        if (buttons.Square) b2 |= (1 << 7);

        payload.writeUInt8(b1, 20);
        payload.writeUInt8(b2, 21);
        payload.writeUInt8(buttons.PS ? 1 : 0, 22);
        payload.writeUInt8(0, 23); // Touch Button

        // Sticks (centered at 128 = 0x80)
        const lx = data.stick?.x !== undefined ? Math.max(0, Math.min(255, Math.round(128 + data.stick.x * 127))) : 128;
        const ly = data.stick?.y !== undefined ? Math.max(0, Math.min(255, Math.round(128 - data.stick.y * 127))) : 128;
        payload.writeUInt8(lx, 24); // LX
        payload.writeUInt8(ly, 25); // LY
        payload.writeUInt8(128, 26); // RX
        payload.writeUInt8(128, 27); // RY

        const pressed = (on) => (on ? 0xFF : 0);
        payload.writeUInt8(pressed(buttons.LEFT), 28);
        payload.writeUInt8(pressed(buttons.DOWN), 29);
        payload.writeUInt8(pressed(buttons.RIGHT), 30);
        payload.writeUInt8(pressed(buttons.UP), 31);
        payload.writeUInt8(pressed(buttons.Square), 32);
        payload.writeUInt8(pressed(buttons.B), 33); // Cross
        payload.writeUInt8(pressed(buttons.A), 34); // Circle
        payload.writeUInt8(pressed(buttons.Triangle), 35);
        payload.writeUInt8(pressed(buttons.R1), 36);
        payload.writeUInt8(pressed(buttons.L1), 37);
        payload.writeUInt8(pressed(buttons.R2), 38);
        payload.writeUInt8(pressed(buttons.L2), 39);

        // touch1 (40..45) & touch2 (46..51) default to 0

        const hrtime = process.hrtime();
        const micros = hrtime[0] * 1000000 + Math.round(hrtime[1] / 1000);
        payload.writeBigUInt64LE(BigInt(micros), 52);

        // Accelerometer in Gs
        payload.writeFloatLE(data.accel?.x ?? 0.0, 60);
        payload.writeFloatLE(data.accel?.y ?? -1.0, 64);
        payload.writeFloatLE(data.accel?.z ?? 0.0, 68);

        // Gyro in deg/s
        payload.writeFloatLE(data.gyro?.pitch ?? 0.0, 72);
        payload.writeFloatLE(data.gyro?.yaw ?? 0.0, 76);
        payload.writeFloatLE(data.gyro?.roll ?? 0.0, 80);

        const packet = Buffer.concat([header, payload]);
        packet.writeUInt32LE(crc32.buf(packet) >>> 0, 8);
        return packet;
    }
}
module.exports = { DSUPacker };
