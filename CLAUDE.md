# gemini-ocr-check

## Stack
- **Runtime**: Node.js + Express + TypeScript (strict)
- **AI**: Google Gemini 2.5 Flash (`@google/generative-ai`)
- **WebSocket**: `ws` library — dual registry: `desktopClients` + `mobileClients` (keyed by `sessionId`)
- **Frontend**: Vanilla HTML/CSS/JS — `public/desktop.html`, `public/mobile.html`
- **Sessions**: In-memory Map, 30-min TTL, `src/services/session.service.ts`

## Project layout
```
src/
  index.ts              # Express + WS server entrypoint
  config/env.ts         # requireEnv() — throws on missing vars
  routes/               # extract.route.ts, session.route.ts
  services/             # ws.service.ts, session.service.ts, gemini.service.ts
  types/invoice.types.ts
public/
  desktop.html          # Upload UI + QR modal + WS timeline
  mobile.html           # Auto-camera, WS lifecycle events
```

## Key rules
- Never expose internal errors to API responses
- Validate session before processing any upload or mobile WS registration
- Preserve magic-byte + MIME validation and upload size limits on all file paths
- Delete temp files after processing — no exceptions
- `unregisterClient` = alias for `unregisterDesktopClient` (back-compat only)
- WS mobile events must pass `VALID_MOBILE_EVENTS` whitelist before relay

## Environment variables
```
GEMINI_API_KEY=   # required
PORT=3000
NODE_ENV=development
BASE_URL=http://localhost:3000
```

## Dev
```
npm run dev    # ts-node + nodemon
npm run build  # tsc
npm run lint   # node_modules\.bin\tsc.cmd --noEmit
```
