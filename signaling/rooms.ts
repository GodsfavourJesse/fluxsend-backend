type Room = {
    id: string;
    token: string;
    host: string;
    guest?: string;
    devices: Set<string>;
    status: "waiting" | "connecting" | "connected";
};

const rooms = new Map<string, Room>();

function generateCode(length: number) {
    return Math.random().toString(36).substring(2, 2 + length).toUpperCase();
}

// CREATE ROOM
export function createRoom(hostDeviceId: string) {
    const room: Room = {
        id: generateCode(6),
        token: generateCode(12),
        host: hostDeviceId,
        devices: new Set([hostDeviceId]),
        status: "waiting"
    };

    rooms.set(room.id, room);
    return { id: room.id, token: room.token };
}

// JOIN ROOM
export function joinRoom(roomId: string, token: string, deviceId: string) {
    const room = rooms.get(roomId);
    if (!room) return null;
    if (room.token !== token) return null;

    room.devices.add(deviceId);
    room.guest = deviceId;
    room.status = "connecting";

    return room;
}

export function setRoomConnected(roomId: string) {
    const room = rooms.get(roomId);
    if (room) room.status = "connected";
}

export function getRoomByDevice(deviceId: string) {
    for (const room of rooms.values()) {
        if (room.devices.has(deviceId)) return room;
    }
    return null;
}

export function areDevicesInSameRoom(a: string, b: string) {
    const roomA = getRoomByDevice(a);
    return roomA ? roomA.devices.has(b) : false;
}

export function removeDeviceFromRooms(deviceId: string) {
    for (const [id, room] of rooms.entries()) {
        room.devices.delete(deviceId);
        if (room.devices.size === 0) rooms.delete(id);
    }
}
