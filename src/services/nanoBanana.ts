import { logger } from "../utils/logger.js";

const API_BASE_URL = "https://api.kie.ai/api/v1/jobs";

interface CreateTaskInput {
    prompt: string;
    imageUrls?: string[];
    aspectRatio?: string;
    resolution?: string;
    outputFormat?: string;
}

interface CreateTaskResponse {
    code: number;
    msg: string;
    data: {
        taskId: string;
    };
}

interface TaskStatusResponse {
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

interface TaskResult {
    resultUrls: string[];
}

export class NanoBananaService {
    private apiKey: string;
    private callbackUrl?: string;

    constructor() {
        this.apiKey = process.env.NANO_BANANA_API_KEY || "";
        this.callbackUrl = process.env.NANO_BANANA_CALLBACK_URL;

        if (!this.apiKey) {
            logger.warn("NANO_BANANA_API_KEY not set");
        }
    }

    private getHeaders(): Record<string, string> {
        return {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.apiKey}`,
        };
    }

    async createTask(input: CreateTaskInput): Promise<string> {
        const body = {
            model: "nano-banana-pro",
            input: {
                prompt: input.prompt,
                image_input: input.imageUrls || [],
                aspect_ratio: input.aspectRatio || "3:4",
                resolution: input.resolution || "2K",
                output_format: input.outputFormat || "png",
            },
            ...(this.callbackUrl && { callBackUrl: this.callbackUrl }),
        };

        logger.info("Creating Nano Banana task", { prompt: input.prompt.substring(0, 100) });

        const response = await fetch(`${API_BASE_URL}/createTask`, {
            method: "POST",
            headers: this.getHeaders(),
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error("Nano Banana API error", { status: response.status, error: errorText });
            throw new Error(`API error: ${response.status} - ${errorText}`);
        }

        const result = (await response.json()) as CreateTaskResponse;

        if (result.code !== 200) {
            throw new Error(`API returned error: ${result.msg}`);
        }

        logger.info("Task created", { taskId: result.data.taskId });
        return result.data.taskId;
    }

    async getTaskStatus(taskId: string): Promise<TaskStatusResponse["data"]> {
        const response = await fetch(`${API_BASE_URL}/recordInfo?taskId=${taskId}`, {
            method: "GET",
            headers: this.getHeaders(),
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const result = (await response.json()) as TaskStatusResponse;

        if (result.code !== 200) {
            throw new Error(`API returned error: ${result.msg}`);
        }

        return result.data;
    }

    async pollUntilComplete(
        taskId: string,
        maxAttempts = 60,
        intervalMs = 5000
    ): Promise<string[]> {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const status = await this.getTaskStatus(taskId);

            if (status.state === "success" && status.resultJson) {
                const result = JSON.parse(status.resultJson) as TaskResult;
                logger.info("Task completed", { taskId, costTime: status.costTime });
                return result.resultUrls;
            }

            if (status.state === "fail") {
                logger.error("Task failed", { taskId, failCode: status.failCode, failMsg: status.failMsg });
                throw new Error(`Task failed: ${status.failMsg}`);
            }

            // Still waiting, sleep and retry
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }

        throw new Error("Task polling timeout");
    }
}

export const nanoBananaService = new NanoBananaService();
