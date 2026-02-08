interface PromptContext {
    theme: string;
    style: string;
    story?: string;
    character1Name?: string;
    character2Name?: string;
    relationship?: string;
    tone?: string;
    quote?: string;
}

// Theme-specific settings
const themeSettings: Record<string, { mood: string; colors: string; elements: string }> = {
    romantic: {
        mood: "warm, intimate, loving",
        colors: "soft pinks, warm reds, golden hour lighting",
        elements: "hearts, flowers, cozy settings, romantic gestures",
    },
    funny: {
        mood: "playful, humorous, light-hearted",
        colors: "bright and vibrant, cartoon-like",
        elements: "exaggerated expressions, comedic timing, visual gags",
    },
    adventure: {
        mood: "exciting, dynamic, bold",
        colors: "rich and saturated, dramatic lighting",
        elements: "action scenes, travel, discovery, exploration",
    },
    heartfelt: {
        mood: "emotional, touching, sincere",
        colors: "warm earth tones, soft lighting",
        elements: "meaningful moments, genuine emotions, tender gestures",
    },
    nostalgic: {
        mood: "reminiscent, warm memories, sentimental",
        colors: "vintage tones, sepia hints, soft focus",
        elements: "old photographs, memory scenes, past events",
    },
};

// Style-specific art directions
export const styleSettings: Record<string, string> = {
    "disney-pixar": "bright Disney-Pixar inspired movie style, clean lines, vibrant 3D colors, high-end animation aesthetic",
    manga: "Japanese manga style, expressive eyes, dynamic poses, screen tones. Use English text only for any speech bubbles or text.",
    ghibli: "Studio Ghibli inspired anime style, soft painted backgrounds, expressive character designs, whimsical and magical atmosphere",
};

// Segment story into page-specific contexts
function segmentStory(story: string, pageCount: number): string[] {
    if (!story || story.trim().length === 0) {
        return Array(pageCount).fill("");
    }

    const sentences = story.match(/[^.!?]+[.!?]+/g) || [story];
    const segments: string[] = [];
    const sentencesPerPage = Math.ceil(sentences.length / pageCount);

    for (let i = 0; i < pageCount; i++) {
        const start = i * sentencesPerPage;
        const end = Math.min(start + sentencesPerPage, sentences.length);
        const pageContent = sentences.slice(start, end).join(" ").trim();
        segments.push(pageContent || `Continue the story with page ${i + 1}`);
    }

    return segments;
}

// Build base prompt with context
function buildBasePrompt(context: PromptContext): string {
    const theme = themeSettings[context.tone || context.theme] || themeSettings.romantic;
    const artStyle = styleSettings[context.style] || styleSettings.cartoon;

    const char1 = context.character1Name || "Character 1";
    const char2 = context.character2Name || "Character 2";
    const relationship = context.relationship || "romantic partners";

    return `Create a stunning comic book page in ${artStyle} style.
Characters: ${char1} and ${char2} who are ${relationship}.
Mood: ${theme.mood}
Color palette: ${theme.colors}
Visual elements: ${theme.elements}
The characters should look consistent throughout, with ${char1} and ${char2} clearly distinguishable.`;
}

// Free preview: Single page summarizing the story
export function buildFreePreviewPrompt(
    theme: string,
    style: string,
    story?: string,
    character1Name?: string,
    character2Name?: string,
    relationship?: string,
    tone?: string
): string {
    const context: PromptContext = {
        theme,
        style,
        story,
        character1Name,
        character2Name,
        relationship,
        tone,
    };

    const base = buildBasePrompt(context);
    const storyContext = story
        ? `Story summary: ${story.substring(0, 300)}...`
        : "Create a romantic moment between the two characters.";

    return `${base}

Create a single comic page with 5 panels in a zig-zag layout showing:
${storyContext}

This is a teaser/preview page that captures the essence of their story.
Include speech bubbles with heartfelt dialogue.
Make it visually striking as a standalone piece.`;
}

// Full comic: 10 pages (1 front cover + 8 story pages + 1 back cover)
export function buildFullComicPrompts(
    theme: string,
    style: string,
    story?: string,
    character1Name?: string,
    character2Name?: string,
    relationship?: string,
    tone?: string,
    quote?: string
): string[] {
    const context: PromptContext = {
        theme,
        style,
        story,
        character1Name,
        character2Name,
        relationship,
        tone,
        quote,
    };

    const base = buildBasePrompt(context);
    const char1 = character1Name || "Character 1";
    const char2 = character2Name || "Character 2";
    const prompts: string[] = [];

    // Segment story into 8 parts for the story pages
    const storySegments = segmentStory(story || "", 8);

    // Page 1: Front Cover
    prompts.push(`${base}

Create a stunning FRONT COVER for a comic book.
Title: "Our Love Story" or similar romantic title
Feature ${char1} and ${char2} in a dramatic, eye-catching pose.
Include decorative borders, title text area at top.
Make it magazine-cover quality with professional layout.
Style: Bold, striking, romantic cover design.`);

    // Pages 2-9: Story pages (8 pages with 5 panels each)
    const pageDescriptions = [
        "The beginning - how they first met or the start of their journey",
        "Getting to know each other - early moments and discoveries",
        "Growing closer - building connection and trust",
        "A challenge or obstacle they faced together",
        "Overcoming difficulties and growing stronger",
        "Special memories and meaningful moments",
        "Deepening their bond and commitment",
        "The present day - their love continues to grow",
    ];

    for (let i = 0; i < 8; i++) {
        const storyContext = storySegments[i];
        const pageDescription = pageDescriptions[i];

        prompts.push(`${base}

Create comic page ${i + 2} of 10 with 5 PANELS in a ZIG-ZAG LAYOUT.
Panel arrangement: alternating left-to-right, right-to-left reading flow.

Page theme: ${pageDescription}
Story content for this page: ${storyContext}

Each panel should:
- Show ${char1} and ${char2} in various scenes
- Include speech bubbles with meaningful dialogue
- Progress the story naturally
- Use dynamic angles and compositions
- Express emotions clearly through body language and expressions

${quote && i === 4 ? `Include the quote: "${quote}"` : ""}`);
    }

    // Page 10: Back Cover
    prompts.push(`${base}

Create a BACK COVER for the comic book.
Feature a beautiful, emotional scene of ${char1} and ${char2}.
Include a closing message or dedication area.
Can include small vignettes of memorable moments from the story.
Style: Elegant, emotional, satisfying conclusion.
Include space for "The End" or "To Be Continued..." text.`);

    return prompts;
}

// Export for backward compatibility
export { buildFreePreviewPrompt as buildPromptForPage };
