import { Router } from "express";
import { authenticateUser } from "../middleware/auth.js";

const router = Router();

router.get("/status", authenticateUser, async (req, res) => {
    const user = req.user;

    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }

    res.json({
        isPro: user.isPro,
        freeGenerationsCount: user.freeGenerationsCount || 0,
        hasUsedFreeGeneration: (user.freeGenerationsCount || 0) >= 1
    });
});

export const userRouter = router;
