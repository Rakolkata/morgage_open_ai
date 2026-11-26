import api from "./api";

interface ChatHistoryMessage {
  role: string;
  content: string;
}

interface ChatResponse {
  answer?: string;
  response?: string;
  message?: string;
  [key: string]: unknown;
}

export const sendChatMessage = async (
  message: string,
  documentId: string,
  history: ChatHistoryMessage[] = [],
  agent: string = "orchestrator",
  extraData?: Record<string, unknown>
): Promise<ChatResponse> => {
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
    agent: agent || "orchestrator",
    ...(extraData || {}),
  };

  const response = await api.post("/api/chat", payload);

  return response.data;
};