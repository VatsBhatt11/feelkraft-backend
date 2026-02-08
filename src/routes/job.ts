import { Router } from "express";
import { prisma } from "../utils/prisma.js";
import { logger } from "../utils/logger.js";
import { cacheGet, cacheSet } from "../services/redis.js";

const router = Router();

// Get job status
router.get("/:id/status", async (req, res) => {
    const { id } = req.params;
    const cacheKey = `job:${id}:status`;

    try {
        // Try cache first
        const cached = await cacheGet(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        const job = await prisma.comicJob.findUnique({
            where: { id },
            include: {
                logs: {
                    orderBy: { pageNum: "asc" },
                },
            },
        });

        if (!job) {
            return res.status(404).json({ error: "Job not found" });
        }

        const completedPages = job.logs.filter((log) => log.status === "success").length;
        const progress = Math.round((completedPages / job.pageCount) * 100);

        const responseData = {
            id: job.id,
            status: job.status,
            pageCount: job.pageCount,
            completedPages,
            progress,
            generatedImages: job.generatedImages,
            pdfUrl: job.pdfUrl,
            createdAt: job.createdAt,
        };

        // Cache for 3 seconds (short TTL for polling)
        await cacheSet(cacheKey, responseData, 3);

        res.json(responseData);
    } catch (error) {
        logger.error("Failed to get job status", error);
        res.status(500).json({ error: "Failed to get job status" });
    }
});

// Get download URL
router.get("/:id/download", async (req, res) => {
    const { id } = req.params;

    try {
        const job = await prisma.comicJob.findUnique({
            where: { id },
        });

        if (!job) {
            return res.status(404).json({ error: "Job not found" });
        }

        if (job.status !== "COMPLETED") {
            return res.status(400).json({
                error: "Job not complete",
                status: job.status
            });
        }

        if (!job.pdfUrl) {
            return res.status(404).json({ error: "PDF not available" });
        }

        res.json({
            downloadUrl: job.pdfUrl,
            pageCount: job.pageCount,
        });
    } catch (error) {
        logger.error("Failed to get download URL", error);
        res.status(500).json({ error: "Failed to get download URL" });
    }
});

// List all jobs (for gallery)
router.get("/list", async (req, res) => {
    const cacheKey = "gallery:list";

    try {
        // Try cache first
        const cached = await cacheGet(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        const jobs = await prisma.comicJob.findMany({
            orderBy: { createdAt: "desc" },
            take: 50,
            include: {
                logs: {
                    orderBy: { pageNum: "asc" },
                },
            },
        });

        const jobsWithProgress = jobs.map((job) => {
            const completedPages = job.logs.filter((log) => log.status === "success").length;
            const progress = Math.round((completedPages / job.pageCount) * 100);
            return {
                id: job.id,
                status: job.status,
                pageCount: job.pageCount,
                completedPages,
                progress,
                generatedImages: job.generatedImages,
                pdfUrl: job.pdfUrl,
                createdAt: job.createdAt,
                theme: job.theme,
                style: job.style,
            };
        });

        const responseData = { jobs: jobsWithProgress };

        // Cache for 30 seconds
        await cacheSet(cacheKey, responseData, 30);

        res.json(responseData);
    } catch (error) {
        logger.error("Failed to list jobs", error);
        res.status(500).json({ error: "Failed to list jobs" });
    }
});

export const jobRouter = router;
