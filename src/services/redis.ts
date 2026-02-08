import Redis from "ioredis";
import { logger } from "../utils/logger.js";

const REDIS_URL = process.env.REDIS_URL;

let redisClient: Redis | null = null;

if (REDIS_URL) {
    logger.info("Initializing Redis client...");
    redisClient = new Redis(REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy(times) {
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
    });

    redisClient.on("connect", () => {
        logger.info("Redis connected successfully");
    });

    redisClient.on("error", (err) => {
        logger.error("Redis connection error", err);
    });
} else {
    logger.warn("REDIS_URL not set, Redis features will be disabled (fallback to memory)");
}

export const redis = redisClient;

/**
 * Cache utility functions
 */
export const cacheGet = async <T>(key: string): Promise<T | null> => {
    if (!redis) return null;
    try {
        const data = await redis.get(key);
        return data ? JSON.parse(data) : null;
    } catch (error) {
        logger.error(`Redis get error for key ${key}`, error);
        return null;
    }
};

export const cacheSet = async (key: string, value: any, ttlSeconds: number): Promise<void> => {
    if (!redis) return;
    try {
        await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (error) {
        logger.error(`Redis set error for key ${key}`, error);
    }
};

export const cacheDel = async (key: string): Promise<void> => {
    if (!redis) return;
    try {
        await redis.del(key);
    } catch (error) {
        logger.error(`Redis del error for key ${key}`, error);
    }
};
