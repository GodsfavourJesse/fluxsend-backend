import { getRoomByDevice, rooms } from "./rooms";
import { getDevice } from "./devices";
import WebSocket from "ws";

// ✅ FIX 2: Relay message to peer with proper error handling
export function relayMessage(senderId: string, data: any) {
    const room = getRoomByDevice(senderId);
    
    if (!room) {
        console.warn(`No room found for device ${senderId}`);
        const sender = getDevice(senderId);
        if (sender && sender.socket.readyState === WebSocket.OPEN) {
            sender.socket.send(JSON.stringify({
                type: "error",
                message: "Not in a room"
            }));
        }
        return;
    }

    // ✅ FIX 2: Send error instead of silent drop
    if (room.status !== "connected") {
        const sender = getDevice(senderId);
        if (sender && sender.socket.readyState === WebSocket.OPEN) {
            sender.socket.send(JSON.stringify({
                type: "error",
                message: "Peer not fully connected yet. Wait for connection-established."
            }));
        }
        console.warn(`Room ${room.id} not connected. Status: ${room.status}`);
        return;
    }

    // Update room activity
    room.lastActivity = Date.now();
    if (room.transferCount !== undefined) {
        room.transferCount++;
    }

    const targetId = room.host === senderId ? room.guest : room.host;
    if (!targetId) {
        console.warn(`No peer found in room ${room.id}`);
        const sender = getDevice(senderId);
        if (sender && sender.socket.readyState === WebSocket.OPEN) {
            sender.socket.send(JSON.stringify({
                type: "error",
                message: "No peer in room"
            }));
        }
        return;
    }

    const target = getDevice(targetId);
    if (!target) {
        console.warn(`Target device ${targetId} not found`);
        const sender = getDevice(senderId);
        if (sender && sender.socket.readyState === WebSocket.OPEN) {
            sender.socket.send(JSON.stringify({
                type: "error",
                message: "Peer disconnected"
            }));
        }
        return;
    }

    if (target.socket.readyState !== WebSocket.OPEN) {
        console.warn(`Target socket not ready. State: ${target.socket.readyState}`);
        const sender = getDevice(senderId);
        if (sender && sender.socket.readyState === WebSocket.OPEN) {
            sender.socket.send(JSON.stringify({
                type: "error",
                message: "Peer connection unstable"
            }));
        }
        return;
    }

    try {
        target.socket.send(data);
    } catch (error) {
        console.error(`Failed to relay message to ${targetId}:`, error);
        const sender = getDevice(senderId);
        if (sender && sender.socket.readyState === WebSocket.OPEN) {
            sender.socket.send(JSON.stringify({
                type: "error",
                message: "Failed to send to peer"
            }));
        }
    }
}

// Broadcast to all devices in a room
export function relayToRoom(roomId: string, data: any, excludeDeviceId?: string) {
    try {
        const room = Array.from(rooms.values()).find((r) => r.id === roomId);

        if (!room) {
            console.warn(`Room ${roomId} not found for broadcast`);
            return;
        }

        room.devices.forEach((deviceId: string) => {
            if (deviceId === excludeDeviceId) return;

            const device = getDevice(deviceId);
            if (device && device.socket.readyState === WebSocket.OPEN) {
                try {
                    device.socket.send(data);
                } catch (error) {
                    console.error(`Failed to broadcast to ${deviceId}:`, error);
                }
            }
        });
    } catch (error) {
        console.error("Error in relayToRoom:", error);
    }
}