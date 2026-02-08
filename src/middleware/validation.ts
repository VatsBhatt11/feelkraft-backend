import { z } from "zod";
import type { Request, Response, NextFunction } from "express";

export const uploadSchema = z.object({
    // Validated via multer, not body
});

export const generateSchema = z.object({
    image1Url: z.string().url("Invalid image1 URL"),
    image2Url: z.string().url("Invalid image2 URL"),
    theme: z.enum(["romantic", "adventure", "funny", "fantasy", "heartfelt", "nostalgic"]),
    style: z.enum(["ghibli", "disney-pixar", "manga"]),
    story: z.string().max(2000).optional(),
    character1Name: z.string().max(50).optional(),
    character2Name: z.string().max(50).optional(),
    relationship: z.string().max(100).optional(),
    tone: z.enum(["romantic", "funny", "adventure", "heartfelt", "nostalgic"]).optional(),
    quote: z.string().max(200).optional(),
});

export type GenerateRequest = z.infer<typeof generateSchema>;

export function validateBody<T>(schema: z.ZodSchema<T>) {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.body);

        if (!result.success) {
            return res.status(400).json({
                error: "Validation failed",
                details: result.error.errors,
            });
        }

        req.body = result.data;
        next();
    };
}
