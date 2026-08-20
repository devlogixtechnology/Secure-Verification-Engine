/**
 * CLI script to generate a cryptographic verification QR code.
 *
 * Usage:
 *   node scripts/generateQR.js --userId "user123" --purpose "identity"
 *   node scripts/generateQR.js --userId "user456" --purpose "document" --metadata '{"docType":"passport"}'
 *
 * Requires a running MongoDB instance (configured via MONGODB_URI in .env).
 */

require("dotenv").config();
const mongoose = require("mongoose");
const { qrConfig } = require("../config/qr");
const { createVerificationQR } = require("../services/qrService");

// ── Parse CLI arguments ────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, "");
    const value = args[i + 1];
    if (key && value !== undefined) {
      parsed[key] = value;
    }
  }

  return parsed;
}

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  const args = parseArgs();

  if (!args.userId || !args.purpose) {
    console.error(
      "\n  Usage: node scripts/generateQR.js --userId <id> --purpose <purpose> [--metadata <json>]\n"
    );
    console.error("  Example:");
    console.error(
      '    node scripts/generateQR.js --userId "user123" --purpose "identity"\n'
    );
    process.exit(1);
  }

  // Parse optional metadata JSON
  let metadata = {};
  if (args.metadata) {
    try {
      metadata = JSON.parse(args.metadata);
    } catch {
      console.error("  Error: --metadata must be valid JSON\n");
      process.exit(1);
    }
  }

  // Connect to MongoDB
  console.log("\n  Connecting to MongoDB...");
  await mongoose.connect(qrConfig.mongoUri);
  console.log("  Connected.\n");

  try {
    // Generate QR
    console.log("  Generating cryptographic QR code...\n");
    const qrAsset = await createVerificationQR({
      userId: args.userId,
      purpose: args.purpose,
      metadata,
    });

    // Print results
    console.log("  ✅ QR Code Generated Successfully");
    console.log("  ─────────────────────────────────────────────");
    console.log(`  Hash:             ${qrAsset.verificationHash}`);
    console.log(`  User ID:          ${qrAsset.userId}`);
    console.log(`  Purpose:          ${qrAsset.purpose}`);
    console.log(`  Status:           ${qrAsset.status}`);
    console.log(`  Issued At:        ${qrAsset.issuedAt.toISOString()}`);
    console.log(`  Expires At:       ${qrAsset.expiresAt.toISOString()}`);
    console.log(`  Verification URL: ${qrAsset.verificationUrl}`);
    console.log(`  QR Image Path:    ${qrAsset.qrCodePath}`);
    console.log(`  MongoDB _id:      ${qrAsset._id}`);
    console.log("  ─────────────────────────────────────────────");
    console.log(
      `  Data URL preview:  ${qrAsset.qrDataUrl.substring(0, 60)}...`
    );
    console.log();
  } finally {
    await mongoose.disconnect();
    console.log("  Disconnected from MongoDB.\n");
  }
}

main().catch((err) => {
  console.error("  Fatal error:", err.message);
  process.exit(1);
});
