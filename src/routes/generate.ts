import { Router } from "express";
import { prisma } from "../utils/prisma.js";
import { nanoBananaService } from "../services/nanoBanana.js";
import { pdfGeneratorService } from "../services/pdfGenerator.js";
import { validateBody, generateSchema, type GenerateRequest } from "../middleware/validation.js";
import { freeUserLimiter, generationLimiter } from "../middleware/rateLimit.js";
import { buildFreePreviewPrompt } from "../utils/prompts.js";
import { logger } from "../utils/logger.js";
import { storageService } from "../services/storage.js";
import { paymentService } from "../services/payment.js";
import { groqService } from "../services/groq.js";

import { authenticateUser } from "../middleware/auth.js";

const router = Router();

// Free preview: 1 page comic
router.post(
    "/preview",
    authenticateUser, // Require auth
    freeUserLimiter,
    validateBody(generateSchema),
    async (req, res) => {
        const body = req.body as GenerateRequest;
        const user = req.user;

        // Check explicit free limit from DB (trusted source of truth)
        if (user.freeGenerationsCount >= 1 && !user.isPro) {
            return res.status(403).json({
                error: "Free limit reached",
                message: "You have already used your free generation. Please upgrade to create more."
            });
        }

        try {
            // Create job in database
            const job = await prisma.comicJob.create({
                data: {
                    userId: user.id, // Link to user
                    image1Url: body.image1Url,
                    image2Url: body.image2Url,
                    theme: body.theme,
                    style: body.style,
                    prompt: body.story,
                    pageCount: 1,
                    status: "GENERATING",
                },
            });

            // Increment free generation count atomically
            await prisma.user.update({
                where: { id: user.id },
                data: { freeGenerationsCount: { increment: 1 } }
            });

            logger.info("Free preview job created", { jobId: job.id, userId: user.id });

            // Generate prompt and call API
            const prompt = buildFreePreviewPrompt(
                body.theme,
                body.style,
                body.story,
                body.character1Name,
                body.character2Name,
                body.relationship,
                body.tone
            );

            const taskId = await nanoBananaService.createTask({
                prompt,
                imageUrls: [body.image1Url, body.image2Url],
                aspectRatio: "3:4",
                resolution: "2K",
            });

            // Log the generation task
            await prisma.generationLog.create({
                data: {
                    jobId: job.id,
                    taskId,
                    pageNum: 1,
                    status: "waiting",
                },
            });

            // Start polling in background (don't await)
            pollAndComplete(job.id, [taskId]).catch((err) => {
                logger.error("Background polling failed", { jobId: job.id, error: err });
            });

            res.json({ jobId: job.id });
        } catch (error) {
            logger.error("Preview generation failed", error);
            res.status(500).json({ error: "Generation failed" });
        }
    }
);

