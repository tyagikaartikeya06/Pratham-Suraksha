const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema({
  name: String,
  phone: String,
  relation: String
});

module.exports = mongoose.model("Contact", contactSchema);
