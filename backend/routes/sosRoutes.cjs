const express = require("express");
const router = express.Router();
const sendSMS = require("../utils/sendSMS.cjs");
const SOS = require("../models/Sos.cjs");

router.post("/", async (req, res) => {
  const { type, location, contacts, mediaData, mediaType } = req.body;

  const mapLink = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
  const message = `SOS ALERT! ${type} I need help. Location: ${mapLink}`;

  try {
    const sos = new SOS({
      type,
      message,
      location,
      contacts,
      mediaData, // 🟢 Save Video Data
      mediaType,
    });
    await sos.save();
    console.log("✅ SOS Data/Video Saved to DB");

    // Only send API SMS if it's NOT a background video upload 
    // (To save SMS credits and avoid spamming while recording chunks)
    if (!mediaData) {
        await sendSMS(contacts, message);
    }

    res.json({ success: true, msg: "SOS Saved Successfully" });
  } catch (err) {
    console.error("SOS Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;