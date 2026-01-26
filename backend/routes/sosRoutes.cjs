const express = require("express");
const router = express.Router();
const sendSMS = require("../utils/sendSMS.cjs");
const SOS = require("../models/Sos.cjs");

router.post("/", async (req, res) => { // Changed "/send" to "/" to match App.jsx
  const { type, location, contacts } = req.body;

  // 🛠️ AUTO-GENERATE MESSAGE (Since frontend UI doesn't send one)
  // Create a Google Maps link
  const mapLink = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
  const message = `SOS ALERT! ${type} needed. Location: ${mapLink}`;

  try {
    // 1. Save in DB
    const sos = new SOS({
      type,
      message, // We save the generated message
      location,
      contacts,
    });
    await sos.save();
    console.log("✅ SOS Saved to DB");

    // 2. Send SMS
    // We only pass the numbers array and the message string
    await sendSMS(contacts, message);

    res.json({ success: true, msg: "SOS Sent & Saved Successfully" });
  } catch (err) {
    console.error("SOS Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;