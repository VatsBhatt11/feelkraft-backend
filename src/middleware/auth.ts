import { Request, Response, NextFunction } from "express";
import { supabase } from "../services/storage.js";
import { prisma } from "../utils/prisma.js";
import { logger } from "../utils/logger.js";

// Extend Express Request type to include user
declare global {
    namespace Express {
        interface Request {
            user?: any; // Ideally stricter type
        }
    }
}

export const authenticateUser = async (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: "Missing authorization header" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
        return res.status(401).json({ error: "Invalid token format" });
    }

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            logger.warn("Auth failed", { error });
            return res.status(401).json({ error: "Invalid or expired token" });
        }

        // Upsert user in our DB to ensure they exist
        // This syncs Supabase auth user with our local User table
        let dbUser = await prisma.user.findUnique({
            where: { id: user.id },
        });

        if (!dbUser) {
            dbUser = await prisma.user.create({
                data: {
                    id: user.id,
                    email: user.email,
                },
            });
        }

        req.user = dbUser;
        next();
    } catch (error) {
        logger.error("Auth middleware error", error);
        res.status(500).json({ error: "Authentication failed" });
    }
};
