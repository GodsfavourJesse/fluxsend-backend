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
    encryption?: boolean;
    transferCount?: number;
};

const rooms = new Map<string, Room>();

// OPTIMIZED: Better random code generation with collision avoidance
function generateCode(length: number): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars (I,O,0,1)
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// OPTIMIZED: Faster unique ID generation
function generateUniqueRoomId(): string {
    let attempts = 0;
    while (attempts < 20) { // Increased attempts
        const id = generateCode(6);
        if (!rooms.has(id)) return id;
        attempts++;
    }
    // Fallback: use timestamp suffix if collision persists
    return generateCode(6) + Date.now().toString(36).slice(-2).toUpperCase();
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
            expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
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

// OPTIMIZED: Join room with better validation
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

    // Prevent host from joining their own room
    if (room.host === deviceId) {
        console.log(`Host cannot join their own room: ${roomId}`);
        return null;
    }

    // OPTIMIZED: Token validation only for QR code joins
    // Manual joins (no token) are allowed for easier pairing
    if (token && room.token !== token) {
        console.log(`Invalid token for room: ${roomId}`);
        return null;
    }

    room.devices.add(deviceId);
    room.guest = deviceId;
    room.status = "connecting";
    room.lastActivity = Date.now();
    room.expiresAt = Date.now() + 30 * 60 * 1000; // Extended: 30 minutes for active connection

    console.log(`Device ${deviceId} joined room ${room.id}`);

    return room;
}

// REMOVE DEVICE FROM ROOMS
export function removeDeviceFromRooms(deviceId: string): void {
    for (const [id, room] of rooms.entries()) {
        room.devices.delete(deviceId);
        room.readyPeers.delete(deviceId);

        // Host left → destroy room immediately
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
            room.expiresAt = Date.now() + 5 * 60 * 1000; // Reset to 5 minutes
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

// OPTIMIZED: Get room by ID directly (faster lookup)
export function getRoomById(roomId: string): Room | null {
    return rooms.get(roomId.toUpperCase()) || null;
}

// GET ROOM STATS (for monitoring)
export function getRoomStats() {
    const now = Date.now();
    return {
        totalRooms: rooms.size,
        activeConnections: Array.from(rooms.values()).filter(r => r.status === "connected").length,
        waitingRooms: Array.from(rooms.values()).filter(r => r.status === "waiting").length,
        connectingRooms: Array.from(rooms.values()).filter(r => r.status === "connecting").length,
        rooms: Array.from(rooms.values()).map(r => ({
            id: r.id,
            status: r.status,
            devices: r.devices.size,
            ageSeconds: Math.floor((now - r.createdAt) / 1000),
            lastActivitySeconds: Math.floor((now - r.lastActivity) / 1000),
            transfers: r.transferCount,
            hasGuest: !!r.guest
        }))
    };
}

// OPTIMIZED: Aggressive cleanup with better time windows
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, room] of rooms.entries()) {
        const age = now - room.createdAt;
        const inactiveTime = now - room.lastActivity;

        // Keep active transfers alive longer (60 minutes max)
        if (room.status === "connected" && inactiveTime < 60 * 60 * 1000) {
            continue;
        }

        // Remove inactive connected rooms after 60 minutes
        if (room.status === "connected" && inactiveTime >= 60 * 60 * 1000) {
            rooms.delete(id);
            cleaned++;
            console.log(`Cleaned inactive connected room: ${id} (inactive for ${Math.floor(inactiveTime / 60000)}min)`);
            continue;
        }

        // Remove waiting rooms after 5 minutes
        if (room.status === "waiting" && age > 5 * 60 * 1000) {
            rooms.delete(id);
            cleaned++;
            console.log(`Cleaned waiting room: ${id} (age: ${Math.floor(age / 60000)}min)`);
            continue;
        }

        // Remove stuck connecting rooms after 2 minutes
        if (room.status === "connecting" && inactiveTime > 2 * 60 * 1000) {
            rooms.delete(id);
            cleaned++;
            console.log(`Cleaned stuck connecting room: ${id} (inactive for ${Math.floor(inactiveTime / 1000)}s)`);
        }
    }

    if (cleaned > 0) {
        console.log(`🧹 Cleaned ${cleaned} rooms. Active: ${rooms.size}`);
    }
}, 30_000); // Check every 30 seconds

// OPTIMIZED: Periodic stats logging (every 5 minutes)
setInterval(() => {
    const stats = getRoomStats();
    console.log(`Room Stats: ${stats.totalRooms} total | ${stats.activeConnections} connected | ${stats.waitingRooms} waiting | ${stats.connectingRooms} connecting`);
}, 5 * 60 * 1000);

// Export rooms for relay
export { rooms };