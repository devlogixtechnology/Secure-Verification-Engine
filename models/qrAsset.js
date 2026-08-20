const mongoose = require("mongoose");

/**
 * A QR asset generated for one of Backend Squad A's documents.
 *
 * This collection is a generation/delivery ledger, NOT a second source of truth
 * for document data. Squad A's Postgres `documents` table owns the document;
 * we key off their identifiers and keep only what we need to render, sign and
 * re-serve the QR.
 *
 * Two identifiers arrive from Squad A and each does a distinct job:
 *   documentId - their Document.id. Our idempotency key: one QR per document,
 *                enforced by the unique index below rather than by application
 *                logic, so a retried webhook cannot race past the check.
 *   qrCodeId   - their Document.qrCodeId. The public, unguessable token that
 *                appears in the verification URL.
 */
const qrAssetSchema = new mongoose.Schema(
  {
    // -- Identity (owned by Backend Squad A) -----------------------------
    documentId: {
      type: String,
      required: true,
      unique: true, // the idempotency guard
    },
    qrCodeId: {
      type: String,
      required: true,
      unique: true,
    },

    // -- Cryptographic material ------------------------------------------
    /**
     * HMAC-SHA256 over documentId, qrCodeId, issuedAt and expiresAt.
     * Internal integrity check only: never returned to a caller, never logged,
     * never placed in the QR image or the verification URL.
     */
    verificationHash: {
      type: String,
      required: true,
      select: false, // excluded from queries unless explicitly requested
    },

    // -- Document snapshot (denormalised, display-only) -------------------
    // Kept so the email module can compose a message without a round trip to
    // Squad A. Squad A remains authoritative if these ever diverge.
    documentType: { type: String },
    title: { type: String },
    referenceNumber: { type: String },
    recipientName: { type: String },
    recipientEmail: { type: String }, // PII - see docs/qr-payload-spec.md

    // -- Token timing -----------------------------------------------------
    issuedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: true },

    // -- Rendered assets --------------------------------------------------
    /** Local PNG cache path. Nullable: a missing file is re-rendered on demand. */
    qrCodePath: { type: String, default: null },

    /** The URL encoded in the QR image - Frontend Squad A's portal deep link. */
    verificationUrl: { type: String, required: true },

    // -- Lifecycle --------------------------------------------------------
    status: {
      type: String,
      enum: ["active", "expired", "revoked"],
      default: "active",
    },

    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

/**
 * Status with expiry applied.
 *
 * `status` is the stored lifecycle flag; expiry is a function of the clock, so
 * deriving it on read avoids needing a sweeper job to keep rows honest. A
 * revoked document stays revoked even after its expiry passes - revocation is
 * the more important fact to report.
 */
qrAssetSchema.virtual("effectiveStatus").get(function effectiveStatus() {
  if (this.status !== "active") return this.status;
  return this.expiresAt.getTime() < Date.now() ? "expired" : "active";
});

/**
 * The shape callers are given for an issued QR.
 *
 * Deliberately excludes verificationHash and the local filesystem path: a
 * caller gets what it can act on, not internals it would have to reimplement.
 * This is the single definition of that shape, so the CLI today and the HTTP
 * API in the follow-up task cannot drift apart.
 */
qrAssetSchema.methods.toReferenceJSON = function toReferenceJSON() {
  return {
    documentId: this.documentId,
    qrCodeId: this.qrCodeId,
    verificationUrl: this.verificationUrl,
    issuedAt: this.issuedAt.toISOString(),
    expiresAt: this.expiresAt.toISOString(),
    status: this.effectiveStatus,
  };
};

module.exports = mongoose.model("QRAsset", qrAssetSchema);
