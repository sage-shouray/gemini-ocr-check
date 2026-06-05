# Project Context: Gemini OCR Invoice Extractor

> **Purpose of this file:** Provide complete, structured context for an AI assistant (e.g., ChatGPT) to understand this codebase and give accurate, relevant help.

---

## 1. What This Project Does

A real-time invoice scanning and extraction service. The workflow:

1. User opens a **desktop dashboard** in a browser.
2. Dashboard generates a **QR code** that encodes a session-scoped mobile URL.
3. User scans the QR with their phone, opens a **mobile upload page**, and photographs/selects an invoice.
4. The server **validates, preprocesses, and sends the file to Google Gemini 2.5 Flash** with a structured extraction prompt.
5. Gemini returns structured JSON (vendor, buyer, line items, totals, taxes, etc.).
6. The desktop dashboard receives the result in real time via **WebSocket** and renders the invoice data.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict mode) |
| Runtime | Node.js 18+ |
| Web Framework | Express.js 4 |
| AI/OCR | Google Gemini 2.5 Flash (`@google/generative-ai`) |
| WebSocket | `ws` library |
| Image Processing | `sharp` + `heic-convert` |
| File Upload | `multer` (disk storage, 20 MB limit) |
| QR Code | `qrcode` |
| Logging | `winston` |
| Schema Validation | `zod` (installed, not yet used in routes) |
| Session Store | In-memory `Map` with TTL (no database) |
| Build | TypeScript compiler → `dist/` |

---

## 3. Directory Structure

```
gemini-ocr-check/
├── src/
│   ├── index.ts                    # Express + HTTP + WebSocket server bootstrap
│   ├── config/
│   │   └── env.ts                  # Dotenv loader; fails fast if GEMINI_API_KEY missing
│   ├── controllers/
│   │   ├── extract.controller.ts   # POST /api/v1/extract/:sessionId handler
│   │   └── session.controller.ts   # Session CRUD + QR generation handlers
│   ├── middleware/
│   │   ├── error.middleware.ts     # Global Express error handler
│   │   └── upload.middleware.ts    # Multer config + magic-byte MIME validation
│   ├── prompts/
│   │   └── invoice.prompt.ts       # 128-line Gemini extraction prompt (returns JSON)
│   ├── routes/
│   │   ├── extract.route.ts        # POST /api/v1/extract/:sessionId
│   │   └── session.route.ts        # POST/GET/DELETE /api/v1/session[/:id]
│   ├── services/
│   │   ├── gemini.service.ts       # Gemini API calls + exponential-backoff retry
│   │   ├── preprocess.service.ts   # Image normalization pipeline (sharp)
│   │   ├── session.service.ts      # In-memory session store with 30-min TTL
│   │   └── ws.service.ts           # WebSocket client registry (sessionId → ws)
│   ├── types/
│   │   └── invoice.types.ts        # All TypeScript interfaces for invoice data
│   └── utils/
│       ├── logger.ts               # Winston singleton
│       └── response.ts             # sendSuccess / sendError helpers
├── public/
│   ├── desktop.html                # ~1933-line dashboard SPA (vanilla JS + CSS)
│   └── mobile.html                 # ~285-line mobile upload page
├── uploads/                        # Temp file storage (deleted after extraction)
├── dist/                           # Compiled JS output (git-ignored)
├── .env                            # Local secrets (not committed)
├── package.json
└── tsconfig.json
```

---

## 4. Environment Variables

Defined in `src/config/env.ts`. Loaded from `.env` in project root.

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | **Yes** | — | Google Gemini API key |
| `PORT` | No | `3000` | HTTP server port |
| `NODE_ENV` | No | `development` | `development` / `production` / `test` |
| `BASE_URL` | No | — | Public URL for QR code (e.g., `http://192.168.1.x:3000`). If localhost, server auto-detects LAN IP. |

---

## 5. API Endpoints

### HTTP

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Serves `desktop.html` |
| `GET` | `/mobile/:sessionId` | Serves `mobile.html` |
| `GET` | `/health` | Returns `{status, uptime, version}` |
| `POST` | `/api/v1/session` | Create session → returns `{sessionId, qrCodeDataUrl, mobileUrl}` |
| `GET` | `/api/v1/session` | List all active sessions |
| `GET` | `/api/v1/session/:id` | Get session status/result |
| `DELETE` | `/api/v1/session/:id` | Delete session |
| `POST` | `/api/v1/extract/:sessionId` | Upload file + run extraction |

