import { getRoomByDevice, rooms } from "./rooms";
import { getDevice } from "./devices";
import WebSocket from "ws";

// OPTIMIZED: Relay with comprehensive error handling and validation
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

    // CRITICAL FIX: Allow relay during "connecting" state for handshake messages
    // Only block if room is still in "waiting" state
    if (room.status === "waiting") {
        console.warn(`Room ${room.id} still waiting for peer`);
        const sender = getDevice(senderId);
        if (sender && sender.socket.readyState === WebSocket.OPEN) {
            sender.socket.send(JSON.stringify({
                type: "error",
                message: "Waiting for peer to join"
            }));
        }
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
        // console.log(`Message relayed from ${senderId} to ${targetId}`);
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

// OPTIMIZED: Broadcast to all devices in a room with error handling
export function relayToRoom(roomId: string, data: any, excludeDeviceId?: string) {
    try {
        const room = Array.from(rooms.values()).find((r) => r.id === roomId);

        if (!room) {
            console.warn(`Room ${roomId} not found for broadcast`);
            return;
        }

        let successCount = 0;
        let failCount = 0;

        room.devices.forEach((deviceId: string) => {
            if (deviceId === excludeDeviceId) return;

            const device = getDevice(deviceId);
            if (device && device.socket.readyState === WebSocket.OPEN) {
                try {
                    device.socket.send(data);
                    successCount++;
                } catch (error) {
                    console.error(`Failed to broadcast to ${deviceId}:`, error);
                    failCount++;
                }
            } else {
                failCount++;
            }
        });

        if (failCount > 0) {
            console.warn(`Broadcast to room ${roomId}: ${successCount} succeeded, ${failCount} failed`);
        }
    } catch (error) {
        console.error("Error in relayToRoom:", error);
    }
}

// NEW: Direct send with validation (for critical messages)
export function sendDirect(fromId: string, toId: string, data: any): boolean {
    const from = getDevice(fromId);
    const to = getDevice(toId);

    if (!from || !to) {
        console.error(`Direct send failed: devices not found`);
        return false;
    }

    if (to.socket.readyState !== WebSocket.OPEN) {
        console.error(`Direct send failed: target socket not ready`);
        return false;
    }

    try {
        to.socket.send(data);
        return true;
    } catch (error) {
        console.error(`Direct send error:`, error);
        return false;
    }
}