import { Router } from "express";
import multer from "multer";
import { storageService } from "../services/storage.js";
import { logger } from "../utils/logger.js";

const router = Router();

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Invalid file type. Only JPEG, PNG, and WebP are allowed."));
        }
    },
});

router.post(
    "/",
    upload.array("images", 6),
    async (req, res) => {
        try {
            const files = req.files as Express.Multer.File[];

            // Ensure at least one image is uploaded (the UI now guarantees this, but safety first)
            if (!files || files.length === 0) {
                return res.status(400).json({ error: "At least one image is required" });
            }

            logger.info(`Uploading ${files.length} images`, {
                filenames: files.map(f => f.originalname)
            });

            // Upload all images to Supabase concurrently
            const uploadPromises = files.map(file =>
                storageService.uploadImage(file.buffer, file.originalname, file.mimetype)
            );

            const imageUrls = await Promise.all(uploadPromises);

            res.json({ imageUrls });
        } catch (error) {
            logger.error("Upload failed", error);
            res.status(500).json({ error: "Upload failed" });
        }
    }
);

export const uploadRouter = router;
