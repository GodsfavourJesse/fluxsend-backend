import { startSignalingServer } from "./signaling/server";
import { startApi } from "./api";
import dotenv from "dotenv";

dotenv.config();

const SIGNALING_PORT = Number(process.env.SIGNALING_PORT) || 4000;
const API_PORT = Number(process.env.API_PORT) || 5000;

startSignalingServer(SIGNALING_PORT);
startApi(API_PORT);

console.log("Backend initialized. Waiting for connections...");
