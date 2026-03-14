import { defineHandler, HTTPError } from 'nitro';
import { takeScreenshot, type ScreenshotOptions } from '../../utils/screenshot';
import { validateUrl } from '../../utils/url-validator';
import { Semaphore } from '../../utils/semaphore';

interface RequestBody {
    url: string;
    width?: number | string;
    height?: number | string;
    fullPage?: boolean | string;
    format?: 'png' | 'jpeg' | 'webp';
    quality?: number | string;
    waitFor?: number | string;
}

const VALID_FORMATS = new Set(['png', 'jpeg', 'webp']);

const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT || '4', 10);
const MAX_QUEUE = parseInt(process.env.MAX_QUEUE || '16', 10);
const semaphore = new Semaphore(MAX_CONCURRENT, MAX_QUEUE);

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function parseBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value === 'true' || value === '1';
    return Boolean(value);
}

export default defineHandler(async (event) => {
    const body = (await event.req.json()) as RequestBody;

    if (!body?.url) {
        throw new HTTPError({ status: 400, message: 'Missing required field: url' });
    }

    // --- URL validation with SSRF protection ---
    const urlCheck = await validateUrl(body.url);
    if (!urlCheck.valid) {
        throw new HTTPError({ status: 400, message: urlCheck.error || 'Invalid URL' });
    }

    // --- Parse and clamp options ---
    const format = VALID_FORMATS.has(body.format || '') ? (body.format as 'png' | 'jpeg' | 'webp') : 'png';

    const options: ScreenshotOptions = {
        url: urlCheck.url!.toString(),
        width: body.width ? clamp(parseInt(String(body.width), 10) || 1280, 100, 3840) : 1280,
        height: body.height ? clamp(parseInt(String(body.height), 10) || 720, 100, 2160) : 720,
        fullPage: body.fullPage !== undefined ? parseBoolean(body.fullPage) : true,
        format,
        quality: body.quality ? clamp(parseInt(String(body.quality), 10) || 80, 1, 100) : undefined,
        waitFor: body.waitFor ? clamp(parseInt(String(body.waitFor), 10) || 0, 0, 30_000) : 0,
    };

    // --- Acquire a concurrency slot (or reject if at capacity) ---
    try {
        await semaphore.acquire();
    } catch {
        throw new HTTPError({ status: 503, message: 'Server is at capacity, try again later' });
    }

    try {
        // --- Take screenshot ---
        const result = await takeScreenshot(options);

        if (!result.success) {
            throw new HTTPError({ status: 502, message: result.error });
        }

        // --- Determine response format ---
        // If the caller sends Accept: application/json, return JSON with
        // a base64-encoded image. Otherwise return the raw binary image.
        const accept = event.req.headers.get('accept') || '';

        if (accept.includes('application/json')) {
            return {
                success: true,
                contentType: result.contentType,
                size: result.buffer.length,
                base64: result.buffer.toString('base64'),
            };
        }

        // Return raw image
        event.res.headers.set('content-type', result.contentType);
        event.res.headers.set('content-length', result.buffer.length.toString());
        event.res.headers.set('cache-control', 'no-store');
        return result.buffer;
    } finally {
        semaphore.release();
    }
});
