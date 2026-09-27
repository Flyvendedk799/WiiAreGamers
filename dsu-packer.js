const crc32 = require('crc-32');

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

        // Digital button bits
        let b1 = 0;
        let b2 = 0;
        if (data.buttons?.LEFT) b2 |= (1 << 7);
        if (data.buttons?.DOWN) b2 |= (1 << 6);
        if (data.buttons?.RIGHT) b2 |= (1 << 5);
        if (data.buttons?.UP) b2 |= (1 << 4);
        if (data.buttons?.B) b2 |= (1 << 0); // Cross
        if (data.buttons?.A) b2 |= (1 << 1); // Circle
        payload.writeUInt8(b1, 20); // Share, L3, R3, Options
        payload.writeUInt8(b2, 21); // Dpad, Square, Cross, Circle, Triangle
        payload.writeUInt8(0, 22);  // PS
        payload.writeUInt8(0, 23);  // Touch Button

        // Sticks (centered at 128 = 0x80)
        const lx = data.stick?.x !== undefined ? Math.max(0, Math.min(255, Math.round(128 + data.stick.x * 127))) : 128;
        const ly = data.stick?.y !== undefined ? Math.max(0, Math.min(255, Math.round(128 - data.stick.y * 127))) : 128;
        payload.writeUInt8(lx, 24); // LX
        payload.writeUInt8(ly, 25); // LY
        payload.writeUInt8(128, 26); // RX
        payload.writeUInt8(128, 27); // RY

        // Analog button values (0 or 255)
        payload.writeUInt8(data.buttons?.LEFT ? 0xFF : 0, 28);
        payload.writeUInt8(data.buttons?.DOWN ? 0xFF : 0, 29);
        payload.writeUInt8(data.buttons?.RIGHT ? 0xFF : 0, 30);
        payload.writeUInt8(data.buttons?.UP ? 0xFF : 0, 31);
        payload.writeUInt8(0, 32); // Square
        payload.writeUInt8(data.buttons?.B ? 0xFF : 0, 33); // Cross
        payload.writeUInt8(data.buttons?.A ? 0xFF : 0, 34); // Circle
        payload.writeUInt8(0, 35); // Triangle
        payload.writeUInt8(0, 36); // R1
        payload.writeUInt8(0, 37); // L1
        payload.writeUInt8(0, 38); // R2
        payload.writeUInt8(0, 39); // L2

        // touch1 (40..45) & touch2 (46..51) default to 0

        const hrtime = process.hrtime();
        const micros = hrtime[0] * 1000000 + Math.round(hrtime[1] / 1000);
        payload.writeBigUInt64LE(BigInt(micros), 52);

        // Accelerometer in Gs
        payload.writeFloatLE(data.accel?.x || 0.0, 60);
        payload.writeFloatLE(data.accel?.y || -1.0, 64);
        payload.writeFloatLE(data.accel?.z || 0.0, 68);

        // Gyro in deg/s
        payload.writeFloatLE(data.gyro?.pitch || 0.0, 72);
        payload.writeFloatLE(data.gyro?.yaw || 0.0, 76);
        payload.writeFloatLE(data.gyro?.roll || 0.0, 80);

        const packet = Buffer.concat([header, payload]);
        packet.writeUInt32LE(crc32.buf(packet) >>> 0, 8);
        return packet;
    }
}
module.exports = { DSUPacker };
