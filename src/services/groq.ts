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
                            content: "You are a professional comic book writer. Your task is to refine and improve personal stories into engaging, concise, and descriptive scripts for short comic books. Focus on emotional impact and visual clarity.\n\nHOLI FESTIVAL INTEGRATION: If the user provides a very short or vague story, automatically default the setting to a vibrant, traditional Indian Holi festival celebration (involving colors, water balloons/pichkaris, joy, and festive atmosphere). If they provide a detailed story, seamlessly blend authentic Holi elements into their existing narrative without losing their core message. Keep the response under 500 characters and maintain the first-person perspective if used.",
                        },
                        {
                            role: "user",
                            content: `Refine this memory into a more poetic and descriptive comic book script, incorporating elements of the Indian Holi festival: "${story}"`,
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
                            content: `You are a professional comic book writer and visual director.                             Your task is to take a story and break it down into a highly professional comic book structure.
                            Return ONLY valid JSON with no markdown formatting or extra text.
                            
                            QUALITY GUIDELINES:
                            - Front Cover Title: MUST be a unique, creative, and specific title that captures the core essence of the user's specific story details (e.g., if they met at a library, "The Librarian's Secret"; if it's about a trip, "Destination: Forever"). ABSOLUTELY NO generic titles like "Our Story" or "My Life".
                            - Dialogue: Ensure all dialogues are natural, emotionally resonant, and written in clear, correct English. Avoid any gibberish or nonsensical phrases.
                            - Panel Layout: Describe 5 panels for each page that show a clear progression of the narrative.
                            
                            The JSON structure must be:
                            {
                              "frontCoverTitle": "A highly specific, creative title based on story details",
                              "frontCover": "Cinematic visual description for the cover...",
                              "pages": ["Detailed 5-panel page description with character dialogues...", "Page 2...", "Page 3...", "Page 4...", "Page 5..."],
                              "backCover": "Satisfying conclusion visual description...",
                              "generatedSlogan": "A 3-5 word poetic slogan"
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
