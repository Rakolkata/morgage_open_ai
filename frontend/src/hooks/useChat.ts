"use client";

import { useChatContext } from "../context/ChatContext";
import type { ChatMessage } from "../context/ChatContext";
import { sendChatMessage } from "../services/chatService";
import { uploadDocument } from "../services/documentService";

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
    setCurrentDocument,
    selectedFile,
    setSelectedFile,
  } = useChatContext();

  const sendMessage = async (message: string): Promise<void> => {
    const text = message?.trim();
    if (!text || loading) return;

    let docId = currentDocument?.document_id || currentDocument?.id;

    if (!docId && !selectedFile) {
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: "Please select a PDF document first before sending instructions.",
      };

      setMessages((previous) => [...previous, assistantMessage]);
      return;
    }

    const userMessage: ChatMessage = {
      role: "user",
      content: text,
    };

    setMessages((previous) => [...previous, userMessage]);
    setLoading(true);

    try {
      // 1. If a new file is attached, upload to uploads/ folder and save instruction to database
      if (selectedFile) {
        const uploadResult = await uploadDocument(selectedFile, text);
        docId = uploadResult.document_id || uploadResult.id;

        setCurrentDocument({
          id: String(docId),
          document_id: String(docId),
          name: uploadResult.filename,
          filename: uploadResult.filename,
          storage_path: uploadResult.storage_path,
          instruction: text,
          page_count: uploadResult.page_count ?? null,
          status: "Uploaded",
        });

        setSelectedFile(null);
      }

      // 2. Send the chat message / instruction with the document ID
      const history: ChatMessage[] = messages
        .slice(-12)
        .map((msg) => ({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content,
        }));

      const response = await sendChatMessage(
        text,
        String(docId),
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
