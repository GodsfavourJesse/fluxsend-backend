import { v4 as uuid } from "uuid";
import { registerDevice, removeDevice, getDevice } from "./devices";
import { createRoom, joinRoom, removeDeviceFromRooms, areDevicesInSameRoom } from "./rooms";

export function handleSocket(ws: any) {
    const deviceId = uuid();
    console.log("🔹 New WebSocket connection:", deviceId);

    ws.on("message", (raw: string) => {
        let message: any;

        try {
            message = JSON.parse(raw);
        } catch {
            return;
        }

        switch (message.type) {
            case "create-room":
                registerDevice({
                    id: deviceId,
                    socket: ws,
                    name: message.deviceName || "Unknown"
                });

                const { id, token } = createRoom(deviceId);

                ws.send(JSON.stringify({
                    type: "room-created",
                    roomId: id,
                    token
                    // devices: listDevices()
                }));
                break;

            // case "signal": {
            //     const target = getDevice(message.targetId);
            //     if (target) {
            //         target.socket.send(JSON.stringify({
            //             type: "signal",
            //             from: deviceId,
            //             data: message.data
            //         }));
            //     }
            //     break;
            // }

            // case "create-room": {
            //     const roomId = createRoom(deviceId);
            //     ws.send(JSON.stringify({
            //         type: "room-created",
            //         roomId
            //     }));
            //     break;
            // }

            case "join-room": {
                registerDevice({
                    id: deviceId,
                    socket: ws,
                    name: message.deviceName || "Unknown",
                })

                const room = joinRoom(
                    message.roomId,
                    message.token,
                    deviceId
                );

                if (!room) {
                    ws.send(JSON.stringify({
                        type: "error",
                        message: "Invalid room"
                    }));
                    return;
                }

                // Notify All devies in room
                room.devices.forEach(id => {
                    const device = getDevice(id);
                    if (!device) return;

                    device.socket.send(JSON.stringify({
                        type: "peer-connected",
                        peerName: message.deviceName
                    }));
                });

                break;
            }

            case "file-chunk": {
                const target = getDevice(message.targetId);
                if (!target) return;

                if (!areDevicesInSameRoom(deviceId, message.targetId)) {
                    ws.send(JSON.stringify({
                        type: "error",
                        message: "Devices not paired"
                    }));
                    return;
                }

                target.socket.send(JSON.stringify({
                    type: "file-chunk",
                    from: deviceId,
                    chunk: message.chunk,
                    meta: message.meta
                }));
                break;
            }
        }
    });

    // Ping every 30s
    const pingInterval = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
        }
    }, 30000);

    ws.on("close", () => {
        removeDevice(deviceId);
        removeDeviceFromRooms(deviceId);
        clearInterval((pingInterval));
        console.log("🔹 Device disconnected:", deviceId);
    });


}
