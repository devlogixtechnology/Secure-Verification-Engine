require("dotenv").config();

/**
 * Configuration for the QR generation service.
 *
 * Anything secret is read from the environment and never defaulted - the
 * process refuses to start rather than fall back to a value committed in the
 * repository.
 */

const hashSecret = process.env.QR_HASH_SECRET;
if (!hashSecret) {
  throw new Error(
    "QR_HASH_SECRET is required. Refusing to start with a default signing secret."
  );
}
if (hashSecret.length < 32) {
  throw new Error(
    "QR_HASH_SECRET must be at least 32 characters. Generate one with: openssl rand -hex 32"
  );
}

const VALID_ERROR_CORRECTION = ["L", "M", "Q", "H"];
const errorCorrectionLevel = process.env.QR_ERROR_CORRECTION || "M";
if (!VALID_ERROR_CORRECTION.includes(errorCorrectionLevel)) {
  throw new Error(
    `QR_ERROR_CORRECTION must be one of ${VALID_ERROR_CORRECTION.join(", ")} (got "${errorCorrectionLevel}").`
  );
}

const width = Number(process.env.QR_SIZE) || 300;
if (!Number.isInteger(width) || width < 100 || width > 2000) {
  throw new Error(
    `QR_SIZE must be an integer between 100 and 2000 (got "${process.env.QR_SIZE}").`
  );
}

/**
 * Fallback token lifetime, in hours, used ONLY when Squad A's document carries
 * no expiryDate of its own. Their Document.expiryDate is nullable, and a
 * certificate that never expires still should not have an unbounded token, so
 * we cap it. Default is one year - deliberately long, because a 24h QR printed
 * onto a certificate would be useless. See docs/qr-payload-spec.md, "Expiry".
 */
const defaultExpiryHours = Number(process.env.QR_EXPIRY_HOURS) || 8760;
if (!Number.isFinite(defaultExpiryHours) || defaultExpiryHours <= 0) {
  throw new Error("QR_EXPIRY_HOURS must be a positive number of hours.");
}

const stripTrailingSlash = (url) => url.replace(/\/+$/, "");

const qrConfig = {
  // HMAC-SHA256 secret used to sign verification hashes
  hashSecret,

  defaultExpiryHours,
  errorCorrectionLevel,
  width,

  // Local disk cache for rendered PNGs. Not the source of truth: any missing
  // file is re-rendered on demand from the stored verification URL.
  outputDir: process.env.QR_OUTPUT_DIR || "./generated/qrcodes",

  /**
   * Frontend Squad A's verification portal - appended with /<qrCodeId> to form
   * the URL encoded into the QR image itself. It points at their portal rather
   * than at this service because a person scanning a printed certificate has to
   * land on a readable result page, not on a JSON response.
   */
  verificationBaseUrl: stripTrailingSlash(
    process.env.VERIFICATION_BASE_URL || "http://localhost:3000/verify"
  ),

  mongoUri:
    process.env.MONGODB_URI ||
    "mongodb://localhost:27017/secure-verification-engine",
};

module.exports = { qrConfig };
