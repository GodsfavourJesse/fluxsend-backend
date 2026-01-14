import { v4 as uuid } from "uuid";
import WebSocket from "ws";
import { registerDevice, removeDevice, getDevice } from "./devices";
import { createRoom, joinRoom, removeDeviceFromRooms, getRoomByDevice } from "./rooms";

export function handleSocket(ws: WebSocket) {
    const deviceId = uuid();

    ws.on("message", (raw) => {
        let message: any;
        try {
            message = JSON.parse(raw.toString());
        } catch {
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

            // RETRY (generate new code)
            case "retry-room": {
                removeDeviceFromRooms(deviceId);

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
                    ws.send(JSON.stringify({
                        type: "error",
                        message: "Invalid or expired code"
                    }));
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

                // Notify both sides (CONNECTING)
                host.socket.send(JSON.stringify({
                    type: "peer-joining",
                    peerName: message.deviceName
                }));

                ws.send(JSON.stringify({
                    type: "peer-joining",
                    peerName: host.name
                }));

                // HANDSHAKE (only AFTER guest joins)
                const handshakeDuration = 3000; // 3 seconds

                setTimeout(() => {
                    const hostOpen = host.socket.readyState === WebSocket.OPEN;
                    const guestOpen = ws.readyState === WebSocket.OPEN;

                    if (hostOpen && guestOpen && room.status === "connecting") {
                        room.status = "connected";

                        host.socket.send(JSON.stringify({
                            type: "connection-established",
                            peerName: message.deviceName
                        }));

                        ws.send(JSON.stringify({
                            type: "connection-established",
                            peerName: host.name
                        }));
                    } else {
                        // Handshake failed → reset room
                        if (hostOpen) {
                            host.socket.send(JSON.stringify({
                                type: "peer-disconnected"
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

    // KEEPALIVE
    const ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
        }
    }, 1500);

    ws.on("close", () => {
        const room = getRoomByDevice(deviceId);

        if (room) {
            const peerId =
                room.host === deviceId ? room.guest : room.host;

            if (peerId) {
                const peer = getDevice(peerId);
                if (peer?.socket.readyState === WebSocket.OPEN) {
                    peer.socket.send(JSON.stringify({
                        type: "peer-disconnected"
                    }));
                }
            }
        }

        removeDevice(deviceId);
        removeDeviceFromRooms(deviceId);
        clearInterval(ping);
    });

    ws.on("error", () => {});
}
