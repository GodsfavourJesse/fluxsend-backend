type Room = {
    id: string;
    devices: Set<string>;
};

const rooms = new Map<string, Room>();

export function createRoom(deviceId: string) {
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    rooms.set(id, { id, devices: new Set([deviceId]) });
    return id;
}

export function joinRoom(roomId: string, deviceId: string) {
    const room = rooms.get(roomId);
    if (!room) return null;
    room.devices.add(deviceId);
    return room;
}

export function removeDeviceFromRooms(deviceId: string) {
    for (const [roomId, room] of rooms.entries()) {
        room.devices.delete(deviceId);

        // Auto-destroy empty rooms
        if (room.devices.size === 0) {
            rooms.delete(roomId);
        }
    }
}

export function getRoom(roomId: string) {
    return rooms.get(roomId);
}

export function areDevicesInSameRoom(a: string, b: string): boolean {
    for (const room of rooms.values()) {
        if (room.devices.has(a) && room.devices.has(b)) {
            return true;
        }
    }
    return false;
}

export function generateRoomCode() {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
}