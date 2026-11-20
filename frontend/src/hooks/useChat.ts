"use client";

import { useChatContext } from "../context/ChatContext";
import type { ChatMessage } from "../context/ChatContext";
import { sendChatMessage } from "../services/chatService";

interface ChatApiError {
  response?: {
    data?: {
      detail?: string;
      error?: {
        message?: string;
      };
    };
  };
  message?: string;
}

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const apiError = error as ChatApiError;

    const message =
      apiError.response?.data?.detail ||
      apiError.response?.data?.error?.message ||
      apiError.message;

    if (typeof message === "string") {
      return message;
    }

    if (message) {
      return JSON.stringify(message);
    }
  }

  return "Unable to connect to the backend. Please check the API server.";
}

export default function useChat() {
  const {
    messages,
    setMessages,
    loading,
    setLoading,
    currentDocument,
  } = useChatContext();

  const sendMessage = async (message: string): Promise<void> => {
    if (!message?.trim() || loading) return;

    const documentId =
      currentDocument?.document_id || currentDocument?.id;

    if (!documentId) {
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: "Please upload a PDF document before chatting.",
      };

      setMessages((previous) => [...previous, assistantMessage]);
      return;
    }

    const userMessage: ChatMessage = {
      role: "user",
      content: message.trim(),
    };

    const history: ChatMessage[] = messages
      .slice(-12)
      .map((msg) => ({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content,
      }));

    setMessages((previous) => [...previous, userMessage]);
    setLoading(true);

    try {
      const response = await sendChatMessage(
        message.trim(),
        String(documentId),
        history
      );

      const aiMessage: ChatMessage = {
        role: "assistant",
        content:
          response.answer ||
          response.response ||
          response.message ||
          "No response received from the AI.",
      };

      setMessages((previous) => [...previous, aiMessage]);
    } catch (error: unknown) {
      console.error("Chat API error:", error);

      const errorMessage = getErrorMessage(error);

      const aiErrorMessage: ChatMessage = {
        role: "assistant",
        content: errorMessage,
      };

      setMessages((previous) => [
        ...previous,
        aiErrorMessage,
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