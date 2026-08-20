const { applyToProcess } = require("./testEnv");

// Must run before config/qr.js is pulled in transitively.
applyToProcess();

const { MongoMemoryServer } = require("mongodb-memory-server");
const { connectDatabase, disconnectDatabase } = require("../../config/db");

/**
 * Throwaway MongoDB for the specs that touch persistence.
 *
 * An in-memory server keeps the suite hermetic: no shared fixture database to
 * reset between runs, and - importantly for the idempotency tests - the unique
 * indexes are built fresh every time, through the same connectDatabase() the
 * real process uses.
 *
 * Set TEST_MONGODB_URI to run against a real instance instead, which is the
 * escape hatch when the mongodb-memory-server binary download is blocked.
 */

let mongoServer = null;

async function startTestDatabase() {
  let uri = process.env.TEST_MONGODB_URI;

  if (!uri) {
    mongoServer = await MongoMemoryServer.create();
    uri = mongoServer.getUri();
  }

  await connectDatabase(uri);
}

async function stopTestDatabase() {
  await disconnectDatabase();
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
}

module.exports = { startTestDatabase, stopTestDatabase };
