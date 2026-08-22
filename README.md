# Secure Verification Engine — Squad Voyager (Backend Squad B)

Communications & Generation half of the DevLogix Secure Delivery & Verification System.

Backend Squad A finalises a document → **we sign it and render a QR** → we email it to the
recipient → Frontend Squad A's portal resolves the scanned token.

| Squad | Owns | Repository |
|---|---|---|
| Backend Squad A | Documents, auth, verification; owns the `public` schema | [BSSE23004/Documents-Validation](https://github.com/BSSE23004/Documents-Validation) |
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

Set `DATABASE_URL` to the shared Supabase project, **including `?schema=voyager`**.
That suffix is not optional — see [Database](#database) below.

Apply the migrations:

```bash
npm run db:migrate:deploy
```

Then:

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

The suite is hermetic. It starts its own **real PostgreSQL** server in a temp directory
(`embedded-postgres`, no Docker needed), applies the committed migrations to it, runs, and
throws it away. Nothing touches the shared Supabase project, so a test run cannot collide
with a teammate or leave rows behind.

Running the real migrations rather than a fixture means every test run also checks that
`prisma/migrations/` is correct and complete.

To use an existing Postgres instead — a local install, or CI's service container:

```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres npm test
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
   models/qrAsset.js            data access; UNIQUE constraint on document_id
        │
        └─ verificationUrl  ──▶  encoded in the QR, points at Nova's portal
```

| Path | Role |
|---|---|
| `config/qr.js` | Configuration and fail-fast validation |
| `config/db.js` | Prisma client lifecycle — one pool per process |
| `prisma/schema.prisma` | The table definition and its constraints |
| `validators/qrPayload.js` | Payload validation, shared by every caller |
| `services/qrService.js` | Signing, rendering, idempotency. No HTTP — callable directly |
| `models/qrAsset.js` | Data access. The only file that knows Prisma exists |
| `utils/logger.js` | Structured logging with one-way redaction built in |
| `scripts/generateQR.js` | CLI wrapper over the same service function |

**The service is HTTP-free on purpose.** The CLI today, the API next, and any future queue
consumer all drive the same function — which is what makes the module portable to the
other client projects it is meant to serve, and what lets the API task be a thin layer
rather than a reimplementation.

### Three decisions worth knowing

1. **Squad A owns the identifiers.** We sign their `documentId` and `qrCodeId` rather than
   minting our own. See [spec §1](docs/qr-payload-spec.md#1-identifier-ownership-read-this-first).
2. **Idempotency is a database constraint, not application logic.** A `UNIQUE` constraint
   on `document_id`, because a check-then-insert lets two concurrent retries both through.
3. **The PNG on disk is a cache, not the source of truth.** Rendering is deterministic, so
   a missing file can be re-rendered rather than being an unrecoverable loss.

---

## Environment

Full annotations in [.env.example](.env.example).

| Variable | Required | Notes |
|---|---|---|
| `QR_HASH_SECRET` | **yes** | ≥ 32 chars. No default — the service will not load without it |
| `DATABASE_URL` | **yes** | Shared Supabase Postgres. Must include `?schema=voyager` |
| `VERIFICATION_BASE_URL` | yes | Nova's portal. The QR encodes `<this>/<qrCodeId>` |
| `QR_EXPIRY_HOURS` | no | Fallback only, when Squad A sends no `expiryDate`. Default 8760 (365d) |
| `LOG_LEVEL`, `QR_SIZE`, `QR_ERROR_CORRECTION`, `QR_OUTPUT_DIR` | no | |

---

## Database

We share Backend Squad A's Supabase Postgres, in **our own `voyager` schema**.

That one detail is what makes sharing safe. Prisma writes its `_prisma_migrations`
bookkeeping table into whichever schema the connection string names, so with
`?schema=voyager` our migration history and Squad A's stay completely separate. Without
it, both squads would be migrating `public` and would overwrite each other. `config/qr.js`
refuses to start if the suffix is missing, because discovering this at migrate time means
discovering it after the damage.

**No foreign key to their `documents` table**, even though it is physically reachable.
`document_id` is a plain `uuid` column. A cross-schema FK would let their migrations block
ours, make a deleted document cascade into our ledger, and stop this module being lifted
into another client project. Same database, no schema-level dependency.

```bash
npm run db:migrate        # create a migration after editing prisma/schema.prisma
npm run db:migrate:deploy # apply pending migrations (what CI and deploys run)
```

Use Supabase's **direct** connection string (port 5432) for migrations and the **pooled**
one (pgBouncer, 6543) for the running service.

---

## Transitional state

`mongoose` is still a dependency and `models/emaillog.js` still uses it. The QR module has
moved to Supabase; the email module has not. Migrating it belongs to whoever owns the
email task — it is not in scope here, and that module does not currently parse anyway
(`controllers/emailcontroller.js`, `handleWebhook` is missing its closing brace).

Until that lands the repository talks to two databases. That is deliberate and temporary,
not an oversight. Once the email module moves, `mongoose` comes out of `package.json`.

---

## Maintaining this document

When you change the module, update the docs in the same commit:

| If you change… | Update |
|---|---|
| the payload, signing, expiry or idempotency rules | [docs/qr-payload-spec.md](docs/qr-payload-spec.md) **and bump its version + change log** |
| environment variables | `.env.example` and the Environment table above |
| `prisma/schema.prisma` | run `npm run db:migrate` and commit the generated SQL |
| the module layout or a design decision | the "How it fits together" section above |

Anything the other squads build against lives in `docs/` — a change there is a change to a
contract two other teams depend on, so say so in the PR description rather than letting
them discover it at integration.
