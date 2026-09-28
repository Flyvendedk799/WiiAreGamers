const crc32Table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crc32Table[i] = c;
}

function crc32(buffer) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buffer.length; i++) {
        crc = crc32Table[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

class DSUPacker {
    constructor() {
        this.packetId = 0;
        this.serverId = 0x12345678;
    }

    createHeader(payloadLength) {
        const header = Buffer.alloc(16);
        header.write('DSUS', 0);
        header.writeUInt16LE(1001, 4); // Protocol version
        header.writeUInt16LE(payloadLength, 6);
        header.writeUInt32LE(0, 8); // CRC placeholder
        header.writeUInt32LE(this.serverId, 12);
        return header;
    }

    finalizePacket(header, payload) {
        const packet = Buffer.concat([header, payload]);
        const crc = crc32(packet);
        packet.writeUInt32LE(crc, 8); // Write actual CRC32
        return packet;
    }

    createVersionResponsePacket() {
        const payloadLength = 8;
        const header = this.createHeader(payloadLength);
        const payload = Buffer.alloc(payloadLength);
        
        payload.writeUInt32LE(0x100000, 0); // Type: VersionResponse
        payload.writeUInt16LE(1001, 4);     // Max protocol version
        payload.writeUInt16LE(0, 6);        // Padding

        return this.finalizePacket(header, payload);
    }

    createPortsInfoPacket(slot = 0) {
        const payloadLength = 16;
        const header = this.createHeader(payloadLength);
        const payload = Buffer.alloc(payloadLength);
        
        payload.writeUInt32LE(0x100001, 0); // Message type: PortInfo
        payload.writeUInt8(slot, 4);        // Pad ID
        payload.writeUInt8(2, 5);           // State: Connected
        payload.writeUInt8(2, 6);           // Model: FullGyro
        payload.writeUInt8(1, 7);           // Connection: Usb
        
        // MAC address
        payload.writeUInt8(0x00, 8);
        payload.writeUInt8(0x11, 9);
        payload.writeUInt8(0x22, 10);
        payload.writeUInt8(0x33, 11);
        payload.writeUInt8(0x44, 12);
        payload.writeUInt8((0x55 + slot) & 0xFF, 13);
        
        payload.writeUInt8(0xEF, 14); // Battery
        payload.writeUInt8(0, 15);    // Padding

        return this.finalizePacket(header, payload);
    }

    createControllerPacket(data, slot = 0) {
        this.packetId++;
        const payloadLength = 84;
        const header = this.createHeader(payloadLength);
        const payload = Buffer.alloc(payloadLength);

        payload.writeUInt32LE(0x100002, 0); // Type: PadDataResponse
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
        
        payload.writeUInt8(0xEF, 14); // Battery
        payload.writeUInt8(1, 15);    // Active state

        payload.writeUInt32LE(this.packetId, 16);

        let b1 = 0; 
        if (data.buttons?.Share) b1 |= (1 << 0);
        if (data.buttons?.Options) b1 |= (1 << 3);
        if (data.buttons?.PadN) b1 |= (1 << 4);
        if (data.buttons?.PadE) b1 |= (1 << 5);
        if (data.buttons?.PadS) b1 |= (1 << 6);
        if (data.buttons?.PadW) b1 |= (1 << 7);
        
        let b2 = 0;
        if (data.buttons?.L1) b2 |= (1 << 2);
        if (data.buttons?.R1) b2 |= (1 << 3);
        if (data.buttons?.Triangle) b2 |= (1 << 4);
        if (data.buttons?.Circle || data.buttons?.A) b2 |= (1 << 5); 
        if (data.buttons?.Cross || data.buttons?.B) b2 |= (1 << 6); 
        if (data.buttons?.Square) b2 |= (1 << 7);

        payload.writeUInt8(b1, 20);
        payload.writeUInt8(b2, 21);

        payload.writeUInt8(0, 22); // PS button
        payload.writeUInt8(0, 23); // Touch button

        payload.writeUInt8(128, 24); // Left stick X
        payload.writeUInt8(128, 25); // Left stick Y
        payload.writeUInt8(128, 26); // Right stick X
        payload.writeUInt8(128, 27); // Right stick Y

        const hrtime = process.hrtime();
        const micros = hrtime[0] * 1000000 + Math.round(hrtime[1] / 1000);
        payload.writeBigUInt64LE(BigInt(micros), 52);

        payload.writeFloatLE(data.accel?.x || 0.0, 60);
        payload.writeFloatLE(data.accel?.y || 0.0, 64);
        payload.writeFloatLE(data.accel?.z || 0.0, 68);

        payload.writeFloatLE(data.gyro?.pitch || 0.0, 72);
        payload.writeFloatLE(data.gyro?.yaw || 0.0, 76);
        payload.writeFloatLE(data.gyro?.roll || 0.0, 80);

        return this.finalizePacket(header, payload);
    }
}

module.exports = { DSUPacker };
