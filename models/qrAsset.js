const mongoose = require("mongoose");

const qrAssetSchema = new mongoose.Schema(
  {
    // The HMAC-SHA256 hex digest — unique identifier for this verification
    verificationHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Who the QR was generated for
    userId: { type: String, required: true, index: true },

    // Verification purpose, e.g. "identity", "document", "certificate"
    purpose: { type: String, required: true },

    // UUID nonce used in hash construction (prevents replay)
    nonce: { type: String, required: true },

    // Token timing
    issuedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },

    // Generated QR assets
    qrCodePath: { type: String, required: true }, // filesystem path to PNG
    qrDataUrl: { type: String, required: true }, // base64 data URL for embedding

    // The full verification URL encoded in the QR
    verificationUrl: { type: String, required: true },

    // Lifecycle status
    status: {
      type: String,
      enum: ["active", "verified", "expired", "revoked"],
      default: "active",
    },

    // When the QR was scanned and verified
    verifiedAt: { type: Date, default: null },

    // Flexible metadata for extra context
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model("QRAsset", qrAssetSchema);
