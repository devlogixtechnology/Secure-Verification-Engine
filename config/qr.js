require("dotenv").config();

const qrConfig = {
  // HMAC-SHA256 secret for signing verification hashes
  hashSecret: process.env.QR_HASH_SECRET || "default-dev-secret-change-in-production",

  // Token expiry in hours
  expiryHours: Number(process.env.QR_EXPIRY_HOURS) || 24,

  // Directory to store generated QR code images
  outputDir: process.env.QR_OUTPUT_DIR || "./generated/qrcodes",

  // QR code error correction level: L, M, Q, H
  errorCorrectionLevel: process.env.QR_ERROR_CORRECTION || "M",

  // QR code pixel width
  width: Number(process.env.QR_SIZE) || 300,

  // Base URL that the QR encodes (hash is appended to this)
  baseVerificationUrl:
    process.env.BASE_VERIFICATION_URL ||
    "http://localhost:3000/api/qr/verify/",

  // MongoDB connection string
  mongoUri:
    process.env.MONGODB_URI ||
    "mongodb://localhost:27017/secure-verification-engine",
};

module.exports = { qrConfig };
