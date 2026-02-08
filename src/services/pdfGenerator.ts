import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { storageService } from "./storage.js";
import { logger } from "../utils/logger.js";
import fs from "fs";
import path from "path";
import { dirname } from "path";

// Get the directory of the current module
const getCurrentDir = () => {
    // In ES modules with .js extension, we can use a workaround
    return path.resolve(process.cwd(), "src/services");
};

export class PdfGeneratorService {
    async generatePdfBuffer(imageUrls: string[], addBranding: boolean = false): Promise<Buffer> {
        const pdfDoc = await PDFDocument.create();

        // Load logo for branding if needed
        let logoImage;
        if (addBranding) {
            try {
                const logoPath = path.join(getCurrentDir(), "../../public/feelkraft-logo.png");
                const logoBytes = fs.readFileSync(logoPath);
                logoImage = await pdfDoc.embedPng(logoBytes);
            } catch (error) {
                logger.warn("Failed to load logo for PDF branding", { error });
            }
        }

        const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        for (let i = 0; i < imageUrls.length; i++) {
            const url = imageUrls[i];
            try {
                // Download the image
                const imageBuffer = await storageService.downloadImage(url);

                // Embed the image based on format
                let embeddedImage;
                if (url.toLowerCase().includes(".png")) {
                    embeddedImage = await pdfDoc.embedPng(imageBuffer);
                } else {
                    embeddedImage = await pdfDoc.embedJpg(imageBuffer);
                }

                // Create a page with the image dimensions (or standard comic size)
                const { width, height } = embeddedImage.scale(1);

                // Use comic book standard dimensions (6.625" x 10.25" at 150 DPI)
                const pageWidth = 994; // 6.625 * 150
                const pageHeight = 1538; // 10.25 * 150

                const page = pdfDoc.addPage([pageWidth, pageHeight]);

                // Calculate scaling to fit the page while maintaining aspect ratio
                const scale = Math.min(pageWidth / width, pageHeight / height);
                const scaledWidth = width * scale;
                const scaledHeight = height * scale;

                // Center the image on the page
                const x = (pageWidth - scaledWidth) / 2;
                const y = (pageHeight - scaledHeight) / 2;

                page.drawImage(embeddedImage, {
                    x,
                    y,
                    width: scaledWidth,
                    height: scaledHeight,
                });

                // Add branding to front cover (first page) and back cover (last page)
                const isCover = i === 0 || i === imageUrls.length - 1;
                if (addBranding && isCover && logoImage) {
                    const logoSize = 30;
                    const margin = 20;
                    const textSize = 10;

                    // Position at bottom-right corner
                    const logoX = pageWidth - logoSize - margin - 80; // Extra space for text
                    const logoY = margin;

                    // Draw semi-transparent white background for better visibility
                    page.drawRectangle({
                        x: logoX - 5,
                        y: logoY - 5,
                        width: logoSize + 90,
                        height: logoSize + 10,
                        color: rgb(1, 1, 1),
                        opacity: 0.9,
                    });

                    // Draw "Powered By" text
                    page.drawText("Powered By", {
                        x: logoX,
                        y: logoY + logoSize - 8,
                        size: 8,
                        font,
                        color: rgb(0.4, 0.4, 0.4),
                    });

                    // Draw logo
                    page.drawImage(logoImage, {
                        x: logoX,
                        y: logoY,
                        width: logoSize,
                        height: logoSize,
                    });

                    // Draw "FeelKraft" text
                    page.drawText("FeelKraft", {
                        x: logoX + logoSize + 5,
                        y: logoY + 10,
                        size: textSize,
                        font,
                        color: rgb(0.85, 0.35, 0.35), // Primary color
                    });
                }
            } catch (error) {
                logger.error("Failed to add image to PDF", { url, error });
                // Continue with other pages or throw? 
                // Creating a partial PDF is better than failing completely
            }
        }

        const pdfBytes = await pdfDoc.save();
        return Buffer.from(pdfBytes);
    }

    async createComicPdf(imageUrls: string[], jobId: string): Promise<string> {
        logger.info("Creating PDF", { jobId, pageCount: imageUrls.length });
        const pdfBuffer = await this.generatePdfBuffer(imageUrls);

        // Upload to storage
        const pdfUrl = await storageService.uploadGeneratedFile(
            pdfBuffer,
            `comic-${jobId}.pdf`,
            "application/pdf"
        );

        logger.info("PDF created and uploaded", { jobId, pdfUrl });
        return pdfUrl;
    }
}

export const pdfGeneratorService = new PdfGeneratorService();
