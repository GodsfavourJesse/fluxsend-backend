import express from "express";
import { WebSocketServer } from "ws";
import { handleSocket } from "./signaling/sockets";
import health from "./api/routes/health";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const PORT = Number(process.env.PORT) || 4000;
const app = express();

// Express API
app.use(cors());
app.use(express.json());
app.use("/health", health);

// CREATE HTTP server
const server = app.listen(PORT, () => {
    console.log(`🌐 Server running on port ${PORT}`);
});

// WebSocket server on the same server
const wss = new WebSocketServer({ server });

wss.on("connection", (ws, req) => {
    console.log("🔌 New WS connection from", req.socket.remoteAddress);
    handleSocket(ws);
});

console.log("Backend initialized. Waiting for connections...");

app.get("/", (_, res) => {
    res.send("Fluxsend backend running");
});
