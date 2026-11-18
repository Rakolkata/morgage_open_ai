
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
    if (!message.trim() || loading) return;

    const userMessage = {
      role: "user",
      content: message,
    };

    setMessages((previous) => [...previous, userMessage]);
    setLoading(true);

    try {
      const response = await sendChatMessage(
        message,
        currentDocument?.id
      );

      const aiMessage = {
        role: "assistant",
        content:
          response.response ||
          response.answer ||
          response.message ||
          "No response received from the AI.",
      };

      setMessages((previous) => [...previous, aiMessage]);
    } catch (error) {
      console.error("Chat API error:", error);

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content:
            error.response?.data?.detail ||
            "Unable to connect to the backend. Please check the API server.",
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
