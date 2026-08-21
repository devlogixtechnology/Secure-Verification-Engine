const { randomUUID } = require("crypto");
const { test, expect } = require("@playwright/test");

const { startTestDatabase, stopTestDatabase } = require("../support/db");
const { newDocumentPayload } = require("../support/fixtures");

const {
  createVerificationQR,
  verifyVerificationHash,
} = require("../../services/qrService");
const QRAsset = require("../../models/qrAsset");

/**
 * The duplicate-trigger tests the standards checklist asks for.
 *
 * The scenario being defended against is concrete: Squad A's webhook fires, the
 * call times out on their side after we already committed, and their retry
 * arrives. Without a guard that produces a second QR code and - once the email
 * module is wired up - a second email to the recipient.
 */

test.beforeAll(async () => {
  // First run on a clean machine downloads a mongod binary.
  test.setTimeout(180_000);
  await startTestDatabase();
});

test.afterAll(async () => {
  await stopTestDatabase();
});

test.describe("Idempotency", () => {
  test("a repeated trigger returns the original QR, not a new one", async () => {
    const payload = newDocumentPayload();

    const first = await createVerificationQR(payload);
    expect(first.idempotent).toBe(false);

    const second = await createVerificationQR(payload);
    expect(second.idempotent).toBe(true);

    // Same database row, not merely an equivalent one.
    expect(second.asset._id.toString()).toBe(first.asset._id.toString());

    // An identical issue timestamp is the observable proof that the stored
    // record was returned rather than quietly regenerated.
    expect(second.asset.issuedAt.getTime()).toBe(first.asset.issuedAt.getTime());
  });

  test("leaves exactly one record behind after repeated triggers", async () => {
    const payload = newDocumentPayload();

    for (let i = 0; i < 4; i += 1) {
      await createVerificationQR(payload);
    }

    expect(await QRAsset.countDocuments({ documentId: payload.documentId })).toBe(1);
  });

  test("survives a burst of concurrent identical triggers", async () => {
    const payload = newDocumentPayload();

    // A read-then-write check would let several of these through; the guarantee
    // has to come from the unique index, which is why connectDatabase() awaits
    // the index build before anything is served.
    const results = await Promise.all(
      Array.from({ length: 8 }, () => createVerificationQR(payload))
    );

    expect(results.filter((r) => !r.idempotent)).toHaveLength(1);
    expect(results.filter((r) => r.idempotent)).toHaveLength(7);

    const distinctIds = new Set(results.map((r) => r.asset._id.toString()));
    expect(distinctIds.size).toBe(1);

    expect(await QRAsset.countDocuments({ documentId: payload.documentId })).toBe(1);
  });

  test("the returned record still verifies against its signature", async () => {
    const payload = newDocumentPayload();
    await createVerificationQR(payload);
    await createVerificationQR(payload);

    // select:false on the hash, so it has to be asked for explicitly.
    const stored = await QRAsset.findOne({
      documentId: payload.documentId,
    }).select("+verificationHash");

    expect(verifyVerificationHash(stored)).toBe(true);
  });

  test("does not re-render the QR image on a replay", async () => {
    const payload = newDocumentPayload();

    const first = await createVerificationQR(payload);
    const second = await createVerificationQR(payload);

    // Rendering is deterministic, so identical bytes would prove nothing. The
    // stored path being untouched is what shows the replay short-circuited
    // before the renderer.
    expect(second.asset.qrCodePath).toBe(first.asset.qrCodePath);
    expect(second.asset.verificationUrl).toBe(first.asset.verificationUrl);
  });
});

test.describe("Conflicts we refuse to absorb", () => {
  test("rejects the same documentId carrying a different qrCodeId", async () => {
    const payload = newDocumentPayload();
    await createVerificationQR(payload);

    // Returning the stored QR here would hand Squad A a code that no longer
    // matches what their database says. A silent divergence is worse than a
    // loud error.
    let error = null;
    try {
      await createVerificationQR({ ...payload, qrCodeId: randomUUID() });
    } catch (err) {
      error = err;
    }

    expect(error).not.toBeNull();
    expect(error.code).toBe("QR_CODE_ID_CONFLICT");
    expect(error.status).toBe(409);
    expect(error.details.issuedQrCodeId).toBe(payload.qrCodeId);
  });

  test("rejects a qrCodeId already bound to another document", async () => {
    const payload = newDocumentPayload();
    await createVerificationQR(payload);

    let error = null;
    try {
      await createVerificationQR({ ...payload, documentId: randomUUID() });
    } catch (err) {
      error = err;
    }

    expect(error).not.toBeNull();
    expect(error.code).toBe("QR_CODE_ID_CONFLICT");
  });

  test("a rejected conflict does not modify the stored record", async () => {
    const payload = newDocumentPayload();
    const { asset } = await createVerificationQR(payload);

    await createVerificationQR({ ...payload, qrCodeId: randomUUID() }).catch(
      () => {}
    );

    const stored = await QRAsset.findOne({ documentId: payload.documentId });
    expect(stored.qrCodeId).toBe(payload.qrCodeId);
    expect(stored.issuedAt.getTime()).toBe(asset.issuedAt.getTime());
    expect(await QRAsset.countDocuments({ documentId: payload.documentId })).toBe(1);
  });
});
