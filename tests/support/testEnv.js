const path = require("path");

/**
 * Single source of truth for the test environment.
 *
 * config/qr.js reads and validates the environment at module load, so these
 * values have to be in place before the service is required by any spec.
 */

// Fixed rather than random so a failed run leaves inspectable artifacts.
const QR_OUTPUT_DIR = path.join(__dirname, "..", ".tmp", "qrcodes");

/**
 * Test-only values. Real secrets never appear in the repository - these exist
 * purely so the service will load in CI, and the signing secret is long enough
 * to satisfy the 32-character minimum enforced in config/qr.js.
 */
const TEST_ENV = {
  NODE_ENV: "test",
  QR_HASH_SECRET: "test-hash-secret-not-for-production-0123456789",
  QR_OUTPUT_DIR,
  QR_SIZE: "300",
  QR_ERROR_CORRECTION: "M",
  VERIFICATION_BASE_URL: "http://localhost:3000/verify",
  LOG_LEVEL: "warn",
};

/**
 * Apply the test environment to the current process.
 *
 * Existing values win, so a developer can point a run at a real MongoDB with
 * TEST_MONGODB_URI without editing anything here.
 */
function applyToProcess() {
  for (const [key, value] of Object.entries(TEST_ENV)) {
    process.env[key] ??= value;
  }
}

module.exports = { QR_OUTPUT_DIR, TEST_ENV, applyToProcess };
