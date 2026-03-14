# Glimpse

A lightweight, self-hosted screenshot API. Send it a URL, get back an image. Built with Nitro 3, Playwright, and TypeScript.

## Getting started

You'll need Node.js 20+.

```bash
npm install
npm run dev
```

Open `http://localhost:3000` for the web UI, or hit the API directly.

## API

`POST /api/screenshot`

```json
{
  "url": "https://github.com",
  "width": 1280,
  "height": 720,
  "fullPage": true,
  "format": "png",
  "quality": 80,
  "waitFor": 0
}
```

Only `url` is required. Everything else has sensible defaults.

The response is the raw image with the appropriate `Content-Type` header. If you'd rather get JSON with a base64-encoded image, send `Accept: application/json`.

```bash
# Get the image directly
curl -X POST http://localhost:3000/api/screenshot \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com"}' \
  -o screenshot.png

# Get JSON with base64
curl -X POST http://localhost:3000/api/screenshot \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"url": "https://github.com"}'
```

### Options

| Field | Type | Default | Description |
|---|---|---|---|
| `url` | string | — | URL to screenshot (required) |
| `width` | number | 1280 | Viewport width (100-3840) |
| `height` | number | 720 | Viewport height (100-2160) |
| `fullPage` | boolean | true | Capture the full scrollable page |
| `format` | string | png | `png`, `jpeg`, or `webp` |
| `quality` | number | — | 1-100, for jpeg/webp only |
| `waitFor` | number | 0 | Extra wait time in ms (0-30000) |

### Error codes

| Status | Meaning |
|---|---|
| 400 | Bad request — invalid URL, missing fields, or blocked by SSRF protection |
| 401 | Invalid or missing API key |
| 502 | Screenshot failed (page didn't load, timed out, etc.) |
| 503 | Server at capacity — too many concurrent requests, try again later |

## Configuration

Copy `.env.example` to `.env` and adjust as needed:

```bash
# Require an API key for all /api/* requests.
# Leave empty to disable auth (fine for local dev).
SCREENSHOT_API_KEY=

# Max screenshots running at the same time (default: 4).
# Each tab uses ~50-150MB RAM depending on the page.
MAX_CONCURRENT=4

# How many requests can wait in line when all slots are busy (default: 16).
# Anything beyond this gets an immediate 503.
MAX_QUEUE=16
```

When `SCREENSHOT_API_KEY` is set, pass it via the `X-API-Key` header:

```bash
curl -X POST http://localhost:3000/api/screenshot \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-key-here" \
  -d '{"url": "https://example.com"}' \
  -o screenshot.png
```

## How it works

- A single Chromium instance stays alive for the lifetime of the server. Each request gets its own isolated browser context (separate cookies, storage, etc.), which is much cheaper than spawning a new browser every time.
- URLs are validated against private/reserved IP ranges before Chromium ever sees them, so the service can't be used to probe internal networks (SSRF protection).
- A concurrency semaphore limits how many screenshots run in parallel. Excess requests queue up, and if the queue fills, new requests are rejected with 503 instead of letting the server run out of memory.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Build for production |
| `npm run preview` | Preview the production build |

## License

MIT
