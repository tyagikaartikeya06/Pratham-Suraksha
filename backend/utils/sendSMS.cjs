const axios = require("axios");

const sendSMS = async (numbers, message) => {
  try {
    const response = await axios.post(
      "https://www.fast2sms.com/dev/bulkV2",
      {
        route: "q",
        message: message,
        language: "english",
        numbers: numbers.join(","),
      },
      {
        headers: {
          authorization: process.env.FAST2SMS_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("✅ SMS Sent:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ SMS Error:", error.message);
  }
};

module.exports = sendSMS;
