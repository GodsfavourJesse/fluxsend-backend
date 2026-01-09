import { v4 as uuid } from "uuid";
import { registerDevice, removeDevice, listDevices, getDevice } from "./devices";
import { createRoom, joinRoom, removeDeviceFromRooms, areDevicesInSameRoom } from "./rooms";

export function handleSocket(ws: any) {
    const deviceId = uuid();
    console.log("🔹 New WebSocket connection:", deviceId);

    ws.on("message", (raw: string | Buffer) => {
        let message: any;

        try {
            message = JSON.parse(raw.toString());
        } catch {
            return;
        }

        switch (message.type) {
            case "register":
                registerDevice({
                    id: deviceId,
                    socket: ws,
                    name: message.name || "Unknown"
                });

                ws.send(JSON.stringify({
                    type: "devices",
                    devices: listDevices()
                }));
                break;

            case "signal": {
                const target = getDevice(message.targetId);
                if (target) {
                    target.socket.send(JSON.stringify({
                        type: "signal",
                        from: deviceId,
                        data: message.data
                    }));
                }
                break;
            }

            case "create-room": {
                const roomId = createRoom(deviceId);
                ws.send(JSON.stringify({
                    type: "room-created",
                    roomId
                }));
                break;
            }

            case "join-room": {
                const room = joinRoom(message.roomId, deviceId);
                if (!room) {
                    ws.send(JSON.stringify({
                        type: "error",
                        message: "Room not found"
                    }));
                    break;
                }

                room.devices.forEach(id => {
                    const d = getDevice(id);
                    d?.socket.send(JSON.stringify({
                        type: "room-joined",
                        roomId: message.roomId,
                        devices: Array.from(room.devices)
                    }));
                });
                break;
            }

            case "file-chunk": {
                const targetId = message.targetId;
                const receiver = getDevice(targetId);

                if (!receiver) return;

                const allowed = areDevicesInSameRoom(deviceId, targetId);

                if (!allowed) {
                    ws.send(JSON.stringify({
                        type: "error",
                        message: "Devices are not paired"
                    }));
                    return;
                }

                receiver.socket.send(JSON.stringify({
                    type: "file-chunk",
                    from: deviceId,
                    chunk: message.chunk,
                    meta: message.meta
                }));
                break;
            }
        }
    });

    ws.on("close", () => {
        removeDevice(deviceId);
        removeDeviceFromRooms(deviceId);
        console.log("🔹 Device disconnected:", deviceId);
    });
}
