import { v4 as uuid } from "uuid";
import WebSocket, { RawData } from "ws";
import { registerDevice, removeDevice, getDevice } from "./devices";
import {
    createRoom,
    joinRoom,
    removeDeviceFromRooms,
    getRoomByDevice
} from "./rooms";
import { relayMessage } from "./relay";

const HANDSHAKE_DURATION = 15_000;
const MAX_MESSAGE_SIZE = 10 * 1024 * 1024;
const PING_INTERVAL = 30_000;
const CONNECTION_TIMEOUT = 45_000;

function getDataLength(data: RawData): number {
    if (Buffer.isBuffer(data)) {
        return data.length;
    }
    if (Array.isArray(data)) {
        return data.reduce((acc, buf) => acc + buf.length, 0);
    }
    if (data instanceof ArrayBuffer) {
        return data.byteLength;
    }
    return 0;
}

function toBuffer(data: RawData): Buffer {
    if (Buffer.isBuffer(data)) {
        return data;
    }
    if (Array.isArray(data)) {
        return Buffer.concat(data);
    }
    if (data instanceof ArrayBuffer) {
        return Buffer.from(data);
    }
    return Buffer.from([]);
}

export function handleSocket(ws: WebSocket) {
    const deviceId = uuid();
    let isAuthenticated = false;
    let lastPingTime = Date.now();

    let messageCount = 0;
    const messageLimit = 100;
    const resetInterval = setInterval(() => {
        messageCount = 0;
    }, 60_000);

    ws.on("message", (raw: RawData, isBinary: boolean) => {
        lastPingTime = Date.now();

        if (!isBinary) {
            messageCount++;
            if (messageCount > messageLimit) {
                ws.send(JSON.stringify({ 
                    type: "error", 
                    message: "Rate limit exceeded" 
                }));
                return;
            }
        }

        // HANDLE BINARY FILE CHUNKS
        if (isBinary) {
            if (!isAuthenticated) {
                ws.close(1008, "Unauthorized");
                return;
            }

            const room = getRoomByDevice(deviceId);
            if (!room || room.status !== "connected") {
                ws.send(JSON.stringify({
                    type: "error",
                    message: "File transfer not ready"
                }));
                return;
            }

            const dataLength = getDataLength(raw);
            if (dataLength > 64 * 1024 * 1024) {
                ws.send(JSON.stringify({ 
                    type: "error", 
                    message: "Chunk too large" 
                }));
                return;
            }

            relayMessage(deviceId, toBuffer(raw));
            return;
        }

        let message: any;
        try {
            const dataLength = getDataLength(raw);
            if (dataLength > MAX_MESSAGE_SIZE) {
                ws.send(JSON.stringify({ 
                    type: "error", 
                    message: "Message too large" 
                }));
                return;
            }
            
            const buffer = toBuffer(raw);
            message = JSON.parse(buffer.toString());
        } catch (error) {
            ws.send(JSON.stringify({ 
                type: "error", 
                message: "Invalid JSON" 
            }));
            return;
        }

        try {
            switch (message.type) {
                case "create-room": {
                    if (!message.deviceName || typeof message.deviceName !== 'string') {
                        ws.send(JSON.stringify({ 
                            type: "error", 
                            message: "Invalid device name" 
                        }));
                        return;
                    }

                    registerDevice({ 
                        id: deviceId, 
                        socket: ws, 
                        name: message.deviceName.slice(0, 50)
                    });
                    
                    isAuthenticated = true;
                    
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
                    if (!message.roomId || !message.deviceName) {
                        ws.send(JSON.stringify({ 
                            type: "error", 
                            message: "Missing roomId or deviceName" 
                        }));
                        return;
                    }

                    registerDevice({ 
                        id: deviceId, 
                        socket: ws, 
                        name: message.deviceName.slice(0, 50)
                    });
                    
                    isAuthenticated = true;

                    const room = joinRoom(
                        message.roomId.toUpperCase(), 
                        message.token || "", 
                        deviceId
                    );

                    if (!room) {
                        ws.send(JSON.stringify({ 
                            type: "error", 
                            message: "Invalid room code or room is full" 
                        }));
                        return;
                    }

                    const host = getDevice(room.host);
                    if (!host) {
                        ws.send(JSON.stringify({ 
                            type: "error", 
                            message: "Host disconnected" 
                        }));
                        return;
                    }

                    const guestDevice = getDevice(deviceId);
                    if (!guestDevice) {
                        ws.send(JSON.stringify({ 
                            type: "error", 
                            message: "Failed to register device" 
                        }));
                        return;
                    }

                    // CRITICAL FIX: Notify BOTH peers about each other
                    console.log(`Guest ${deviceId} joining room ${room.id}`);

                    // Notify host about guest
                    host.socket.send(JSON.stringify({
                        type: "peer-joining",
                        peerName: message.deviceName,
                        peerId: deviceId
                    }));

                    // Notify guest about host
                    ws.send(JSON.stringify({
                        type: "peer-joining",
                        peerName: host.name,
                        peerId: room.host
                    }));

                    // CRITICAL FIX: AUTO-SEND peer-ready from both sides
                    // This ensures the handshake completes immediately
                    setTimeout(() => {
                        // Mark both as ready
                        room.readyPeers.add(deviceId);
                        room.readyPeers.add(room.host);
                        
                        // If both ready, establish connection
                        if (room.readyPeers.size === 2 && room.status !== "connected") {
                            room.status = "connected";
                            room.lastActivity = Date.now();

                            const hostDevice = getDevice(room.host);
                            const guestDevice = getDevice(room.guest!);

                            if (hostDevice && guestDevice) {
                                console.log(`Connection established for room ${room.id}`);

                                hostDevice.socket.send(JSON.stringify({
                                    type: "connection-established",
                                    peerName: guestDevice.name,
                                    peerId: room.guest
                                }));

                                guestDevice.socket.send(JSON.stringify({
                                    type: "connection-established",
                                    peerName: hostDevice.name,
                                    peerId: room.host
                                }));
                            }
                        }
                    }, 100); // Small delay to ensure both devices are registered

                    // Exchange encryption keys if provided
                    if (message.encryptionKey) {
                        host.socket.send(JSON.stringify({
                            type: "encryption-key",
                            key: message.encryptionKey,
                            from: deviceId
                        }));
                    }

                    break;
                }

                // BACKUP: Manual peer-ready (in case auto-ready fails)
                case "peer-ready": {
                    if (!isAuthenticated) {
                        ws.close(1008, "Unauthorized");
                        return;
                    }

                    const room = getRoomByDevice(deviceId);
                    if (!room) {
                        console.log("No room found for peer-ready");
                        return;
                    }
                    
                    const peerId = room.host === deviceId ? room.guest : room.host;
                    if (!peerId) {
                        console.log("No peer ID found yet");
                        return;
                    }
                    
                    const peer = getDevice(peerId);
                    if (!peer) {
                        console.log("Peer device not found");
                        return;
                    }

                    room.readyPeers.add(deviceId);
                    console.log(`Peer ready: ${deviceId}, Ready count: ${room.readyPeers.size}`);

                    if (room.readyPeers.size < 2) {
                        return;
                    }
                    
                    if (room.status !== "connected") {
                        room.status = "connected";
                        room.lastActivity = Date.now();

                        const hostDevice = getDevice(room.host);
                        const guestDevice = room.guest ? getDevice(room.guest) : null;

                        if (hostDevice && guestDevice) {
                            console.log(`Connection established via peer-ready for room ${room.id}`);

                            hostDevice.socket.send(JSON.stringify({
                                type: "connection-established",
                                peerName: guestDevice.name,
                                peerId: room.guest
                            }));

                            guestDevice.socket.send(JSON.stringify({
                                type: "connection-established",
                                peerName: hostDevice.name,
                                peerId: room.host
                            }));
                        }
                    }
                    break;
                }

                case "text-share": {
                    if (!isAuthenticated) {
                        ws.close(1008, "Unauthorized");
                        return;
                    }

                    if (!message.text || typeof message.text !== 'string') {
                        ws.send(JSON.stringify({ 
                            type: "error", 
                            message: "Invalid text content" 
                        }));
                        return;
                    }

                    if (message.text.length > 1024 * 1024) {
                        ws.send(JSON.stringify({ 
                            type: "error", 
                            message: "Text too large (max 1MB)" 
                        }));
                        return;
                    }

                    relayMessage(deviceId, JSON.stringify({
                        type: "text-share",
                        text: message.text,
                        timestamp: Date.now()
                    }));
                    break;
                }

                case "clipboard-share": {
                    if (!isAuthenticated) {
                        ws.close(1008, "Unauthorized");
                        return;
                    }

                    if (!message.text || typeof message.text !== 'string') {
                        ws.send(JSON.stringify({ 
                            type: "error", 
                            message: "Invalid clipboard content" 
                        }));
                        return;
                    }

                    if (message.text.length > 512 * 1024) {
                        ws.send(JSON.stringify({ 
                            type: "error", 
                            message: "Clipboard content too large" 
                        }));
                        return;
                    }

                    relayMessage(deviceId, JSON.stringify({
                        type: "clipboard-share",
                        text: message.text,
                        timestamp: Date.now()
                    }));
                    break;
                }

                case "text-received":
                    message.type = "text-share";
                    relayMessage(deviceId, JSON.stringify(message));
                    break;

                case "key-exchange": {
                    if (!isAuthenticated) {
                        ws.close(1008, "Unauthorized");
                        return;
                    }

                    if (!message.key) {
                        ws.send(JSON.stringify({ 
                            type: "error", 
                            message: "Missing encryption key" 
                        }));
                        return;
                    }

                    relayMessage(deviceId, JSON.stringify({
                        type: "encryption-key",
                        key: message.key,
                        from: deviceId
                    }));
                    break;
                }

                case "file-offer":
                case "file-accept":
                case "file-reject":
                case "file-meta":
                case "file-complete":
                case "file-chunk":
                case "transfer-pause":
                case "transfer-resume": {
                    if (!isAuthenticated) {
                        ws.close(1008, "Unauthorized");
                        return;
                    }

                    relayMessage(deviceId, JSON.stringify(message));
                    break;
                }

                case "graceful-disconnect": {
                    if (!isAuthenticated) return;
                    
                    const room = getRoomByDevice(deviceId);
                    if (!room) return;
                    
                    relayMessage(deviceId, JSON.stringify({
                        type: "graceful-disconnect",
                        message: message.message || "Peer left the room"
                    }));
                    
                    ws.close(1000, "Graceful disconnect");
                    break;
                }

                case "pong": {
                    lastPingTime = Date.now();
                    break;
                }

                default:
                    if (isAuthenticated) {
                        relayMessage(deviceId, JSON.stringify(message));
                    }
            }
        } catch (error) {
            console.error("Error handling message:", error);
            ws.send(JSON.stringify({ 
                type: "error", 
                message: "Internal server error" 
            }));
        }
    });

    const ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            if (Date.now() - lastPingTime > CONNECTION_TIMEOUT) {
                console.log(`Device ${deviceId} timed out`);
                ws.terminate();
                return;
            }

            ws.send(JSON.stringify({ type: "ping" }));
        }
    }, PING_INTERVAL);

    ws.on("error", (error) => {
        console.error(`WebSocket error for device ${deviceId}:`, error);
    });

    ws.on("close", (code, reason) => {
        console.log(`Device ${deviceId} disconnected. Code: ${code}`);

        const room = getRoomByDevice(deviceId);

        if (room) {
            const peerId = room.host === deviceId ? room.guest : room.host;
            if (peerId) {
                const peer = getDevice(peerId);
                if (peer && peer.socket.readyState === WebSocket.OPEN) {
                    peer.socket.send(JSON.stringify({ 
                        type: "peer-disconnected",
                        peerId: deviceId
                    }));
                }
            }
        }

        removeDevice(deviceId);
        removeDeviceFromRooms(deviceId);
        clearInterval(ping);
        clearInterval(resetInterval);
    });

    ws.send(JSON.stringify({ 
        type: "welcome", 
        message: "Connected to FluxSend",
        version: "2.0.1",
        features: [
            "file-transfer",
            "text-share",
            "clipboard-share",
            "encryption",
            "resume-transfer",
            "auto-handshake"
        ]
    }));
}