### WebSocket

- **Endpoint:** `ws://<host>/ws`
- **Registration message** (client → server): `{type: "register", sessionId: string}`
- **Server push messages** (server → client):

| `type` | Payload | When |
|---|---|---|
| `processing` | `{type, sessionId, status}` | Extraction started |
| `done` | `{type, sessionId, status, result: InvoiceExtraction}` | Extraction complete |
| `error` | `{type, sessionId, status, error: string}` | Extraction failed |

---

## 6. Data Flow (Step by Step)

```
Desktop browser
  │
  ├─ POST /api/v1/session
  │     └─ Returns: sessionId, QR code (PNG data URL), mobileUrl
  │
  ├─ WebSocket /ws  (registers sessionId)
  │
Phone browser (via QR)
  │
  ├─ Opens /mobile/:sessionId
  ├─ Selects/captures invoice image
  └─ POST /api/v1/extract/:sessionId  (multipart/form-data, field: "file")
          │
          ├─ upload.middleware.ts  →  saves to uploads/, validates magic bytes
          ├─ extract.controller.ts
          │     ├─ Reads file buffer
          │     ├─ PDF? → pass directly to Gemini (native multi-page)
          │     ├─ Image? → preprocess.service.ts
          │     │           (HEIC→JPEG, auto-rotate, upscale, sharpen → PNG)
          │     └─ gemini.service.ts
          │           ├─ Builds parts: [prompt, ...image buffers, hint]
          │           ├─ Calls Gemini 2.5 Flash (temp=0, maxTokens=8192)
          │           ├─ Parses JSON from response
          │           └─ Retries up to 3× with exponential backoff (1s,2s,4s)
          │
          ├─ session.service.ts  →  updates status to "done" / "error"
          ├─ ws.service.ts       →  pushes result to desktop WebSocket
          └─ Deletes temp file from uploads/
```

---

## 7. Key Source Files — What Each Does

### `src/services/gemini.service.ts`
- Model: `gemini-2.5-flash`, temperature 0, 8192 max output tokens
- `extractInvoiceData(imageBuffers[], mimeType)` — public entry point
- Wraps extraction in `withExponentialBackoff` (3 attempts)
- If JSON parse fails, sends a correction hint to Gemini and retries once
- Strips markdown code fences before parsing

### `src/services/preprocess.service.ts`
- HEIC/HEIF → JPEG via `heic-convert`
- Auto-rotate from EXIF via `sharp`
- Warns if image width < 800px
- Upscales to 1500px if < 1200px; downscales to 3000px if > 4000px
- Normalizes contrast + sharpens (sigma 1.5)
- Outputs PNG

### `src/middleware/upload.middleware.ts`
- Multer: disk storage, 20 MB limit, allowed: JPEG/PNG/WebP/TIFF/HEIC/PDF
- `validateMagicBytes` middleware: reads first 12 bytes and compares to known signatures
  - Rejects mismatches (e.g., a .jpg with PDF bytes)
  - Deletes file on rejection

### `src/prompts/invoice.prompt.ts`
- Instructs Gemini to output **only** a JSON object (no markdown, no prose)
- All fields required (null if absent — no omissions)
- Numbers as numbers, dates as `YYYY-MM-DD`
- Extract all line items across all pages
- Supports Indian invoices: GSTIN, PAN, HSN/SAC codes, CGST/SGST/IGST
- Returns `confidence`: `"high"` / `"medium"` / `"low"` + `warnings[]`

### `src/services/session.service.ts`
- Pure in-memory `Map<string, SessionData>`
- 30-minute TTL per session via `setTimeout().unref()`
- Statuses: `"waiting"` → `"processing"` → `"done"` / `"error"`

### `src/services/ws.service.ts`
- Maintains `Map<sessionId, WebSocket>`
- `notifyDesktop(sessionId, data)` sends JSON if client connected

---

## 8. TypeScript Interfaces

All defined in `src/types/invoice.types.ts`.

