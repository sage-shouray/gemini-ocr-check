# Gemini OCR — Invoice Extractor

Scan a paper invoice with your phone and watch the structured data appear on your desktop in real time. Powered by Google Gemini's vision model.

## How it works

1. Open the dashboard on your desktop browser
2. A QR code is generated automatically
3. Scan the QR with your phone — it opens a mobile upload page
4. Photograph the invoice
5. Gemini extracts all invoice fields (vendor, buyer, line items, GST, totals…)
6. Results stream live to the desktop via WebSocket

---

## Setup

### 1. Prerequisites

- Node.js 18 or later
- A Google Gemini API key — get one at https://aistudio.google.com/app/apikey
- (Optional) ngrok for phone access from a different network

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Open `.env` and set your key:

```
GEMINI_API_KEY=your_actual_key_here
PORT=3000
NODE_ENV=development
BASE_URL=http://localhost:3000
```

---

## Run

```bash
npm run dev
```

Open http://localhost:3000 in your desktop browser. The dashboard loads and shows a QR code.

---

## Phone access via ngrok

The QR code must encode a URL reachable from your phone. If your phone is on the same Wi-Fi as your computer you can use your local IP instead of `localhost`. For any other network, use ngrok:

```bash
# In a second terminal
ngrok http 3000
```

Copy the `https://xxxx.ngrok-free.app` URL that ngrok prints, then update `.env`:

```
BASE_URL=https://xxxx-xx-xx-xxx-xx.ngrok-free.app
```

Restart the dev server (`npm run dev`) — the new QR code will encode the ngrok URL.

---

## Usage

1. **Desktop** — open http://localhost:3000. A QR code appears automatically.
2. **Phone** — scan the QR code. Your phone camera opens the mobile upload page.
3. **Capture** — tap the camera button, photograph the invoice.
4. **Upload** — tap *Upload*. A progress bar shows while the file transfers.
5. **Watch** — the desktop dashboard shows a spinner then renders the full invoice breakdown: vendor, buyer, line items, GST breakdown, totals.
6. **Scan another** — click *Scan Another* on the desktop to get a fresh QR.

---

## API reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/session` | Create session — returns `{sessionId, qrCodeDataUrl, mobileUrl}` |
| `GET`  | `/api/v1/session` | List all active sessions |
| `GET`  | `/api/v1/session/:id` | Get session status and result |
| `DELETE` | `/api/v1/session/:id` | Delete session |
| `POST` | `/api/v1/extract/:sessionId` | Upload image/PDF and extract invoice data |
| `GET`  | `/health` | Health check — returns `{status, uptime, version}` |
| `WS`   | `/ws` | WebSocket — send `{type:"register",sessionId}` to receive push updates |

---

## Scripts

```bash
npm run dev      # Start development server with hot reload
npm run build    # Compile TypeScript to dist/
npm run start    # Run compiled output
npm run lint     # Type-check without emitting files
```

---

## Supported file types

JPEG, PNG, WebP, TIFF, HEIC/HEIF, PDF (all pages processed at 300 DPI)

Maximum upload size: **20 MB**

---

## Project structure

```
src/
  index.ts                   # Express + HTTP + WebSocket server
  config/env.ts              # Environment variable loading
  routes/                    # Express routers
  controllers/               # Request handlers
  services/
    gemini.service.ts        # Gemini API calls with retry + backoff
    preprocess.service.ts    # Image normalisation (sharp, HEIC, PDF)
    session.service.ts       # In-memory session store (30 min TTL)
    ws.service.ts            # WebSocket client registry + notifyDesktop
  middleware/
    upload.middleware.ts     # Multer + magic-byte validation
    error.middleware.ts      # Global error handler
  prompts/invoice.prompt.ts  # Gemini extraction prompt
  types/invoice.types.ts     # TypeScript interfaces
  utils/
    logger.ts                # Winston logger
    response.ts              # sendSuccess / sendError helpers
public/
  desktop.html               # Dashboard (QR + live results)
  mobile.html                # Phone upload page
uploads/                     # Temporary file storage (auto-cleaned after each request)
```
