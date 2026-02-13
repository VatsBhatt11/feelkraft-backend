import { Router } from "express";
import { prisma } from "../utils/prisma.js";
import { nanoBananaService } from "../services/nanoBanana.js";
import { pdfGeneratorService } from "../services/pdfGenerator.js";
import { validateBody, generateSchema, type GenerateRequest } from "../middleware/validation.js";
import { generationLimiter } from "../middleware/rateLimit.js";
import { buildSinglePagePrompt, styleSettings } from "../utils/prompts.js";
import { logger } from "../utils/logger.js";
import { storageService } from "../services/storage.js";
import { paymentService } from "../services/payment.js";
import { groqService } from "../services/groq.js";

import { authenticateUser } from "../middleware/auth.js";

const router = Router();

// Single page comic (requires ₹9 payment)
router.post(
    "/preview",
    authenticateUser,
    generationLimiter,
    validateBody(generateSchema),
    async (req, res) => {
        const body = req.body as GenerateRequest;
        const user = req.user;

        const paymentToken = req.headers["x-payment-token"] as string;
        if (!paymentToken) {
            return res.status(402).json({
                error: "Payment required",
                message: "Single page generation requires purchase"
            });
        }

        try {
            const decoded = JSON.parse(Buffer.from(paymentToken, "base64").toString());
            const amount = Number(decoded.amount);
            if (!decoded.paymentId || !decoded.orderId || amount !== 9 || Date.now() - decoded.timestamp > 3600000) {
                logger.warn("Invalid payment token details", { decoded });
                throw new Error("Invalid or expired payment token for single page");
            }
            logger.info("Payment verified for single page", { paymentId: decoded.paymentId });
        } catch (error) {
            logger.error("Payment token verification failed", { error });
            return res.status(403).json({ error: "Invalid payment token" });
        }

        try {
            logger.info("Creating job for user", { userId: user.id });

            // Create job in database
            const job = await prisma.comicJob.create({
                data: {
                    userId: body.userId,
                    image1Url: body.image1Url,
                    image2Url: body.image2Url,
                    theme: body.theme,
                    style: body.style,
                    prompt: body.story,
                    pageCount: 1,
                    status: "GENERATING",
                },
            });

            // Link payment
            try {
                const decodedToken = JSON.parse(Buffer.from(paymentToken, "base64").toString());
                if (decodedToken.paymentId) {
                    await prisma.payment.update({
                        where: { paymentId: decodedToken.paymentId },
                        data: { comicJobId: job.id }
                    });
                }
            } catch (e) { }

            logger.info("Single page job created", { jobId: job.id, userId: user.id });

            // Generate prompt
            const prompt = buildSinglePagePrompt(
                body.theme,
                body.style,
                body.story,
                body.character1Name,
                body.character2Name,
                body.relationship,
                body.tone || "romantic"
            );

            // 4. Kickoff AI processing in background
            runPreviewGeneration(job.id, prompt, [body.image1Url, body.image2Url]).catch(err => {
                logger.error("Background preview generation kickoff failed", { jobId: job.id, error: err });
            });

            // 5. Return jobId instantly
            res.json({ jobId: job.id });
        } catch (error) {
            logger.error("Single page generation initialization failed", error);
            res.status(500).json({ error: "Generation failed" });
        }
    }
);

// Background helper for single page generation
async function runPreviewGeneration(jobId: string, prompt: string, imageUrls: string[]) {
    try {
        const taskId = await nanoBananaService.createTask({
            prompt,
            imageUrls,
            aspectRatio: "3:4",
            resolution: "1K",
        });

        await prisma.generationLog.create({
            data: {
                jobId,
                taskId,
                pageNum: 1,
                status: "waiting",
            },
        });

        await pollAndComplete(jobId, [taskId]);
    } catch (error) {
        logger.error("Background preview generation failed", { jobId, error });
    }
}