// Full comic: 10 pages (requires payment)
router.post(
    "/full",
    generationLimiter,
    validateBody(generateSchema),
    async (req, res) => {
        const body = req.body as GenerateRequest;

        const paymentToken = req.headers["x-payment-token"] as string;
        if (!paymentToken) {
            return res.status(402).json({
                error: "Payment required",
                message: "Full comic generation requires purchase"
            });
        }

        try {
            const decoded = JSON.parse(Buffer.from(paymentToken, "base64").toString());
            // In a real app, you would verify the signature of the token itself or check DB
            // For now, we trust the token if it has a valid structure and recent timestamp
            if (!decoded.paymentId || !decoded.orderId || Date.now() - decoded.timestamp > 3600000) {
                throw new Error("Invalid or expired payment token");
            }
            logger.info("Payment verified", { paymentId: decoded.paymentId });
        } catch (error) {
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

            const slogan = body.quote || "Love is a journey we take together."; // Default/Auto slogan placeholder if empty

            // Create job in database
            job = await prisma.comicJob.create({
                data: {
                    image1Url: body.image1Url,
                    image2Url: body.image2Url,
                    theme: body.theme,
                    style: body.style,
                    prompt: body.story,
                    character1Name: body.character1Name,
                    character2Name: body.character2Name,
                    pageCount: 7, // 1 Front + 5 Story + 1 Back
                    status: "GENERATING",
                },
            });

            logger.info("Full comic job created", { jobId: job.id });

            // Generate all prompts with full context using Groq
            // We need 7 distinct panels: 
            // 1. Front Cover (Title "Our ...")
            // 2-6. Story pages (5 pages)
            // 7. Back Cover (Conclusion + Quote)

            const fullStoryPrompt = `
            Story: ${body.story}
            Characters: ${body.character1Name} and ${body.character2Name}
            Relationship: ${body.relationship}
            Tone: ${body.tone}
            Slogan/Title for Back Cover: "${slogan}"
            
            Task: Break this story into exactly 5 sequential comic book page descriptions.
            Plus create a visual description for a Front Cover (Title starting with "Our...") and a Back Cover (Conclusion).
            
            CRITICAL SAFETY INSTRUCTION: You are a PG-13 comic generator. DO NOT generate nudity, sexual content, gore, or extreme violence. If the story contains such themes, tone them down to be suggestive but safe, or refuse if impossible.
            
            Requirements:
            1. Front Cover: Visual description suitable for a cover. Title should be creative related to "Our...".
            2. Pages 1-5: Each page must be described as having a 5-panel layout. 
               - CRITICAL: At least 3 panels on EVERY page must have meaningful dialogue or narration relevant to the story on that page.
               - Ensure consistent storytelling across pages.
            3. Back Cover: A Great Happy Ending visual. 
               - CRITICAL: NO dialogues on the back cover.
               - The only text should be the slogan: "${slogan}".
               - If the user didn't provide a slogan, generate a short, romantic/meaningful 3-5 word slogan for the back cover yourself.
            
            Return a JSON object with exactly this structure:
            {
              "frontCover": "Visual description of the front cover...",
              "pages": ["Description for page 1", "Description for page 2", ... (5 total)],
              "backCover": "Visual description of the back cover including the slogan...",
              "generatedSlogan": "The slogan you used (either provided or generated)"
            }
            Make sure the descriptions are visual and suitable for an AI image generator.
            `;

            const storyStructure = await groqService.generateStoryStructure(fullStoryPrompt);

            // If Groq fails or returns invalid format, fallback is needed (omitted for brevity)

            // Use the slogan returned by AI (in case it generated one) or the input one
            const finalSlogan = storyStructure.generatedSlogan || slogan;

            const prompts = [
                `Front cover of a comic book. Title text "Our ${body.theme}". ${storyStructure.frontCover} --ar 3:4`,
                ...storyStructure.pages.map((desc: string, i: number) => `Comic page ${i + 1}, 5 panel layout. ${desc} --ar 3:4`),
                `Back cover of a comic book. ${storyStructure.backCover} Text "${finalSlogan}" at the bottom. --ar 3:4`
            ];

            // Create all tasks (10 API calls)
            const taskIds: string[] = [];
            for (let i = 0; i < prompts.length; i++) {
                const taskId = await nanoBananaService.createTask({
                    prompt: prompts[i],
                    imageUrls: [body.image1Url, body.image2Url],
                    aspectRatio: "3:4",
                    resolution: "2K",
                });
                taskIds.push(taskId);

                await prisma.generationLog.create({
                    data: {
                        jobId: job.id,
                        taskId,
                        pageNum: i + 1,
                        status: "waiting",
                    },
                });
            }

            // Start polling in background
            pollAndComplete(job.id, taskIds).catch((err) => {
                logger.error("Background polling failed", { jobId: job.id, error: err });
            });

            res.json({ jobId: job.id });
        } catch (error) {
            logger.error("Full generation failed", error);
            console.error("FULL_GENERATION_ERROR", error);

            if (job) {
                try {
                    await prisma.comicJob.update({
                        where: { id: job.id },
                        data: { status: "FAILED" }
                    });
                } catch (dbError) {
                    logger.error("Failed to update job status to FAILED", dbError);
                }
            }

            res.status(500).json({ error: "Generation failed", details: error instanceof Error ? error.message : "Unknown error" });
        }
    }
);

// Stream PDF download (on-demand, no storage saving)
router.get("/:jobId/download-pdf", async (req, res) => {
    const { jobId } = req.params;
    try {
        const job = await prisma.comicJob.findUnique({
            where: { id: jobId },
            select: { generatedImages: true, character1Name: true, character2Name: true }
        });

        if (!job || !job.generatedImages || job.generatedImages.length === 0) {
            return res.status(404).json({ error: "Comic not found or not ready" });
        }

        const pdfBuffer = await pdfGeneratorService.generatePdfBuffer(job.generatedImages, true);

        res.setHeader("Content-Type", "application/pdf");
        const filename = `${job.character1Name || "Character1"}-${job.character2Name || "Character2"}_story.pdf`;
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

    try {
        // Poll all tasks
        for (let i = 0; i < taskIds.length; i++) {
            const taskId = taskIds[i];
            const results = await nanoBananaService.pollUntilComplete(taskId);

            // Update log
            await prisma.generationLog.update({
                where: { id: (await prisma.generationLog.findFirst({ where: { taskId } }))?.id },
                data: {
                    status: "success",
                    resultUrl: results[0],
                },
            });

            imageUrls.push(results[0]);
        }

        // Update job as completed (without PDF URL)
        await prisma.comicJob.update({
            where: { id: jobId },
            data: {
                status: "COMPLETED",
                generatedImages: imageUrls,
                // pdfUrl is no longer stored
            },
        });

        logger.info("Job completed", { jobId, pageCount: imageUrls.length });

        // Cleanup source images after successful generation
        const job = await prisma.comicJob.findUnique({
            where: { id: jobId },
            select: { image1Url: true, image2Url: true }
        });

        if (job) {
            await storageService.deleteFiles([job.image1Url, job.image2Url]);
        }

    } catch (error) {
        logger.error("Job failed", { jobId, error });

        await prisma.comicJob.update({
            where: { id: jobId },
            data: { status: "FAILED" },
        });
    }
}

export const generateRouter = router;
