const mongoose = require("mongoose");

const sosSchema = new mongoose.Schema({
  type: String, 
  message: String,
  location: {
    lat: Number,
    lng: Number,
  },
  contacts: [String],
  mediaData: String, // 🟢 Stores the Base64 Video/Audio
  mediaType: String, // 🟢 Stores 'video/webm' etc.
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("SOS", sosSchema);