// Background helper for full generation to keep API response instant
async function runFullGeneration(jobId: string, body: any) {
    try {
        const slogan = body.quote || "Love is a journey we take together.";

        // Generate all prompts with full context using Groq
        const fullStoryPrompt = `
        Story: ${body.story}
        Characters: ${body.character1Name} and ${body.character2Name}
        Relationship: ${body.relationship}
        Tone: ${body.tone}
        Slogan/Quote for Back Cover: "${slogan}"
        
        Task: Break this story into exactly 5 sequential comic book page descriptions.
        Plus create a visual description for a Front Cover and a Back Cover (Conclusion).
        
        CRITICAL SAFETY INSTRUCTION: You are a PG-13 comic generator. DO NOT generate nudity, sexual content, gore, or extreme violence. If the story contains such themes, tone them down to be suggestive but safe, or refuse if impossible.
        
        Requirements:
        1. Front Cover: Visual description suitable for a cover. Generate a creative title for the front cover that is RELEVANT to the story details (e.g. "A Night in Paris", "The Lost Key of Love", etc.). DO NOT simply use "Our Romantic Story".
        2. Pages 1-5: Each page must be described as having a 5-panel layout. 
           - CRITICAL: At least 3 panels on EVERY page must have meaningful dialogue or narration relevant to the story on that page.
           - Ensure consistent storytelling across pages.
        3. Back Cover: A Great Happy Ending visual. 
           - CRITICAL: NO dialogues on the back cover.
        
        Return a JSON object with exactly this structure:
        {
          "frontCoverTitle": "A creative title related to the story",
          "frontCover": "Visual description of the front cover (visual details only, no text descriptions)...",
          "pages": ["Description for page 1", "Description for page 2", ... (5 total)],
          "backCover": "Visual description of the back cover (visual details only, no text or slogan descriptions)...",
          "generatedSlogan": "The slogan/quote you used (either the provided one or a new 3-5 word poetic one if the provided one was too long or generic)"
        }
        Make sure the descriptions are visual and suitable for an AI image generator. DO NOT describe text or titles INSIDE the visual descriptions as they will be added separately.
        `;

        const storyStructure = await groqService.generateStoryStructure(fullStoryPrompt);
        const finalSlogan = storyStructure.generatedSlogan || slogan;
        const artStyle = styleSettings[body.style] || "";
        const finalTitle = storyStructure.frontCoverTitle || `Our ${body.theme} Story`;

        const prompts = [
            `Front cover of a comic book in ${artStyle} style. Title text "${finalTitle}". ${storyStructure.frontCover} --ar 3:4`,
            ...storyStructure.pages.map((desc: string, i: number) => `Comic page ${i + 1} in ${artStyle} style, 5 panel layout. ${desc} --ar 3:4`),
            `Back cover of a comic book in ${artStyle} style. ${storyStructure.backCover} Text "${finalSlogan}" at the bottom. NO ISBN, NO BARCODE. --ar 3:4`
        ];

        // Create all tasks
        const taskIds: string[] = [];
        for (let i = 0; i < prompts.length; i++) {
            const taskId = await nanoBananaService.createTask({
                prompt: prompts[i],
                imageUrls: [body.image1Url, body.image2Url],
                aspectRatio: "3:4",
                resolution: "1K",
            });

            await prisma.generationLog.create({
                data: {
                    jobId,
                    taskId,
                    pageNum: i + 1,
                    status: "waiting",
                },
            });
            taskIds.push(taskId);
        }

        // Start background polling
        pollAndComplete(jobId, taskIds).catch((err) => {
            logger.error("Background polling failed", { jobId, error: err });
        });

    } catch (error) {
        logger.error("Background full generation processing failed", { jobId, error });
        await prisma.comicJob.update({
            where: { id: jobId },
            data: { status: "FAILED" }
        });
    }
}

// Full comic: 7 pages (requires ₹99 payment)
router.post(
    "/full",
    authenticateUser,
    generationLimiter,
    validateBody(generateSchema),
    async (req, res) => {
        const body = req.body as GenerateRequest;
        const user = req.user;

        const paymentToken = req.headers["x-payment-token"] as string;
        if (!paymentToken) {
            return res.status(402).json({
                error: "Payment required",
                message: "Full comic generation requires purchase"
            });
        }

        try {
            const decoded = JSON.parse(Buffer.from(paymentToken, "base64").toString());
            const amount = Number(decoded.amount);
            const validAmount = amount === 99 || amount === 90;

            if (!decoded.paymentId || !decoded.orderId || !validAmount || Date.now() - decoded.timestamp > 3600000) {
                logger.warn("Invalid full comic payment token", { decoded });
                throw new Error("Invalid or expired payment token for full comic");
            }
            logger.info("Payment verified for full comic", { paymentId: decoded.paymentId, amount });
        } catch (error) {
            logger.error("Payment token verification failed", { error });
            return res.status(403).json({ error: "Invalid payment token" });
        }

        let job: any;

        try {
            if (!body.story) {
                return res.status(400).json({ error: "Story is required" });
            }

            // 1. Basic NSFW Guardrail (Keyword-based)
            const nsfwKeywords = ["nude", "naked", "sex", "porn", "xxx", "nsfw", "erotic", "killing", "murder", "blood", "gore"];
            const lowerStory = body.story.toLowerCase();
            if (nsfwKeywords.some(keyword => lowerStory.includes(keyword))) {
                return res.status(400).json({ error: "Content flagged as inappropriate. Please keep stories PG-13." });
            }

            logger.info("Creating full comic job for user", { userId: user.id });

            // 2. Create job in database immediately
            job = await prisma.comicJob.create({
                data: {
                    userId: body.userId,
                    image1Url: body.image1Url,
                    image2Url: body.image2Url,
                    theme: body.theme,
                    style: body.style,
                    prompt: body.story,
                    character1Name: body.character1Name,
                    character2Name: body.character2Name,
                    pageCount: 7,
                    status: "GENERATING",
                },
            });

            logger.info("Full comic job created", { jobId: job.id });

            // 3. Link payment to job in DB
            try {
                const decodedToken = JSON.parse(Buffer.from(paymentToken, "base64").toString());
                if (decodedToken.paymentId) {
                    await prisma.payment.update({
                        where: { paymentId: decodedToken.paymentId },
                        data: { comicJobId: job.id }
                    });
                    logger.info("Payment linked to job", { paymentId: decodedToken.paymentId, jobId: job.id });
                }
            } catch (linkError) {
                logger.warn("Failed to link payment to job", { error: linkError, jobId: job.id });
            }

            // 4. Kickoff AI processing in background
            runFullGeneration(job.id, body).catch(err => {
                logger.error("Background full generation kickoff failed", { jobId: job.id, error: err });
            });

            // 5. Return jobId instantly
            res.json({ jobId: job.id });
        } catch (error) {
            logger.error("Comic generation initialization failed", error);
            res.status(500).json({ error: "Generation failed" });
        }
    }
);

