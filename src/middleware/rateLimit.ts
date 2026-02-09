import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redis } from "../services/redis.js";

// Helper to get store config
const getStore = (prefix: string) => {
    if (!redis) return undefined;

    return new RedisStore({
        // @ts-ignore - types mismatch between ioredis and rate-limit-redis but compatible at runtime
        sendCommand: (...args: string[]) => redis!.call(...args),
        prefix: `rl:${prefix}:`,
    });
};

// General rate limiter: 100 requests per minute per IP
export const rateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    message: { error: "Too many requests, please try again later" },
    standardHeaders: true,
    legacyHeaders: false,
    store: getStore("general"),
});

// Stricter limiter for generation endpoints: 10 per hour per IP
export const generationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: { error: "Generation limit exceeded, please try again later" },
    standardHeaders: true,
    legacyHeaders: false,
    store: getStore("gen"),
});

