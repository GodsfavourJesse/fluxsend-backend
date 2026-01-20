import { Router } from "express";
import { getRoomStats } from "../../signaling/rooms";
import { listDevices } from "../../signaling/devices";

const router = Router();

router.get("/", (req, res) => {
    try {
        const roomStats = getRoomStats();
        const devices = listDevices();

        res.json({
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                unit: "MB"
            },
            rooms: {
                total: roomStats.totalRooms,
                active: roomStats.activeConnections,
                waiting: roomStats.waitingRooms,
                details: roomStats.rooms
            },
            devices: {
                total: devices.length,
                connected: devices.length
            }
        });
    } catch (error) {
        console.error("Error fetching stats:", error);
        res.status(500).json({ error: "Failed to fetch stats" });
    }
});

export default router;