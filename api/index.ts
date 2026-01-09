import express from "express";
import health from "./routes/health";
import cors from "cors";

export function startApi(port: number) {
    const app = express();

    app.use(cors());
    app.use(express.json());
    app.use("/health", health);

    app.listen(port, () => {
        console.log(`🌐 API running on :${port}`);
    });
}
