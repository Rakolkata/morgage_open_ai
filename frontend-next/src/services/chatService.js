import api from "./api";

export const sendChatMessage = async (message, documentId, history = []) => {
  if (!documentId) {
    throw new Error("Please upload a document before sending a chat message.");
  }

  if (!message || !message.trim()) {
    throw new Error("Message cannot be empty.");
  }

  const payload = {
    document_id: String(documentId),
    message: message.trim(),
    history: Array.isArray(history) ? history : [],
  };

  const response = await api.post("/api/chat", payload);

  return response.data;
};
