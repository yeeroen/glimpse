import { chromium, type Browser } from 'playwright';

const LAUNCH_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
];

let browser: Browser | null = null;
let launching: Promise<Browser> | null = null;

/**
 * Returns a shared Chromium browser instance. Launches one on first call
 * and reuses it for all subsequent requests. Callers should create a
 * BrowserContext per request for isolation, not share pages directly.
 */
export async function getBrowser(): Promise<Browser> {
    if (browser?.isConnected()) {
        return browser;
    }

    // Prevent multiple concurrent launches — if a launch is already
    // in progress, wait for it instead of starting another.
    if (launching) {
        return launching;
    }

    launching = chromium.launch({
        headless: true,
        args: LAUNCH_ARGS,
    });

    try {
        browser = await launching;

        // If the browser disconnects unexpectedly, clear the reference
        // so the next call to getBrowser() will launch a fresh one.
        browser.on('disconnected', () => {
            browser = null;
        });

        return browser;
    } finally {
        launching = null;
    }
}

/**
 * Gracefully close the shared browser instance. Called during
 * server shutdown to clean up the Chromium process.
 */
export async function closeBrowser(): Promise<void> {
    if (browser) {
        await browser.close();
        browser = null;
    }
}
