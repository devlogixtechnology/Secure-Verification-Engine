const { defineConfig } = require("@playwright/test");

/**
 * Playwright configuration for the QR generation service.
 *
 * No browser is launched and no server is started: these specs drive the
 * service module directly, in process, against a throwaway MongoDB. Playwright
 * is used here purely as the test runner, so that the HTTP-level specs added by
 * the "Expose QR Generation API" task can join the same suite rather than
 * arriving with a second framework.
 */
module.exports = defineConfig({
  testDir: "./tests/e2e",

  // The persistence specs share one database, and concurrency is exercised
  // deliberately inside qr-idempotency.spec.js. Letting Playwright add its own
  // on top would make a failure hard to attribute.
  fullyParallel: false,
  workers: 1,

  timeout: 30_000,
  expect: { timeout: 5_000 },

  // Fail the run if a .only was committed by accident.
  forbidOnly: !!process.env.CI,
  retries: 0,

  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
});
