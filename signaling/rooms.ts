type Room = {
    id: string;
    token: string;
    host: string;
    guest?: string;
    devices: Set<string>;
    status: "waiting" | "connecting" | "connected";
    createdAt: number;
    expiresAt: number;
    lastActivity: number;
};

const rooms = new Map<string, Room>();

function generateCode(length: number) {
    return Math.random()
        .toString(36)
        .substring(2, 2 + length)
        .toUpperCase();
}

// CREATE ROOM
export function createRoom(hostDeviceId: string) {
    const now = Date.now();
    const room: Room = {
        id: generateCode(6),
        token: generateCode(12),
        host: hostDeviceId,
        devices: new Set([hostDeviceId]),
        status: "waiting",
        createdAt: Date.now(),
        expiresAt: Date.now() + 2 * 60 * 1000, // 2 minutes
        lastActivity: Date.now()
    };

    rooms.set(room.id, room);
    return room;
}

// JOIN ROOM
export function joinRoom(roomId: string, token: string, deviceId: string) {
    const room = rooms.get(roomId);
    if (!room) return null;

    // Only allow one guest
    if (room.guest) return null;

    room.devices.add(deviceId);
    room.guest = deviceId;
    room.status = "connecting";
    room.lastActivity = Date.now();
    room.expiresAt = Date.now() + 2 * 60 * 1000;

    return room;
}

// RESET ROOM TO WAITING (guest left / handshake failed)
// export function resetRoom(room: Room) {
//     room.devices.delete(room.guest!);
//     room.guest = undefined;
//     room.status = "waiting";
// }

// REMOVE DEVICE FROM ROOMS
export function removeDeviceFromRooms(deviceId: string) {
    for (const [id, room] of rooms.entries()) {
        room.devices.delete(deviceId);

        if (room.host === deviceId) {
            rooms.delete(id); // host left → destroy room
            continue;
        }

        if (room.guest === deviceId) {
            room.guest = undefined;
            room.status = "waiting";
        }

        if (room.devices.size === 0) {
            rooms.delete(id);
        }
    }
}

// FIND ROOM BY DEVICE
export function getRoomByDevice(deviceId: string) {
    for (const room of rooms.values()) {
        if (room.devices.has(deviceId)) return room;
    }
    return null;
}

// CLEANUP EXPIRED ROOMS
setInterval(() => {
    const now = Date.now();
    for (const [id, room] of rooms.entries()) {
        // Never kill active host room
        if (room.status === "waiting" && room.devices.has(room.host)) continue;

        if (now - room.lastActivity > 2 * 60 * 1000) {
            rooms.delete(id);
        }
    }
}, 10_000);
