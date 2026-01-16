import { getRoomByDevice } from "./rooms";
import { getDevice } from "./devices";
import WebSocket from "ws";

export function relayMessage(senderId: string, data: any) {
    const room = getRoomByDevice(senderId);
    if (!room || room.status !== "connected") return;

    const targetId = room.host === senderId ? room.guest : room.host;
    if (!targetId) return;

    const target = getDevice(targetId);
    if (!target || target.socket.readyState !== WebSocket.OPEN) return;

    target.socket.send(data);
}
