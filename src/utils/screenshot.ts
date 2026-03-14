import type { Page } from 'playwright';
import sharp from 'sharp';
import { getBrowser } from './browser';

export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'avif';

export interface ScreenshotOptions {
    url: string;
    width?: number;
    height?: number;
    fullPage?: boolean;
    format?: ImageFormat;
    quality?: number;
    waitFor?: number;
}

export interface ScreenshotResult {
    success: true;
    buffer: Buffer;
    contentType: string;
}

export interface ScreenshotError {
    success: false;
    error: string;
}

const CONTENT_TYPES: Record<ImageFormat, string> = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    avif: 'image/avif',
};

/** Formats that Playwright supports natively via `type`. */
const NATIVE_FORMATS = new Set<ImageFormat>(['png', 'jpeg']);

/** Formats that require post-processing with sharp. */
const SHARP_FORMATS = new Set<ImageFormat>(['webp', 'avif']);

/**
 * Navigate to a URL and capture a screenshot. Returns the image
 * as a Buffer so the caller can stream it directly to the client
 * without touching disk.
 *
 * Uses the shared browser instance from browser.ts and creates
 * an isolated BrowserContext per call for cookie/storage isolation.
 */
export async function takeScreenshot(
    options: ScreenshotOptions,
): Promise<ScreenshotResult | ScreenshotError> {
    const {
        url,
        width = 1280,
        height = 720,
        fullPage = true,
        format = 'png',
        quality,
        waitFor = 0,
    } = options;

    const browser = await getBrowser();
    // Use a minimal viewport height when capturing the full page so
    // the output image matches the actual content height — short
    // pages won't be stretched to fill an arbitrary viewport.
    const viewportHeight = fullPage ? 1 : height;
    const context = await browser.newContext({
        viewport: { width, height: viewportHeight },
    });

    try {
        const page = await context.newPage();

        await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: 30_000,
        });

        if (waitFor > 0) {
            await page.waitForTimeout(waitFor);
        }

        // Playwright natively supports 'png' and 'jpeg'. For 'webp'
        // and 'avif' we capture as PNG and convert with sharp.
        const needsConversion = SHARP_FORMATS.has(format);
        const captureType: 'png' | 'jpeg' = needsConversion ? 'png' : format as 'png' | 'jpeg';

        const screenshotConfig: NonNullable<Parameters<Page['screenshot']>[0]> = {
            fullPage,
            type: captureType,
        };

        // Set quality for native JPEG captures
        if (captureType === 'jpeg' && quality !== undefined) {
            screenshotConfig.quality = Math.max(0, Math.min(100, quality));
        }

        let buffer = Buffer.from(await page.screenshot(screenshotConfig));

        // Convert to webp/avif via sharp
        if (needsConversion) {
            const clampedQuality = quality !== undefined ? Math.max(0, Math.min(100, quality)) : 80;
            let pipeline = sharp(buffer);

            if (format === 'webp') {
                pipeline = pipeline.webp({ quality: clampedQuality });
            } else {
                pipeline = pipeline.avif({ quality: clampedQuality });
            }

            buffer = Buffer.from(await pipeline.toBuffer());
        }

        return {
            success: true,
            buffer,
            contentType: CONTENT_TYPES[format],
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Screenshot capture failed',
        };
    } finally {
        await context.close();
    }
}
