const Contact = require("../models/Contact");

exports.addContact = async (req, res) => {
  try {
    // 🟢 Save the contact WITH the userId sent from frontend
    const contact = new Contact(req.body);
    await contact.save();
    res.status(201).json(contact);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getContacts = async (req, res) => {
  try {
    // 🟢 Get the userId from the request URL (e.g. ?userId=123)
    const { userId } = req.query; 
    
    if (!userId) {
        // If no ID is provided, return empty list (Privacy Protection)
        return res.json([]); 
    }

    // 🟢 ONLY return contacts that match this userId
    const contacts = await Contact.find({ userId: userId });
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// (Keep deleteContact as is)
exports.deleteContact = async (req, res) => {
  try {
    const { id } = req.params;
    await Contact.findByIdAndDelete(id);
    res.json({ message: "Contact deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};