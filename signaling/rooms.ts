type Room = {
    id: string;
    token: string;
    devices: Set<string>;
    host: string;
};

const rooms = new Map<string, Room>();

function generateRoomCode(length = 6) {
    return Math.random().toString(36).substring(2, 2 + length).toUpperCase();
}

// export function createRoom(deviceId: string) {
//     const id = Math.random().toString(36).substring(2, 8).toUpperCase();
//     rooms.set(id, { id, devices: new Set([deviceId]) });
//     return id;
// }

// ------------------ CREATE ROOM --------------------
export function createRoom(hostDeviceId: string) {
    const id = generateRoomCode(6);
    const token = generateRoomCode(12);

    const room: Room = {
        id,
        token,
        devices: new Set([hostDeviceId]),
        host: hostDeviceId
    };

    rooms.set(id, room);
    return { id, token };
}

//  ----------------- JOIN ROOM -------------------
export function joinRoom(roomId: string, token: string, deviceId: string) {
    const room = rooms.get(roomId);
    if (!room) return null;
    if (room.token !== token) return null;
    
    room.devices.add(deviceId);
    return room;
}

// ----------------- REMOVE ROOM ----------------------
export function removeDeviceFromRooms(deviceId: string) {
    for (const [roomId, room] of rooms.entries()) {
        room.devices.delete(deviceId);

        // Auto-destroy empty rooms
        if (room.devices.size === 0) {
            rooms.delete(roomId);
        }
    }
}

// ---------------- HELPER -----------------------
export function areDevicesInSameRoom(a: string, b: string): boolean {
    for (const room of rooms.values()) {
        if (room.devices.has(a) && room.devices.has(b)) {
            return true;
        }
    }
    return false;
}

export function getRoom(roomId: string) {
    return rooms.get(roomId);
}

