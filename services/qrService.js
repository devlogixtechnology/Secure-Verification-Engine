const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const QRCode = require("qrcode");
const { qrConfig } = require("../config/qr");
const QRAsset = require("../models/qrAsset");

/**
 * Generate a cryptographic verification hash using HMAC-SHA256.
 *
 * The hash is constructed from:
 *   message = "userId:purpose:nonce:issuedAt"
 *   hash    = HMAC-SHA256(message, QR_HASH_SECRET)
 *
 * @param {Object} payload
 * @param {string} payload.userId  - User or entity identifier
 * @param {string} payload.purpose - Verification purpose (e.g. "identity")
 * @returns {{ hash: string, nonce: string, issuedAt: Date, expiresAt: Date }}
 */
function generateVerificationHash({ userId, purpose }) {
  const nonce = uuidv4();
  const issuedAt = new Date();
  const expiresAt = new Date(
    issuedAt.getTime() + qrConfig.expiryHours * 60 * 60 * 1000
  );

  const message = `${userId}:${purpose}:${nonce}:${issuedAt.toISOString()}`;
  const hash = crypto
    .createHmac("sha256", qrConfig.hashSecret)
    .update(message)
    .digest("hex");

  return { hash, nonce, issuedAt, expiresAt };
}

/**
 * Generate a QR code image from a verification URL.
 *
 * Produces:
 *   1. A base64 data URL (for email embedding / inline display)
 *   2. A PNG file on disk (for persistent storage)
 *
 * @param {string} verificationUrl - The full URL to encode in the QR
 * @param {string} hash            - The verification hash (used for filename)
 * @returns {Promise<{ dataUrl: string, filePath: string }>}
 */
async function generateQRCode(verificationUrl, hash) {
  const qrOptions = {
    errorCorrectionLevel: qrConfig.errorCorrectionLevel,
    width: qrConfig.width,
    margin: 2,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  };

  // Generate base64 data URL
  const dataUrl = await QRCode.toDataURL(verificationUrl, qrOptions);

  // Ensure output directory exists
  const outputDir = path.resolve(qrConfig.outputDir);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate PNG file
  const fileName = `qr_${hash.substring(0, 12)}_${uuidv4()}.png`;
  const filePath = path.join(outputDir, fileName);
  await QRCode.toFile(filePath, verificationUrl, qrOptions);

  return { dataUrl, filePath };
}

/**
 * Full orchestration: generate hash → build URL → create QR → save to DB.
 *
 * This is the main public function that teammates should call.
 *
 * @param {Object} params
 * @param {string} params.userId   - User or entity identifier
 * @param {string} params.purpose  - Verification purpose
 * @param {Object} [params.metadata] - Optional extra context to store
 * @returns {Promise<Object>} The saved QRAsset document
 */
async function createVerificationQR({ userId, purpose, metadata = {} }) {
  // 1. Generate cryptographic hash
  const { hash, nonce, issuedAt, expiresAt } = generateVerificationHash({
    userId,
    purpose,
  });

  // 2. Build verification URL
  const verificationUrl = `${qrConfig.baseVerificationUrl}${hash}`;

  // 3. Generate QR code image (data URL + PNG file)
  const { dataUrl, filePath } = await generateQRCode(verificationUrl, hash);

  // 4. Persist to MongoDB
  const qrAsset = await QRAsset.create({
    verificationHash: hash,
    userId,
    purpose,
    nonce,
    issuedAt,
    expiresAt,
    qrCodePath: filePath,
    qrDataUrl: dataUrl,
    verificationUrl,
    status: "active",
    metadata,
  });

  return qrAsset;
}

module.exports = {
  generateVerificationHash,
  generateQRCode,
  createVerificationQR,
};
