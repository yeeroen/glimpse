import type { Page } from 'playwright';
import { getBrowser } from './browser';

export interface ScreenshotOptions {
    url: string;
    width?: number;
    height?: number;
    fullPage?: boolean;
    format?: 'png' | 'jpeg' | 'webp';
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

const CONTENT_TYPES: Record<string, string> = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
};

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
    const context = await browser.newContext({
        viewport: { width, height },
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

        // Playwright's screenshot `type` supports 'png' and 'jpeg'.
        // For 'webp' there is no native type — we omit `type` and
        // provide a path hint so Playwright infers the format from
        // the extension. Since we're capturing to a Buffer (no real
        // file), we pass a virtual path purely for format inference.
        const screenshotConfig: NonNullable<Parameters<Page['screenshot']>[0]> = {
            fullPage,
        };

        if (format === 'webp') {
            // Virtual path — Playwright uses the extension to pick the encoder.
            // The file is never actually written because we capture to buffer.
            screenshotConfig.path = 'screenshot.webp';
        } else {
            screenshotConfig.type = format;
        }

        if ((format === 'jpeg' || format === 'webp') && quality !== undefined) {
            screenshotConfig.quality = Math.max(0, Math.min(100, quality));
        }

        const buffer = await page.screenshot(screenshotConfig);

        return {
            success: true,
            buffer: Buffer.from(buffer),
            contentType: CONTENT_TYPES[format] || 'image/png',
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
