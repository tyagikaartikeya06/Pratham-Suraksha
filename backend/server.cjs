const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");

// ✅ IMPORT REAL ROUTES
const contactRoutes = require("./routes/contactRoutes");
const sosRoutes = require("./routes/sosRoutes.cjs"); // Import the SOS logic

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

console.log("🔥 server.js file loaded");
console.log("🔄 Trying MongoDB connection...");

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ Mongo Error:", err));

// ✅ USE REAL ROUTES
app.use("/api/contacts", contactRoutes);
app.use("/api/sos", sosRoutes); // Connects /api/sos to your actual logic

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});