// Stream PDF download (on-demand, no storage saving)
router.get("/:jobId/download-pdf", async (req, res) => {
    const { jobId } = req.params;
    try {
        const job = await prisma.comicJob.findUnique({
            where: { id: jobId },
            select: { generatedImages: true, character1Name: true, character2Name: true, style: true }
        });

        if (!job || !job.generatedImages || job.generatedImages.length === 0) {
            return res.status(404).json({ error: "Comic not found or not ready" });
        }

        const pdfBuffer = await pdfGeneratorService.generatePdfBuffer(job.generatedImages, true);

        res.setHeader("Content-Type", "application/pdf");
        const filename = `${job.character1Name || "Character1"}_${job.character2Name || "Character2"}_${job.style}.pdf`;
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.send(pdfBuffer);
    } catch (error) {
        logger.error("PDF download failed", { jobId, error });
        res.status(500).json({ error: "Failed to generate PDF" });
    }
});



// Background polling and completion
async function pollAndComplete(jobId: string, taskIds: string[]) {
    const imageUrls: string[] = [];
    let failureCount = 0;

    // Poll all tasks individually, preventing one failure from stopping others
    for (let i = 0; i < taskIds.length; i++) {
        const taskId = taskIds[i];

        try {
            const results = await nanoBananaService.pollUntilComplete(taskId);
            const externalUrl = results[0];

            logger.info("Using Kie URL directly", { taskId, url: externalUrl });

            // Update log to success with Kie URL
            await prisma.generationLog.update({
                where: { id: (await prisma.generationLog.findFirst({ where: { taskId } }))?.id },
                data: {
                    status: "success",
                    resultUrl: externalUrl,
                },
            });

            imageUrls.push(externalUrl);
        } catch (taskError) {
            logger.error("Individual task failed", { jobId, taskId, error: taskError });
            failureCount++;

            // Update log to failed
            await prisma.generationLog.update({
                where: { id: (await prisma.generationLog.findFirst({ where: { taskId } }))?.id },
                data: {
                    status: "failed",
                    error: String(taskError)
                },
            });
            // We continue to the next task instead of throwing
        }
    }

    // Determine final job status
    try {
        if (imageUrls.length > 0) {
            // Success or Partial Success
            await prisma.comicJob.update({
                where: { id: jobId },
                data: {
                    status: "COMPLETED", // Treated as completed so user sees what was generated
                    generatedImages: imageUrls,
                },
            });

            if (failureCount > 0) {
                logger.warn("Job completed with partial failures", { jobId, successCount: imageUrls.length, failureCount });
            } else {
                logger.info("Job completed successfully", { jobId, pageCount: imageUrls.length });
            }

            // Cleanup source images after generation (even partial)
            const job = await prisma.comicJob.findUnique({
                where: { id: jobId },
                select: { image1Url: true, image2Url: true }
            });

            if (job) {
                await storageService.deleteFiles([job.image1Url, job.image2Url]);
            }
        } else {
            // Total Failure (0 images generated)
            logger.error("Job failed completely - no images generated", { jobId });
            await prisma.comicJob.update({
                where: { id: jobId },
                data: { status: "FAILED" },
            });
        }
    } catch (dbError) {
        logger.error("Failed to update final job status", { jobId, error: dbError });
    }
}

export const generateRouter = router;
