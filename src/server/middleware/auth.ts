import { defineMiddleware, HTTPError } from 'nitro';

/**
 * API key authentication middleware.
 *
 * If the SCREENSHOT_API_KEY env var is set, all requests to /api/*
 * must include a matching X-API-Key header. If the env var is not
 * set, authentication is skipped (convenient for local development).
 *
 * Static assets (the web UI) are never gated.
 */
export default defineMiddleware((event) => {
    const apiKey = process.env.SCREENSHOT_API_KEY;

    // No key configured — skip auth entirely
    if (!apiKey) {
        return;
    }

    // Only gate API routes, not static files
    const path = event.path || '';
    if (!path.startsWith('/api/')) {
        return;
    }

    const provided = event.req.headers.get('x-api-key');

    if (!provided) {
        throw new HTTPError({ status: 401, message: 'Missing X-API-Key header' });
    }

    if (provided !== apiKey) {
        throw new HTTPError({ status: 401, message: 'Invalid API key' });
    }
});
