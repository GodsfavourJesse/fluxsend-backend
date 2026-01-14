import { v4 as uuid } from "uuid";
import WebSocket from "ws";
import { registerDevice, removeDevice, getDevice } from "./devices";
import {
    createRoom,
    joinRoom,
    removeDeviceFromRooms,
    getRoomByDevice
} from "./rooms";

const HANDSHAKE_DURATION = 15_000;

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

            case "join-room": {
                registerDevice({ id: deviceId, socket: ws, name: message.deviceName });
                const room = joinRoom(message.roomId, message.token, deviceId);

                if (!room) {
                    ws.send(JSON.stringify({ type: "error", message: "Invalid or expired code" }));
                    return;
                }

                const host = getDevice(room.host);
                if (!host) return;

                host.socket.send(JSON.stringify({
                    type: "peer-joining",
                    peerName: message.deviceName
                }));

                ws.send(JSON.stringify({
                    type: "peer-joining",
                    peerName: host.name
                }));

                setTimeout(() => {
                    if (room.status !== "connecting") return;

                    if (
                        host.socket.readyState === WebSocket.OPEN &&
                        ws.readyState === WebSocket.OPEN
                    ) {
                        room.status = "connected";
                        room.lastActivity = Date.now();

                        host.socket.send(JSON.stringify({
                            type: "connection-established",
                            peerName: message.deviceName
                        }));

                        ws.send(JSON.stringify({
                            type: "connection-established",
                            peerName: host.name
                        }));
                    } else {
                        room.status = "waiting";
                        room.guest = undefined;
                        room.devices.delete(deviceId);
                    }
                }, HANDSHAKE_DURATION);

                break;
            }
        }
    });

    const ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
        }
    }, 5000);

    ws.on("close", () => {
        const room = getRoomByDevice(deviceId);

        if (room) {
            const peerId = room.host === deviceId ? room.guest : room.host;
            if (peerId) {
                const peer = getDevice(peerId);
                peer?.socket.send(JSON.stringify({ type: "peer-disconnected" }));
            }
        }

        removeDevice(deviceId);
        removeDeviceFromRooms(deviceId);
        clearInterval(ping);
    });
}
