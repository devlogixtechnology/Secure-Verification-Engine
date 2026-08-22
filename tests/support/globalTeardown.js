const { stopTestDatabase } = require("./testDatabase");

/** Runs once after the whole suite: stops the server and clears its state file. */
module.exports = async () => {
  await stopTestDatabase();
};
