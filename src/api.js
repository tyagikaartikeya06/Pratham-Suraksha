const BASE_URL = "http://localhost:5000/api";

export const addContact = async (contact) => {
  const res = await fetch(`${BASE_URL}/contacts/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(contact)
  });
  return res.json();
};

export const getContacts = async () => {
  const res = await fetch(`${BASE_URL}/contacts/list`);
  return res.json();
};
