const mongoose = require("mongoose");

const ContactSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true // 🟢 NEW: Every contact MUST belong to a specific user
  },
  name: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
  relation: {
    type: String,
    default: "Emergency",
  },
});

module.exports = mongoose.model("Contact", ContactSchema);