import { Router } from "express";
import { groqService } from "../services/groq.js";
import { logger } from "../utils/logger.js";

const router = Router();

router.post("/", async (req, res) => {
    const { story } = req.body;

    if (!story) {
        return res.status(400).json({ error: "Story is required" });
    }

    try {
        const refinedStory = await groqService.refineStory(story);
        res.json({ refinedStory });
    } catch (error) {
        logger.error("Refine route error", error);
        res.status(500).json({ error: "Failed to refine story" });
    }
});

export const refineRouter = router;
