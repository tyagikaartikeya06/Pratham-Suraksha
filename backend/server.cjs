const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");

const contactRoutes = require("./routes/contactRoutes");
const sosRoutes = require("./routes/sosRoutes.cjs");

dotenv.config();
const app = express();

app.use(cors());

// 🟢 CRITICAL: Increase limit to 50MB for Video Recording
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

console.log("🔥 server.js file loaded");

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ Mongo Error:", err));

app.use("/api/contacts", contactRoutes);
app.use("/api/sos", sosRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});