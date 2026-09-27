const crc32 = require('crc-32');

class DSUPacker {
    constructor() {
        this.serverId = Math.floor(Math.random() * 0xFFFFFFFF);
        this.packetId = 0;
    }

    createHeader(payloadLength) {
        const buffer = Buffer.alloc(16);
        buffer.write('DSUC', 0); // Magic
        buffer.writeUInt16LE(1001, 4); // Protocol
        buffer.writeUInt16LE(payloadLength, 6);
        buffer.writeUInt32LE(0, 8); // CRC (0 for now)
        buffer.writeUInt32LE(this.serverId, 12);
        return buffer;
    }

    createPortsInfoPacket() {
        const payloadLength = 16; 
        const header = this.createHeader(payloadLength);
        const payload = Buffer.alloc(payloadLength);
        
        payload.writeUInt32LE(0x100000, 0); // Message type: Info
        payload.writeUInt8(0, 4); // Slot 0
        payload.writeUInt8(2, 5); // Connected
        payload.writeUInt8(2, 6); // Full Gyro
        payload.writeUInt8(1, 7); // USB
        // MAC (00:11:22:33:44:55)
        payload.writeUInt8(0x00, 8); payload.writeUInt8(0x11, 9); payload.writeUInt8(0x22, 10);
        payload.writeUInt8(0x33, 11); payload.writeUInt8(0x44, 12); payload.writeUInt8(0x55, 13);
        payload.writeUInt8(5, 14); // Battery Full
        payload.writeUInt8(0, 15); // Padding (Active state is not in ports info, wait, let me check spec)

        const packet = Buffer.concat([header, payload]);
        packet.writeUInt32LE(crc32.buf(packet) >>> 0, 8);
        return packet;
    }

    createControllerPacket(data, slot = 0) {
        this.packetId++;
        const payloadLength = 84;
        const header = this.createHeader(payloadLength);
        const payload = Buffer.alloc(payloadLength);

        payload.writeUInt32LE(0x100002, 0); // Type: Data
        payload.writeUInt8(slot, 4);
        payload.writeUInt8(2, 5);
        payload.writeUInt8(2, 6);
        payload.writeUInt8(1, 7);
        
        payload.writeUInt8(0x00, 8); payload.writeUInt8(0x11, 9); payload.writeUInt8(0x22, 10);
        payload.writeUInt8(0x33, 11); payload.writeUInt8(0x44, 12); payload.writeUInt8(0x55 + slot, 13);

        payload.writeUInt8(5, 14); // Battery
        payload.writeUInt8(1, 15); // State (Active)
        payload.writeUInt32LE(this.packetId, 16);

        // Buttons (20)
        let buttonsMask = 0;
        if (data.buttons?.LEFT) buttonsMask |= (1 << 0);
        if (data.buttons?.DOWN) buttonsMask |= (1 << 1);
        if (data.buttons?.RIGHT) buttonsMask |= (1 << 2);
        if (data.buttons?.UP) buttonsMask |= (1 << 3);
        if (data.buttons?.A) buttonsMask |= (1 << 12);
        if (data.buttons?.B) buttonsMask |= (1 << 13);
        payload.writeUInt32LE(buttonsMask, 20);

        payload.writeUInt8(0x80, 24); // LX
        payload.writeUInt8(0x80, 25); // LY
        payload.writeUInt8(0x80, 26); // RX
        payload.writeUInt8(0x80, 27); // RY

        payload.writeUInt8(data.buttons?.LEFT ? 0xFF : 0, 28);
        payload.writeUInt8(data.buttons?.DOWN ? 0xFF : 0, 29);
        payload.writeUInt8(data.buttons?.RIGHT ? 0xFF : 0, 30);
        payload.writeUInt8(data.buttons?.UP ? 0xFF : 0, 31);
        payload.writeUInt8(0, 32); // Y
        payload.writeUInt8(data.buttons?.B ? 0xFF : 0, 33); // B
        payload.writeUInt8(data.buttons?.A ? 0xFF : 0, 34); // A
        payload.writeUInt8(0, 35); // X
        // R1 L1 R2 L2 are 36-39 (default 0)

        const hrtime = process.hrtime();
        const micros = hrtime[0] * 1000000 + Math.round(hrtime[1] / 1000);
        payload.writeBigUInt64LE(BigInt(micros), 52);

        payload.writeFloatLE(data.accel?.x || 0.0, 60);
        payload.writeFloatLE(data.accel?.y || -1.0, 64);
        payload.writeFloatLE(data.accel?.z || 0.0, 68);

        payload.writeFloatLE(data.gyro?.pitch || 0.0, 72);
        payload.writeFloatLE(data.gyro?.yaw || 0.0, 76);
        payload.writeFloatLE(data.gyro?.roll || 0.0, 80);

        const packet = Buffer.concat([header, payload]);
        packet.writeUInt32LE(crc32.buf(packet) >>> 0, 8);
        return packet;
    }
}
module.exports = { DSUPacker };
