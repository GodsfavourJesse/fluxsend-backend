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
        } catch {
            return;
        }

        switch (message.type) {

            // HOST CREATES ROOM
            case "create-room": {
                registerDevice({ 
                    id: deviceId, 
                    socket: ws, 
                    name: message.deviceName 
                });

                const room = createRoom(deviceId);

                ws.send(JSON.stringify({
                    type: "room-created",
                    roomId: room.id,
                    token: room.token,
                    role: "host"
                }));
                break;
            }

            // GUEST JOINS ROOM
            case "join-room": {
                registerDevice({ 
                    id: deviceId, 
                    socket: ws, name: 
                    message.deviceName 
                });

                const room = joinRoom(message.roomId, message.token, deviceId);
                if (!room) {
                    ws.send(JSON.stringify({ 
                        type: "error", 
                        message: "Invalid pairing code" 
                    }));
                    return;
                }

                const host = getDevice(room.host);
                if (!host) return;

                // STEP 1: notify host someone is connecting
                host.socket.send(JSON.stringify({
                    type: "peer-joining",
                    peerName: message.deviceName
                }));

                // STEP 2: confirm connection to BOTH
                setTimeout(() => {
                    setRoomConnected(room.id);

                    host.socket.send(JSON.stringify({
                        type: "connection-established",
                        peerName: message.deviceName
                    }));

                    ws.send(JSON.stringify({
                        type: "connection-established",
                        peerName: host.name
                    }));
                }, 300); // ultra-fast handshake

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
        removeDevice(deviceId);
        removeDeviceFromRooms(deviceId);
        clearInterval(ping);
    });
}
