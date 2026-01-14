// Devices.ts
import { WebSocket } from "ws";

type Device = {
    id: string;
    socket: WebSocket;
    name: string;
};

const devices = new Map<string, Device>();

export function registerDevice(device: Device) {
    devices.set(device.id, device);
}

export function removeDevice(id: string) {
    devices.delete(id);
}

export function listDevices() {
    return Array.from(devices.values()).map((d) => ({
        id: d.id,
        name: d.name
    }));
}

export function getDevice(id: string) {
    return devices.get(id);
}
