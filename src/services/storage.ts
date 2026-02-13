import { createClient } from "@supabase/supabase-js";
import { logger } from "../utils/logger.js";
import { v4 as uuidv4 } from "uuid";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseServiceKey = process.env.SUPABASE_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

const BUCKET_UPLOADS = "comic-uploads";
const BUCKET_GENERATED = "comic-generated";

export class StorageService {
    async uploadImage(file: Buffer, filename: string, mimeType: string): Promise<string> {
        const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
        const uniqueFilename = `${uuidv4()}-${sanitizedFilename}`;

        const { data, error } = await supabase.storage
            .from(BUCKET_UPLOADS)
            .upload(uniqueFilename, file, {
                contentType: mimeType,
                upsert: false,
            });

        if (error) {
            logger.error("Upload failed", { error: error.message });
            throw new Error(`Upload failed: ${error.message}`);
        }

        const { data: urlData } = supabase.storage
            .from(BUCKET_UPLOADS)
            .getPublicUrl(data.path);

        logger.info("Image uploaded", { path: data.path });
        return urlData.publicUrl;
    }

    async downloadImage(url: string): Promise<Buffer> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to download image: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    async uploadGeneratedFile(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
        const uniqueFilename = `${uuidv4()}-${filename}`;

        const { data, error } = await supabase.storage
            .from(BUCKET_GENERATED)
            .upload(uniqueFilename, buffer, {
                contentType: mimeType,
                upsert: false,
            });

        if (error) {
            logger.error("Generated file upload failed", { error: error.message });
            throw new Error(`Upload failed: ${error.message}`);
        }

        const { data: urlData } = supabase.storage
            .from(BUCKET_GENERATED)
            .getPublicUrl(data.path);

        logger.info("Generated file uploaded", { path: data.path });
        return urlData.publicUrl;
    }

    async getSignedUrl(bucket: string, path: string, expiresIn = 3600): Promise<string> {
        const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUrl(path, expiresIn);

        if (error) {
            throw new Error(`Failed to create signed URL: ${error.message}`);
        }

        return data.signedUrl;
    }

    async deleteFiles(urls: string[]): Promise<void> {
        if (!urls.length) return;

        try {
            // Extract paths from URLs
            // Expected format: .../storage/v1/object/public/comic-uploads/filename.ext
            const paths = urls.map(url => {
                const parts = url.split(`${BUCKET_UPLOADS}/`);
                return parts.length > 1 ? parts[1] : null;
            }).filter((p): p is string => p !== null);

            if (!paths.length) return;

            const { error } = await supabase.storage
                .from(BUCKET_UPLOADS)
                .remove(paths);

            if (error) {
                logger.error("Failed to delete files", { error: error.message, paths });
            } else {
                logger.info("Deleted files from storage", { count: paths.length });
            }
        } catch (error) {
            logger.error("Error deleting files", error);
        }
    }
}

export const storageService = new StorageService();
