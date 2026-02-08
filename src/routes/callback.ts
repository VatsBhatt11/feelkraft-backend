import { Router } from "express";
import { prisma } from "../utils/prisma.js";
import { logger } from "../utils/logger.js";

const router = Router();

interface NanoBananaCallback {
    code: number;
    msg: string;
    data: {
        taskId: string;
        model: string;
        state: "waiting" | "success" | "fail";
        param: string;
        resultJson: string | null;
        failCode: string | null;
        failMsg: string | null;
        costTime: number | null;
        completeTime: number | null;
        createTime: number;
    };
}

// Callback endpoint for Nano Banana API
router.post("/", async (req, res) => {
    const callback = req.body as NanoBananaCallback;

    logger.info("Received callback", {
        taskId: callback.data.taskId,
        state: callback.data.state
    });

    try {
        // Find the generation log by taskId
        const log = await prisma.generationLog.findFirst({
            where: { taskId: callback.data.taskId },
            include: { job: true },
        });

        if (!log) {
            logger.warn("Callback for unknown task", { taskId: callback.data.taskId });
            return res.status(404).json({ error: "Task not found" });
        }

        if (callback.data.state === "success" && callback.data.resultJson) {
            const result = JSON.parse(callback.data.resultJson) as { resultUrls: string[] };

            // Update the log
            await prisma.generationLog.update({
                where: { id: log.id },
                data: {
                    status: "success",
                    resultUrl: result.resultUrls[0],
                    costTime: callback.data.costTime,
                },
            });

            // Check if all pages are complete
            const job = await prisma.comicJob.findUnique({
                where: { id: log.jobId },
                include: { logs: true },
            });

            if (job) {
                const completedLogs = job.logs.filter((l) => l.status === "success");

                if (completedLogs.length === job.pageCount) {
                    // All pages complete, mark job as completed
                    const imageUrls = completedLogs
                        .sort((a, b) => a.pageNum - b.pageNum)
                        .map((l) => l.resultUrl!)
                        .filter(Boolean);

                    // Update job to COMPLETED (PDF will be generated on-demand for download)
                    await prisma.comicJob.update({
                        where: { id: job.id },
                        data: {
                            status: "COMPLETED",
                            generatedImages: imageUrls,
                            // pdfUrl is NOT stored - PDF generated on-demand only
                        },
                    });

                    logger.info("Job completed via callback", { jobId: job.id });
                }
            }
        } else if (callback.data.state === "fail") {
            // Mark as failed
            await prisma.generationLog.update({
                where: { id: log.id },
                data: {
                    status: "fail",
                    error: callback.data.failMsg,
                },
            });

            await prisma.comicJob.update({
                where: { id: log.jobId },
                data: { status: "FAILED" },
            });

            logger.error("Task failed via callback", {
                taskId: callback.data.taskId,
                failMsg: callback.data.failMsg
            });
        }

        res.json({ received: true });
    } catch (error) {
        logger.error("Callback processing failed", error);
        res.status(500).json({ error: "Callback processing failed" });
    }
});

export const callbackRouter = router;
