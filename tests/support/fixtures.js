const { randomUUID } = require("crypto");

/**
 * Shared helpers for the specs.
 *
 * Every test mints fresh UUIDs rather than sharing fixture rows, so specs stay
 * independent without needing a database reset between them - and so the
 * idempotency tests prove real behaviour rather than a cleanup artifact.
 */

/**
 * A payload shaped like the one Backend Squad A sends after creating a document
 * (their Technical Specification, sections 4.4.1 and 6.1.1).
 */
function newDocumentPayload(overrides = {}) {
  return {
    documentId: randomUUID(),
    qrCodeId: randomUUID(),
    documentType: "Internship Offer",
    title: "Internship Offer Letter",
    referenceNumber: `DL-TEST-${Date.now()}`,
    recipientName: "Jane Smith",
    recipientEmail: "jane@example.com",
    ...overrides,
  };
}

module.exports = { newDocumentPayload };
