
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

interface ChatApiResponse {
  success?: boolean;
  answer?: string;
  response?: string;
  message?: string;
  agent_name?: string | null;
  agent_output?: Record<string, unknown> | null;
  extraction_plan?: Record<string, unknown> | null;
  extracted_fields?: Record<string, unknown> | null;
  status?: string;
  [key: string]: unknown;
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

function getResponseContent(response: ChatApiResponse): string {
  return JSON.stringify(response, null, 2);
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
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content:
            "Please select a PDF document first before sending instructions.",
        },
      ]);
      return;
    }

    const userMessage: ChatMessage = {
      role: "user",
      content: text,
    };

    setMessages((previous) => [...previous, userMessage]);
    setLoading(true);

    try {
      // ---------------------------------------------
      // 1. DOCUMENT UPLOAD / DOCUMENT ANALYSIS
      // ---------------------------------------------

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          agent: "Document Assistant",
          content: "📄 Document Analysis — preparing document for extraction...",
        },
      ]);

      if (selectedFile) {
        console.log("DOCUMENT UPLOAD STARTED");

        const uploadResult = await uploadDocument(selectedFile, text);

        console.log("DOCUMENT UPLOAD RESPONSE:", uploadResult);

        docId = uploadResult.document_id || uploadResult.id;

        if (!docId) {
          throw new Error("Document upload did not return a document ID.");
        }

        setCurrentDocument({
          id: String(docId),
          document_id: String(docId),
          name: uploadResult.filename,
          filename: uploadResult.filename,
          storage_path: uploadResult.storage_path,
          instruction: text,
          page_count: uploadResult.page_count ?? undefined,
          status: "Uploaded",
        });

        setSelectedFile(null);

        // Replace the document analysis status message.
        setMessages((previous) => {
          const updated = [...previous];

          const index = updated.findIndex(
            (msg) =>
              msg.role === "assistant" &&
              msg.content.startsWith("📄 Document Analysis")
          );

          if (index !== -1) {
            updated[index] = {
              role: "assistant",
              agent: "Document Assistant",
              content: `📄 Document Analysis — ${uploadResult.filename} uploaded successfully. Preparing extraction workflow.`,
            };
          }

          return updated;
        });
      } else {
        setMessages((previous) => {
          const updated = [...previous];

          const index = updated.findIndex(
            (msg) =>
              msg.role === "assistant" &&
              msg.content.startsWith("📄 Document Analysis")
          );

          if (index !== -1) {
            updated[index] = {
              role: "assistant",
              agent: "Document Assistant",
              content: "📄 Document Analysis — using uploaded document.",
            };
          }

          return updated;
        });
      }

      if (!docId) {
        throw new Error("Document ID is missing.");
      }

      const documentId = String(docId);

      // ---------------------------------------------
      // 2. PREPARE HISTORY
      // ---------------------------------------------

      const history = messages
        .slice(-12)
        .map((msg) => ({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content,
        }));

      // ---------------------------------------------
      // 3. ORCHESTRATOR REQUEST
      // ---------------------------------------------

      console.log("ORCHESTRATOR API REQUEST STARTED");

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          agent: "Orchestrator Agent",
          content: "⏳ Orchestrator API Request Started...",
        },
      ]);

      const orchestratorResponse = (await sendChatMessage(
        text,
        documentId,
        history,
        "orchestrator"
      )) as ChatApiResponse;

      console.log("ORCHESTRATOR RESPONSE:", orchestratorResponse);

      if (orchestratorResponse.success === false) {
        throw new Error("Orchestrator API failed.");
      }

      // Display the actual Orchestrator API response.
      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          agent: orchestratorResponse.agent_name || "Orchestrator Agent",
          content: getResponseContent(orchestratorResponse),
        },
      ]);

      // ---------------------------------------------
      // 4. DATA EXTRACTOR REQUEST
      // ---------------------------------------------

      console.log("DATA EXTRACTOR API REQUEST STARTED");

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          agent: "Data Extractor Agent",
          content: "⏳ Data Extractor API Request Started...",
        },
      ]);

      const extractorResponse = (await sendChatMessage(
        text,
        documentId,
        history,
        "data_extractor"
      )) as ChatApiResponse;

      console.log("DATA EXTRACTOR RESPONSE:", extractorResponse);

      if (extractorResponse.success === false) {
        throw new Error("Data Extractor API failed.");
      }

      // ---------------------------------------------
      // 5. DISPLAY ACTUAL EXTRACTOR RESPONSE
      // ---------------------------------------------

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          agent: extractorResponse.agent_name || "Data Extractor Agent",
          content: getResponseContent(extractorResponse),
        },
      ]);

    } catch (error: unknown) {
      console.error("CHAT WORKFLOW ERROR:", error);

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          agent: "Workflow Error",
          content: getErrorMessage(error),
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
