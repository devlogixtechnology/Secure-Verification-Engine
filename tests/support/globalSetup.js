const { startTestDatabase } = require("./testDatabase");

/**
 * Runs once before the whole suite: brings up a throwaway Postgres and applies
 * prisma/schema.prisma to it. Doing this once rather than per spec file keeps a
 * full run to a single server start.
 */
module.exports = async () => {
  await startTestDatabase();
};
