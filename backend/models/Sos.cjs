const mongoose = require("mongoose");

const sosSchema = new mongoose.Schema({
  type: String, // police | ambulance | family
  message: String,
  location: {
    lat: Number,
    lng: Number,
  },
  contacts: [String],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("SOS", sosSchema);
