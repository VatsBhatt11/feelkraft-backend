import { prisma } from "../utils/prisma.js";
import { storageService } from "../services/storage.js";
import { logger } from "../utils/logger.js";
import cron from "node-cron";

export class CleanupService {
    constructor() {
        this.startCronJob();
    }

    private startCronJob() {
        // Run every hour
        cron.schedule("0 * * * *", async () => {
            logger.info("Starting cleanup job...");
            await this.cleanupAbandonedJobs();
        });
    }

    async cleanupAbandonedJobs() {
        try {
            // Find jobs created > 24 hours ago that are not COMPLETED
            // Or jobs that are pending/generating for too long
            const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

            const jobs = await prisma.comicJob.findMany({
                where: {
                    createdAt: {
                        lt: cutoffDate,
                    },
                    // We can cleanup ANY source images after 24 hours, even for completed jobs
                    // The source images are temporary uploads
                },
                select: {
                    id: true,
                    image1Url: true,
                    image2Url: true,
                },
            });

            if (jobs.length === 0) {
                logger.info("No jobs to cleanup");
                return;
            }

            logger.info(`Found ${jobs.length} jobs to cleanup`);

            for (const job of jobs) {
                // Delete source images
                await storageService.deleteFiles([job.image1Url, job.image2Url]);
            }

            // Optional: Mark jobs as expired or delete them? 
            // For now, we just delete the files to save space/privacy

            logger.info("Cleanup job completed");
        } catch (error) {
            logger.error("Cleanup job failed", error);
        }
    }
}

export const cleanupService = new CleanupService();
