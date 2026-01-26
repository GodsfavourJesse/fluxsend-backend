type Room = {
    id: string;
    token: string;
    host: string;
    guest?: string;
    devices: Set<string>;
    readyPeers: Set<string>;
    status: "waiting" | "connecting" | "connected";
    createdAt: number;
    expiresAt: number;
    lastActivity: number;
    encryption?: boolean; // Track if encryption is enabled
    transferCount?: number; // Track number of transfers
};

const rooms = new Map<string, Room>();

// Better code generation (more readable)
function generateCode(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Generate unique room ID (prevent collisions)
function generateUniqueRoomId(): string {
    let attempts = 0;
    while (attempts < 10) {
        const id = generateCode(6);
        if (!rooms.has(id)) return id;
        attempts++;
    }
    throw new Error("Failed to generate unique room ID");
}

// CREATE ROOM
export function createRoom(hostDeviceId: string): Room {
    try {
        const room: Room = {
            id: generateUniqueRoomId(),
            token: generateCode(12),
            host: hostDeviceId,
            devices: new Set([hostDeviceId]),
            readyPeers: new Set(),
            status: "waiting",
            createdAt: Date.now(),
            expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes to join
            lastActivity: Date.now(),
            transferCount: 0
        };

        rooms.set(room.id, room);
        
        console.log(`Room created: ${room.id} by ${hostDeviceId}`);
        
        return room;
    } catch (error) {
        console.error("Error creating room:", error);
        throw error;
    }
}

// JOIN ROOM (enhanced validation)
export function joinRoom(roomId: string, token: string | undefined, deviceId: string): Room | null {
    const room = rooms.get(roomId.toUpperCase());
    
    if (!room) {
        console.log(`Room not found: ${roomId}`);
        return null;
    }

    // Check if room expired
    if (Date.now() > room.expiresAt) {
        console.log(`Room expired: ${roomId}`);
        rooms.delete(roomId);
        return null;
    }

    // Only allow one guest
    if (room.guest) {
        console.log(`Room full: ${roomId}`);
        return null;
    }

    // Token validation (optional - for QR code joins)
    if (token && room.token !== token) {
        console.log(`Invalid token for room: ${roomId}`);
        // Allow token-less joins (manual room ID entry)
        // return null;
    }

    room.devices.add(deviceId);
    room.guest = deviceId;
    room.status = "connecting";
    room.lastActivity = Date.now();
    room.expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes after connection

    console.log(`Device ${deviceId} joined room ${room.id}`);

    return room;
}

// REMOVE DEVICE FROM ROOMS
export function removeDeviceFromRooms(deviceId: string): void {
    for (const [id, room] of rooms.entries()) {
        room.devices.delete(deviceId);
        room.readyPeers.delete(deviceId);

        // Host left → destroy room
        if (room.host === deviceId) {
            console.log(`Room destroyed (host left): ${id}`);
            rooms.delete(id);
            continue;
        }

        // Guest left → reset to waiting
        if (room.guest === deviceId) {
            console.log(`Guest left room: ${id}`);
            room.guest = undefined;
            room.status = "waiting";
            room.readyPeers.clear();
        }

        // No devices left → cleanup
        if (room.devices.size === 0) {
            console.log(`Room destroyed (empty): ${id}`);
            rooms.delete(id);
        }
    }
}

// FIND ROOM BY DEVICE
export function getRoomByDevice(deviceId: string): Room | null {
    for (const room of rooms.values()) {
        if (room.devices.has(deviceId)) {
            return room;
        }
    }
    return null;
}

// GET ROOM STATS (for monitoring)
export function getRoomStats() {
    return {
        totalRooms: rooms.size,
        activeConnections: Array.from(rooms.values()).filter(r => r.status === "connected").length,
        waitingRooms: Array.from(rooms.values()).filter(r => r.status === "waiting").length,
        rooms: Array.from(rooms.values()).map(r => ({
            id: r.id,
            status: r.status,
            devices: r.devices.size,
            age: Math.floor((Date.now() - r.createdAt) / 1000),
            transfers: r.transferCount
        }))
    };
}

// CLEANUP EXPIRED ROOMS (enhanced)
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, room] of rooms.entries()) {
        // Don't kill active transfers
        if (room.status === "connected" && now - room.lastActivity < 30 * 60 * 1000) {
            continue; // Keep active rooms for 30 min
        }

        // Remove inactive waiting rooms after 5 min
        if (room.status === "waiting" && now - room.createdAt > 5 * 60 * 1000) {
            rooms.delete(id);
            cleaned++;
            console.log(`Cleaned inactive room: ${id}`);
            continue;
        }

        // Remove stuck connecting rooms after 2 min
        if (room.status === "connecting" && now - room.lastActivity > 2 * 60 * 1000) {
            rooms.delete(id);
            cleaned++;
            console.log(`Cleaned stuck room: ${id}`);
        }
    }

    if (cleaned > 0) {
        console.log(`Cleaned ${cleaned} rooms. Active: ${rooms.size}`);
    }
}, 30_000); // Check every 30 seconds

// Export rooms for relay
export { rooms };