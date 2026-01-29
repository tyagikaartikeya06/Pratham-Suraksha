const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet"); // 🟢 SECURITY: Protects HTTP headers

const contactRoutes = require("./routes/contactRoutes");
const sosRoutes = require("./routes/sosRoutes.cjs");

dotenv.config();
const app = express();

// 🟢 SECURITY: Enable Helmet to hide server details and enforce security
app.use(helmet());

// 🟢 SECURITY: Restrict CORS (Who can talk to this server?)
// In development, we allow all ('*'). 
// Once deployed, you can replace '*' with your Netlify App URL (e.g., "https://pratham-suraksha.netlify.app")
app.use(cors({
  origin: "*", 
  methods: ["GET", "POST"],
  credentials: true
}));

// 🟢 EFFICIENCY: 50MB Limit for Video/Audio Uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

console.log("🔥 Secure Server Loading...");

// Connect to MongoDB (Data is Encrypted at Rest by Atlas)
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected (Encrypted)"))
  .catch((err) => console.error("❌ Mongo Error:", err));

app.use("/api/contacts", contactRoutes);
app.use("/api/sos", sosRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Secure Server running on port ${PORT}`);
});