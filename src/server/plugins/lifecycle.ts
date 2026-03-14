import { definePlugin } from 'nitro';
import { closeBrowser } from '../../utils/browser';

/**
 * Lifecycle plugin that ensures the shared Chromium instance
 * is cleanly shut down when the server stops.
 */
export default definePlugin((nitro) => {
    nitro.hooks.hook('close', async () => {
        await closeBrowser();
    });
});
