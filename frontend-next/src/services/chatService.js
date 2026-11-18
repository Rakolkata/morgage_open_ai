
import api from "./api";

export const sendChatMessage = async (message, documentId) => {
  const response = await api.post("/api/chat", {
    message,
    document_id: documentId,
  });

  return response.data;
};
