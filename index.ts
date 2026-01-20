import express from "express";
import { WebSocketServer } from "ws";
import { handleSocket } from "./signaling/sockets";
import health from "./api/routes/health";
import stats from "./api/routes/stats";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

dotenv.config();

const PORT = Number(process.env.PORT) || 4000;
const NODE_ENV = process.env.NODE_ENV || "development";
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(",") || [
    "http://localhost:3000",
    "https://fluxsend.vercel.app"
];

const app = express();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        
        if (ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`Blocked CORS request from: ${origin}`);
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true
}));

// Rate limiting for API
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: "Too many requests from this IP, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (NODE_ENV === "development" || res.statusCode >= 400) {
            console.log(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
        }
    });
    next();
});

// Health check (no rate limit)
app.use("/health", health);

// Stats endpoint (with rate limit)
app.use("/stats", apiLimiter, stats);

// Root endpoint
app.get("/", (_, res) => {
    res.json({
        service: "FluxSend Backend",
        version: "2.0.0",
        status: "running",
        features: [
            "file-transfer",
            "text-share",
            "clipboard-share",
            "encryption-ready",
            "resume-transfer",
            "peer-ready-handshake"
        ],
        websocket: `ws${NODE_ENV === "production" ? "s" : ""}://${process.env.WS_HOST || 'localhost'}:${PORT}`,
        docs: "https://github.com/yourusername/fluxsend"
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Error:", err.message);
    res.status(500).json({ 
        error: NODE_ENV === "production" ? "Internal server error" : err.message 
    });
});

// Create HTTP server
const server = app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   🚀 FluxSend Backend v2.0.0          ║
║   Environment: ${NODE_ENV.padEnd(19)}  ║
║   Port: ${PORT.toString().padEnd(29)}  ║
║   WebSocket: Ready                     ║
╚════════════════════════════════════════╝
    `);
});

// WebSocket server with enhanced config
const wss = new WebSocketServer({ 
    server,
    perMessageDeflate: {
        zlibDeflateOptions: {
            chunkSize: 1024,
            memLevel: 7,
            level: 3
        },
        zlibInflateOptions: {
            chunkSize: 10 * 1024
        },
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
        serverMaxWindowBits: 10,
        concurrencyLimit: 10,
        threshold: 1024
    },
    maxPayload: 100 * 1024 * 1024,
    clientTracking: true
});

wss.on("connection", (ws, req) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`🔌 New WS connection from ${ip}`);
    
    handleSocket(ws);
});

wss.on("error", (error) => {
    console.error("WebSocket Server Error:", error);
});

// Graceful shutdown
process.on("SIGTERM", () => {
    console.log("SIGTERM received. Shutting down gracefully...");
    
    wss.clients.forEach((ws) => {
        ws.close(1001, "Server shutting down");
    });

    server.close(() => {
        console.log("HTTP server closed");
        process.exit(0);
    });

    setTimeout(() => {
        console.error("Forced shutdown");
        process.exit(1);
    }, 10000);
});

process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
    if (NODE_ENV === "production") {
        process.exit(1);
    }
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Periodic stats logging
if (NODE_ENV === "development") {
    setInterval(() => {
        console.log(`Active connections: ${wss.clients.size}`);
    }, 60_000);
}

export default app;