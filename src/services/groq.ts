import { logger } from "../utils/logger.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

interface StoryStructure {
    frontCoverTitle?: string;
    frontCover: string;
    pages: string[];
    backCover: string;
    generatedSlogan?: string;
}

export class GroqService {
    private apiKey: string;

    constructor() {
        this.apiKey = process.env.GROQ_API_KEY || "";
    }

    async refineStory(story: string): Promise<string> {
        if (!this.apiKey) {
            logger.warn("GROQ_API_KEY not set, returning original story");
            return story;
        }

        try {
            const response = await fetch(GROQ_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile", // High quality, available on Groq
                    messages: [
                        {
                            role: "system",
                            content: "You are a professional comic book writer. Your task is to refine and improve personal stories into engaging, concise, and descriptive scripts for short comic books. Focus on emotional impact and visual clarity. Keep the response under 500 characters and maintain the first-person perspective if used.",
                        },
                        {
                            role: "user",
                            content: `Refine this memory into a more poetic and descriptive comic book script: "${story}"`,
                        },
                    ],
                    temperature: 0.7,
                    max_tokens: 300,
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                logger.error("Groq API error", { error });
                return story;
            }

            const data = (await response.json()) as any;
            return data.choices[0]?.message?.content?.trim() || story;
        } catch (error) {
            logger.error("Failed to refine story with Groq", error);
            return story;
        }
    }
    async generateStoryStructure(prompt: string): Promise<StoryStructure> {
        if (!this.apiKey) {
            throw new Error("GROQ_API_KEY not set");
        }

        try {
            const response = await fetch(GROQ_API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: "llama-3.3-70b-versatile",
                    messages: [
                        {
                            role: "system",
                            content: `You are a professional comic book writer and visual director. 
                            Your task is to take a story and break it down into a specific visual structure for an AI image generator.
                            Return ONLY valid JSON with no markdown formatting or extra text.
                            The JSON structure must be:
                            {
                              "frontCoverTitle": "A creative title",
                              "frontCover": "Visual description...",
                              "pages": ["Page 1 desc", "Page 2 desc", ...],
                              "backCover": "Visual description...",
                              "generatedSlogan": "Short slogan"
                            }`,
                        },
                        {
                            role: "user",
                            content: prompt,
                        },
                    ],
                    temperature: 0.7,
                    max_tokens: 1500,
                    response_format: { type: "json_object" }
                }),
            });

            if (!response.ok) {
                const text = await response.text();
                logger.error("Groq API error", { text });
                throw new Error(`Groq API error: ${response.statusText}`);
            }

            const data = (await response.json()) as any;
            const content = data.choices[0]?.message?.content;

            if (!content) throw new Error("No content from Groq");

            return JSON.parse(content);
        } catch (error) {
            logger.error("Failed to generate story structure", error);
            // Fallback structure if AI fails
            return {
                frontCover: "A beautiful comic book cover art suitable for the story.",
                pages: Array(8).fill("A comic book page depicting a scene from the story."),
                backCover: "A conclusion scene with a quote."
            };
        }
    }
}

export const groqService = new GroqService();
