const mongoose = require("mongoose");

const { qrConfig } = require("./qr");
const QRAsset = require("../models/qrAsset");
const logger = require("../utils/logger");

/**
 * MongoDB connection lifecycle.
 *
 * Kept separate from app.js so the Express app can be constructed and tested
 * without a database, and so the CLI script can share the exact same connect
 * logic instead of hand-rolling its own.
 */

/**
 * Connect and make sure indexes exist before the process starts serving.
 *
 * The index build is awaited deliberately. The idempotency guarantee depends on
 * the unique index on documentId, and Mongoose builds indexes in the background
 * by default - so without this await there is a window at startup where two
 * concurrent generate calls could both succeed and create duplicate QR codes
 * for one document.
 *
 * @param {string} [uri] - overrides the configured URI (used by the test server)
 */
async function connectDatabase(uri = qrConfig.mongoUri) {
  await mongoose.connect(uri);
  await QRAsset.init();

  // The URI carries credentials; log that we connected, never where to.
  logger.info("MongoDB connected", { database: mongoose.connection.name });

  return mongoose.connection;
}

async function disconnectDatabase() {
  await mongoose.disconnect();
  logger.info("MongoDB disconnected");
}

module.exports = { connectDatabase, disconnectDatabase };
