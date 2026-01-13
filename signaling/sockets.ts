// Socket.ts

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
            console.warn("Invalid JSON received");
            return;
        }

        switch (message.type) {

            // ---------------- CREATE ROOM ----------------
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
                    token,
                    role: "host",
                }));
                break;

            // ---------------- JOIN ROOM ----------------
            case "join-room":
                registerDevice({
                    id: deviceId,
                    socket: ws,
                    name: message.deviceName || "Unknown",
                });

                const room = joinRoom(message.roomId, message.token, deviceId);

                if (!room) {
                    ws.send(JSON.stringify({
                        type: "error",
                        message: "Invalid room"
                    }));
                    return;
                }

                // ---------------- NOTIFY HOST ----------------
                const hostDevice = getDevice(room.host);
                if (hostDevice) {
                    hostDevice.socket.send(JSON.stringify({
                        type: "peer-connected",
                        peerName: message.deviceName,
                        role: "host"
                    }));
                }

                // ---------------- NOTIFY GUEST ----------------
                const otherDevices = Array.from(room.devices).filter((id: string) => id !== deviceId);
                const peerNames = otherDevices
                    .map((id: string) => getDevice(id)?.name)
                    .filter(Boolean);
                
                ws.send(JSON.stringify({
                    type: "peer-connected",
                    peerName: peerNames.join(",") || "Host",
                    role: "guest"
                }));

                break;

            // ---------------- FILE CHUNK ----------------
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

    // ---------------- FAST PING ----------------
    const pingInterval = setInterval(() => {
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
        }
    }, 2000); // faster ping (5s)

    ws.on("close", () => {
        removeDevice(deviceId);
        removeDeviceFromRooms(deviceId);
        clearInterval(pingInterval);
        console.log("🔹 Device disconnected:", deviceId);
    });

    ws.on("error", (err: any) => {
        console.error("WebSocket error:", err);
        ws.close();
    });
}
