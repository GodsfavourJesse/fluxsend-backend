import { v4 as uuid } from "uuid";
import WebSocket from "ws";
import { registerDevice, removeDevice, getDevice } from "./devices";
import { createRoom, joinRoom, removeDeviceFromRooms, setRoomConnected } from "./rooms";

export function handleSocket(ws: WebSocket) {
    const deviceId = uuid();

    ws.on("message", (raw) => {
        let message: any;
        try {
            message = JSON.parse(raw.toString());
        } catch (err) {
            console.error("Invalid JSON received:", raw.toString());
            return;
        }

        switch (message.type) {
            // HOST creates room
            case "create-room": {
                registerDevice({ id: deviceId, socket: ws, name: message.deviceName });
                const room = createRoom(deviceId);

                ws.send(JSON.stringify({
                    type: "room-created",
                    roomId: room.id,
                    token: room.token,
                    role: "host"
                }));
                break;
            }

            // GUEST joins room
            case "join-room": {
                registerDevice({ id: deviceId, socket: ws, name: message.deviceName });

                const room = joinRoom(message.roomId, message.token, deviceId);
                if (!room) {
                    ws.send(JSON.stringify({ type: "error", message: "Invalid pairing code" }));
                    return;
                }

                const host = getDevice(room.host);
                if (!host || host.socket.readyState !== WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: "error",
                        message: "Host not available"
                    }));
                    return;
                }

                // Step 1: Notify HOST immediately
                host.socket.send(JSON.stringify({
                    type: "peer-joining",
                    peerName: message.deviceName
                }));

                // Step 2: Notify GUEST immediately
                ws.send(JSON.stringify({
                    type: "peer-joining",
                    peerName: host.name
                }));

                // Mark room status
                room.status = "connecting";
                room.guest = deviceId;

                // Step 3: Confirm connection after handshake
                const handshakeDuration = 1300; // 1.3s
                setTimeout(() => {
                    const hostOpen = host.socket.readyState === WebSocket.OPEN;
                    const guestOpen = ws.readyState === WebSocket.OPEN;

                    if (hostOpen && guestOpen) {
                        room.status = "connected";

                        host.socket.send(JSON.stringify({
                            type: "connection-established",
                            peerName: message.deviceName
                        }));

                        ws.send(JSON.stringify({
                            type: "connection-established",
                            peerName: host.name
                        }));

                        console.log(`Connection established between ${host.name} and ${message.deviceName}`);
                    } else {
                        console.log("Connection failed during handshake", { hostOpen, guestOpen });

                        if (hostOpen) {
                            host.socket.send(JSON.stringify({
                                type: "error",
                                message: "Guest disconnected before connection"
                            }));
                        }
                        if (guestOpen) {
                            ws.send(JSON.stringify({
                                type: "error",
                                message: "Host disconnected before connection"
                            }));
                        }

                        removeDeviceFromRooms(deviceId);
                        removeDevice(deviceId);
                    }
                }, handshakeDuration);

                break;
            }
        }
    });

    // LOW-LATENCY KEEPALIVE
    const ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
        }
    }, 1500);

    ws.on("close", () => {
        console.log(`🔌 Device disconnected: ${deviceId}`);
        removeDevice(deviceId);
        removeDeviceFromRooms(deviceId);
        clearInterval(ping);
    });

    ws.on("error", (err) => {
        console.error("WebSocket error:", err);
    });
}