```typescript
interface Address {
  line1: string | null; line2: string | null;
  city: string | null; state: string | null;
  postal_code: string | null; country: string | null;
  full_address: string | null;
}

interface BankDetails {
  bank_name: string | null; account_number: string | null;
  ifsc_code: string | null; swift_code: string | null;
}

interface Vendor {
  name: string | null; address: Address | null;
  phone: string | null; email: string | null;
  tax_id: string | null; gstin: string | null; pan: string | null;
  bank_details: BankDetails | null;
}

interface Buyer { /* same shape as Vendor minus bank_details */ }
interface ShipTo { name: string | null; address: Address | null; }

interface LineItem {
  // 19 fields including:
  serial_number, item_code, description, hsn_sac_code,
  quantity, unit, unit_price, discount_percent, discount_amount,
  taxable_amount, cgst_rate, cgst_amount, sgst_rate, sgst_amount,
  igst_rate, igst_amount, tax_rate, tax_amount, total_amount
}

interface Totals {
  // 13 fields including:
  currency, subtotal, total_discount, total_taxable_amount,
  total_cgst, total_sgst, total_igst, total_tax,
  grand_total, amount_in_words, advance_paid, balance_due, shipping_charges
}

interface ExtractionMeta {
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
  page_count: number | null;
}

interface InvoiceExtraction {
  document_type, invoice_number, invoice_date, due_date,
  payment_terms, purchase_order_number, order_id,
  vendor: Vendor, buyer: Buyer, ship_to: ShipTo,
  line_items: LineItem[], totals: Totals,
  notes, terms_and_conditions,
  meta: ExtractionMeta
}

interface SessionData {
  sessionId: string;
  createdAt: Date;
  status: 'waiting' | 'processing' | 'done' | 'error';
  extractionResult?: InvoiceExtraction;
  error?: string;
}
```

---

## 9. Frontend Overview

### `public/desktop.html` (~1933 lines, vanilla JS)
- WebSocket auto-connect + auto-reconnect every 3s
- Session init on page load (`POST /api/v1/session`)
- Left sidebar: QR code, session status badge, direct drag-and-drop upload zone
- Right panel: state machine (`showView`) with views: empty / processing / error / results
- Results renderer: dynamically builds cards for header, vendor, buyer, ship-to, line items table, totals, notes, meta/warnings
- XHR file upload with progress bar

### `public/mobile.html` (~285 lines, vanilla JS)
- Screens: capture → preview → uploading → success / error
- File input with `accept="image/*" capture="environment"` (triggers camera on mobile)
- Session ID from URL path segment
- Uploads to `/api/v1/extract/:sessionId`

---

## 10. Error Handling

| Scenario | HTTP Status | Handler |
|---|---|---|
| File too large | 413 | `error.middleware.ts` (Multer LIMIT_FILE_SIZE) |
| Invalid MIME / multer error | 400 | `error.middleware.ts` |
| Magic byte mismatch | 415 | `error.middleware.ts` |
| Unhandled server error | 500 | `error.middleware.ts` |
| Session not found | 404 | Controller inline |
| No file uploaded | 400 | Controller inline |
| Gemini API failure | Session marked error + WS notify | `extract.controller.ts` catch block |

---

## 11. Known Constraints / Gotchas

- **No persistent storage.** Sessions live in memory only; server restart clears everything.
- **Single-process.** WebSocket registry is per-process; won't work with multiple instances without a pub/sub layer.
- **`zod` is installed** but not wired into route validation yet.
- **`BASE_URL` localhost fallback:** `session.controller.ts` auto-detects the machine's LAN IP via `os.networkInterfaces()` when `BASE_URL` is localhost — useful for phone access on same WiFi.
- **PDF support:** PDFs are passed directly to Gemini as-is (no preprocessing). Multi-page PDFs are handled natively by Gemini.
- **Temp file cleanup:** Happens in `extract.controller.ts` `finally` block — always runs even on error.
- **Gemini JSON retry:** If the first response fails JSON parsing, the controller sends a correction prompt and retries once before throwing.

---

## 12. Running the Project

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env: set GEMINI_API_KEY, PORT (default 3000), BASE_URL

# Development (hot reload)
npm run dev

# Production build
npm run build
npm run start

# Type check (no emit)
npm run lint
```

Desktop: `http://localhost:3000`
Phone (same WiFi): `http://<LAN-IP>:3000` — or use `ngrok` for external access.

---

## 13. What Has NOT Been Built (Potential TODOs)

- Persistent session storage (database)
- User authentication
- Rate limiting on upload endpoint
- Zod validation on API request bodies
- Unit/integration tests
- Multi-worker / horizontal scaling support
- Export to CSV/JSON/Excel
- Invoice history / search
