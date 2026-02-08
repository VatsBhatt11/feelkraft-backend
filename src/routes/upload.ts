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
    upload.fields([
        { name: "image1", maxCount: 1 },
        { name: "image2", maxCount: 1 },
    ]),
    async (req, res) => {
        try {
            const files = req.files as { [fieldname: string]: Express.Multer.File[] };

            if (!files?.image1?.[0] || !files?.image2?.[0]) {
                return res.status(400).json({ error: "Both image1 and image2 are required" });
            }

            const image1 = files.image1[0];
            const image2 = files.image2[0];

            logger.info("Uploading images", {
                image1: image1.originalname,
                image2: image2.originalname,
            });

            // Upload both images to Supabase
            const [image1Url, image2Url] = await Promise.all([
                storageService.uploadImage(image1.buffer, image1.originalname, image1.mimetype),
                storageService.uploadImage(image2.buffer, image2.originalname, image2.mimetype),
            ]);

            res.json({ image1Url, image2Url });
        } catch (error) {
            logger.error("Upload failed", error);
            res.status(500).json({ error: "Upload failed" });
        }
    }
);

export const uploadRouter = router;
