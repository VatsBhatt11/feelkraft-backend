import "dotenv/config";
import express from "express";
import cors from "cors";
import { uploadRouter } from "./routes/upload.js";
import { generateRouter } from "./routes/generate.js";
import { jobRouter } from "./routes/job.js";
import { callbackRouter } from "./routes/callback.js";
import { refineRouter } from "./routes/refine.js";

import { paymentRouter } from "./routes/payment.js";
import { cleanupService } from "./services/cleanup.js";
import { rateLimiter } from "./middleware/rateLimit.js";
import { logger } from "./utils/logger.js";
import { authenticateUser } from "./middleware/auth.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
    origin: process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL
        : "http://localhost:8080",
    credentials: true,
}));
app.use(express.json());
app.use(rateLimiter);

// Routes
app.use("/api/upload", uploadRouter);
app.use("/api/generate", generateRouter);
app.use("/api/job", jobRouter);
app.use("/api/callback", callbackRouter);
app.use("/api/refine", refineRouter);

app.use("/api/payment", paymentRouter);
app.post("/api/auth/sync", authenticateUser, (req, res) => {
    res.json({ success: true, user: req.user });
});

app.get("/health", (req, res) => {
    logger.info("Health check heartbeat received");
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
});

export default app;
