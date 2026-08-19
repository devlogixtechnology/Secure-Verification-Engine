
const express = require("express");
const router = express.Router();
const { sendAssetEmail, handleWebhook } = require("../controllers/emailcontroller");

// POST /api/email/send
router.post("/send", sendAssetEmail);

// POST /api/email/webhook
router.post("/webhook", handleWebhook);

module.exports = router;
