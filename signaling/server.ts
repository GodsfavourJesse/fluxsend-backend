import { WebSocketServer } from "ws";
import { handleSocket } from "./sockets";

export function startSignalingServer(port: number) {
    const wss = new WebSocketServer({ port });

    wss.on("connection", (ws, req) => {
        console.log("New Ws connection from", req.socket.remoteAddress);
        handleSocket(ws);
    });

    console.log(`🔌 Signaling server running on :${port}`);
}
