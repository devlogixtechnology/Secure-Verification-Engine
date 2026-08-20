# Secure Verification Engine — Squad Voyager (Backend Squad B)

Communications & Generation half of the DevLogix Secure Delivery & Verification System.

Backend Squad A finalises a document → **we sign it and render a QR** → we email it to the
recipient → Frontend Squad A's portal resolves the scanned token.

| Squad | Owns | Repository |
|---|---|---|
| Backend Squad A | Documents, auth, verification, Postgres/Supabase | [BSSE23004/Documents-Validation](https://github.com/BSSE23004/Documents-Validation) |
| **Backend Squad B (Voyager)** | **QR generation, email delivery, delivery tracking** | this repo |
| Frontend Squad A (Nova) | `/verify/[token]` portal | — |

---

## Documentation

| Document | What it covers |
|---|---|
| [docs/qr-payload-spec.md](docs/qr-payload-spec.md) | **Start here.** Payload schema, signing, expiry policy, idempotency rules — the contract the other squads build against |
| [docs/module-architecture-specs.md](docs/module-architecture-specs.md) | Earlier research: library choices, SMTP/IMAP background |

---

## Quick start

```bash
npm install
cp .env.example .env
```

Fill in the signing secret — the service refuses to start without it:

```bash
openssl rand -hex 32   # -> QR_HASH_SECRET
```

Then, with MongoDB running:

```bash
npm run generate-qr -- --documentId 3f2b8c10-1c4e-4f8a-9d21-6b5a0c9e7f11 --title "Test Certificate"
```

Omitting `--qrCodeId` generates one and warns you: in the real flow Squad A mints it and
we sign theirs.

> The HTTP API that Squad A calls is the companion task *Expose QR Generation API*. Today
> the service is reachable through the CLI or a direct `require()`.

---

## Tests

```bash
npm test
```

Playwright is used as the test runner only — no browser is launched. The specs drive
`services/qrService.js` directly, in process.

The suite is hermetic: it boots its own in-memory MongoDB, so there is no fixture database
to reset and the unique index the idempotency guard depends on is built fresh each run.
The first run downloads a `mongod` binary. If that download is blocked, point the suite at
a real instance instead:

```bash
TEST_MONGODB_URI=mongodb://localhost:27017/svr-test npm test
```

| Spec | Covers |
|---|---|
| `qr-generation.spec.js` | Payload validation, expiry policy, generation contract |
| `qr-idempotency.spec.js` | Duplicate triggers, concurrent bursts, conflict refusal |
| `qr-signing.spec.js` | Hash determinism, tamper detection, expiry resolution |

---

## How it fits together

```
Squad A: document created  ──▶  { documentId, qrCodeId, ... }
        ▼
   validators/qrPayload.js      reject incomplete payloads BEFORE signing
        ▼
   services/qrService.js        HMAC-SHA256 sign · render PNG · idempotent persist
        ▼
   models/qrAsset.js            MongoDB ledger, unique index on documentId
        │
        └─ verificationUrl  ──▶  encoded in the QR, points at Nova's portal
```

| Path | Role |
|---|---|
| `config/qr.js` | Configuration and fail-fast validation |
| `config/db.js` | Connection lifecycle; awaits index builds before use |
| `validators/qrPayload.js` | Payload validation, shared by every caller |
| `services/qrService.js` | Signing, rendering, idempotency. No HTTP — callable directly |
| `models/qrAsset.js` | The ledger, and the one definition of the reference shape |
| `utils/logger.js` | Structured logging with one-way redaction built in |
| `scripts/generateQR.js` | CLI wrapper over the same service function |

**The service is HTTP-free on purpose.** The CLI today, the API next, and any future queue
consumer all drive the same function — which is what makes the module portable to the
other client projects it is meant to serve, and what lets the API task be a thin layer
rather than a reimplementation.

### Three decisions worth knowing

1. **Squad A owns the identifiers.** We sign their `documentId` and `qrCodeId` rather than
   minting our own. See [spec §1](docs/qr-payload-spec.md#1-identifier-ownership-read-this-first).
2. **Idempotency is a database constraint, not application logic.** A unique index on
   `documentId`, because a check-then-insert lets two concurrent retries both through.
3. **The PNG on disk is a cache, not the source of truth.** Rendering is deterministic, so
   a missing file can be re-rendered rather than being an unrecoverable loss.

---

## Environment

Full annotations in [.env.example](.env.example).

| Variable | Required | Notes |
|---|---|---|
| `QR_HASH_SECRET` | **yes** | ≥ 32 chars. No default — the service will not load without it |
| `MONGODB_URI` | yes | |
| `VERIFICATION_BASE_URL` | yes | Nova's portal. The QR encodes `<this>/<qrCodeId>` |
| `QR_EXPIRY_HOURS` | no | Fallback only, when Squad A sends no `expiryDate`. Default 8760 (365d) |
| `LOG_LEVEL`, `QR_SIZE`, `QR_ERROR_CORRECTION`, `QR_OUTPUT_DIR` | no | |

---

## Maintaining this document

When you change the module, update the docs in the same commit:

| If you change… | Update |
|---|---|
| the payload, signing, expiry or idempotency rules | [docs/qr-payload-spec.md](docs/qr-payload-spec.md) **and bump its version + change log** |
| environment variables | `.env.example` and the Environment table above |
| the module layout or a design decision | the "How it fits together" section above |

Anything the other squads build against lives in `docs/` — a change there is a change to a
contract two other teams depend on, so say so in the PR description rather than letting
them discover it at integration.
