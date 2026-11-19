"use client";

import { useChatContext } from "../context/ChatContext";
import { sendChatMessage } from "../services/chatService";

export default function useChat() {
  const {
    messages,
    setMessages,
    loading,
    setLoading,
    currentDocument,
  } = useChatContext();

  const sendMessage = async (message) => {
    if (!message?.trim() || loading) return;

    // Support both possible document ID field names
    const documentId =
      currentDocument?.document_id || currentDocument?.id;

    if (!documentId) {
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: "Please upload a PDF document before chatting.",
        },
      ]);
      return;
    }

    const userMessage = {
      role: "user",
      content: message.trim(),
    };

    // Keep the previous messages as conversation history
    const history = messages
      .slice(-12)
      .map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

    setMessages((previous) => [...previous, userMessage]);
    setLoading(true);

    try {
      const response = await sendChatMessage(
        message.trim(),
        documentId,
        history
      );

      const aiMessage = {
        role: "assistant",
        content:
          response.answer ||
          response.response ||
          response.message ||
          "No response received from the AI.",
      };

      setMessages((previous) => [...previous, aiMessage]);
    } catch (error) {
      console.error("Chat API error:", error);

      const errorMessage =
        error.response?.data?.detail ||
        error.response?.data?.error?.message ||
        error.message ||
        "Unable to connect to the backend. Please check the API server.";

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: typeof errorMessage === "string"
            ? errorMessage
            : JSON.stringify(errorMessage),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return {
    messages,
    loading,
    sendMessage,
  };
}