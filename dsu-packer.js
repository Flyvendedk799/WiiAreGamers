const crc32 = require('crc-32');

class DSUPacker {
    constructor() {
        this.serverId = Math.floor(Math.random() * 0xFFFFFFFF);
        this.packetId = 0;
    }

    createControllerPacket(data) {
        this.packetId++;
        const buffer = Buffer.alloc(100);

        // --- HEADER (16 bytes) ---
        buffer.write('DSUC', 0); // Magic string
        buffer.writeUInt16LE(1001, 4); // Protocol version
        buffer.writeUInt16LE(84, 6); // Payload length (100 - 16 = 84 bytes)
        buffer.writeUInt32LE(0, 8); // CRC32 (placeholder)
        buffer.writeUInt32LE(this.serverId, 12); // Server ID

        // --- PAYLOAD (84 bytes) ---
        buffer.writeUInt32LE(0x100002, 16); // Message type: Controller Data
        buffer.writeUInt8(0, 20); // Slot
        buffer.writeUInt8(2, 21); // Slot State: Connected
        buffer.writeUInt8(2, 22); // Device Model: Full Gyro
        buffer.writeUInt8(1, 23); // Connection Type: USB
        
        // MAC Address (6 bytes)
        buffer.writeUInt8(0x00, 24);
        buffer.writeUInt8(0x11, 25);
        buffer.writeUInt8(0x22, 26);
        buffer.writeUInt8(0x33, 27);
        buffer.writeUInt8(0x44, 28);
        buffer.writeUInt8(0x55, 29);

        buffer.writeUInt8(5, 30); // Battery status: Full
        buffer.writeUInt8(1, 31); // Device state: Active
        buffer.writeUInt32LE(this.packetId, 32); // Packet ID

        // Buttons Bitmask (4 bytes, starting at 36)
        let buttonsMask = 0;
        if (data.buttons?.LEFT) buttonsMask |= (1 << 0);
        if (data.buttons?.DOWN) buttonsMask |= (1 << 1);
        if (data.buttons?.RIGHT) buttonsMask |= (1 << 2);
        if (data.buttons?.UP) buttonsMask |= (1 << 3);
        if (data.buttons?.A) buttonsMask |= (1 << 12);
        if (data.buttons?.B) buttonsMask |= (1 << 13);
        buffer.writeUInt32LE(buttonsMask, 36);

        // Left Analog (40) and Right Analog (42) - 0x80 is center
        buffer.writeUInt8(0x80, 40); // LX
        buffer.writeUInt8(0x80, 41); // LY
        buffer.writeUInt8(0x80, 42); // RX
        buffer.writeUInt8(0x80, 43); // RY

        // Analog Buttons (44 to 55) - we'll just set them to 0 or 255 based on digital buttons
        // Order: DPad Left, Down, Right, Up, Y, B, A, X, R1, L1, R2, L2
        buffer.writeUInt8(data.buttons?.LEFT ? 0xFF : 0, 44);
        buffer.writeUInt8(data.buttons?.DOWN ? 0xFF : 0, 45);
        buffer.writeUInt8(data.buttons?.RIGHT ? 0xFF : 0, 46);
        buffer.writeUInt8(data.buttons?.UP ? 0xFF : 0, 47);
        buffer.writeUInt8(0, 48); // Y
        buffer.writeUInt8(data.buttons?.B ? 0xFF : 0, 49); // B
        buffer.writeUInt8(data.buttons?.A ? 0xFF : 0, 50); // A
        buffer.writeUInt8(0, 51); // X
        // Skip rest to 55 (defaults to 0)

        // Timestamp (8 bytes, 68) - using microseconds
        const hrtime = process.hrtime();
        const micros = hrtime[0] * 1000000 + Math.round(hrtime[1] / 1000);
        buffer.writeBigUInt64LE(BigInt(micros), 68);

        // Accelerometer (76) - X, Y, Z floats (in Gs)
        buffer.writeFloatLE(data.accel?.x || 0.0, 76);
        buffer.writeFloatLE(data.accel?.y || -1.0, 80); // gravity is usually -1 on y or z depending on orientation
        buffer.writeFloatLE(data.accel?.z || 0.0, 84);

        // Gyroscope (88) - Pitch, Yaw, Roll floats (in deg/s)
        buffer.writeFloatLE(data.gyro?.pitch || 0.0, 88);
        buffer.writeFloatLE(data.gyro?.yaw || 0.0, 92);
        buffer.writeFloatLE(data.gyro?.roll || 0.0, 96);

        // Compute CRC32
        const crc = crc32.buf(buffer, 0) >>> 0; // unsigned
        buffer.writeUInt32LE(crc, 8);

        return buffer;
    }
}

module.exports = { DSUPacker };
