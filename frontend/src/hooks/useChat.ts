
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
  error?: string;
  answer?: string;
  response?: string;
  message?: string;
  agent_name?: string | null;
  agent_output?: Record<string, unknown> | null;
  extraction_plan?: Record<string, unknown> | null;
  extracted_fields?: Record<string, unknown> | null;
  download_url?: string | null;
  download_format?: string | null;
  available_downloads?: Record<string, string> | null;
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

function extractPlanObject(
  response: ChatApiResponse
): Record<string, unknown> | null {
  if (
    response.extraction_plan &&
    typeof response.extraction_plan === "object"
  ) {
    return response.extraction_plan as Record<string, unknown>;
  }

  if (
    response.agent_output &&
    typeof response.agent_output === "object"
  ) {
    const out = response.agent_output as Record<string, unknown>;
    if (out.extraction_plan && typeof out.extraction_plan === "object") {
      return out.extraction_plan as Record<string, unknown>;
    }
    if (Array.isArray(out.fields_to_extract)) {
      return out;
    }
  }

  if (typeof response.answer === "string") {
    try {
      const parsed = JSON.parse(response.answer);
      if (parsed && typeof parsed === "object") {
        if (
          parsed.extraction_plan &&
          typeof parsed.extraction_plan === "object"
        ) {
          return parsed.extraction_plan as Record<string, unknown>;
        }
        if (Array.isArray(parsed.fields_to_extract)) {
          return parsed as Record<string, unknown>;
        }
      }
    } catch {
      const match = response.answer.match(
        /```(?:json)?\s*([\s\S]*?)\s*```/
      );
      if (match && match[1]) {
        try {
          const parsedFence = JSON.parse(match[1]);
          if (parsedFence && typeof parsedFence === "object") {
            if (Array.isArray(parsedFence.fields_to_extract)) {
              return parsedFence as Record<string, unknown>;
            }
          }
        } catch {
          // ignore
        }
      }
    }
  }

  return null;
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
    selectedAgent,
    refreshExtractedData,
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
      // 3. EXECUTE SELECTED ACTIVE AGENT
      // ---------------------------------------------

      const normalizedAgent = (selectedAgent || "orchestrator")
        .trim()
        .toLowerCase()
        .replace(/-/g, "_");

      const agentDisplayNameMap: Record<string, string> = {
        orchestrator: "Orchestrator Agent",
        data_extractor: "Data Extractor Agent",
        auditor: "Auditor Agent",
      };

      const agentDisplayName =
        agentDisplayNameMap[normalizedAgent] || "AI Agent";

      console.log(`${normalizedAgent.toUpperCase()} API REQUEST STARTED`);

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          agent: agentDisplayName,
          content: `⏳ ${agentDisplayName} — Processing request...`,
        },
      ]);

      const response = (await sendChatMessage(
        text,
        documentId,
        history,
        normalizedAgent
      )) as ChatApiResponse;

      console.log(`${normalizedAgent.toUpperCase()} RESPONSE:`, response);

      if (response.success === false) {
        throw new Error(
          typeof response.error === "string"
            ? response.error
            : `${agentDisplayName} failed to respond.`
        );
      }

      // Display the actual Agent API response, replacing the pending status message
      setMessages((previous) => {
        const updated = [...previous];
        let pendingIdx = -1;

        for (let i = updated.length - 1; i >= 0; i--) {
          if (
            updated[i].role === "assistant" &&
            updated[i].agent === agentDisplayName &&
            typeof updated[i].content === "string" &&
            updated[i].content.startsWith("⏳")
          ) {
            pendingIdx = i;
            break;
          }
        }

        const finalMsg: ChatMessage = {
          role: "assistant",
          agent: response.agent_name || agentDisplayName,
          content: getResponseContent(response),
        };

        if (pendingIdx !== -1) {
          updated[pendingIdx] = finalMsg;
          return updated;
        }

        return [...updated, finalMsg];
      });

      // Refresh extracted fields in side panel if data extractor or auditor was executed
      if (normalizedAgent === "data_extractor" || normalizedAgent === "auditor") {
        try {
          await refreshExtractedData();
        } catch (refreshErr) {
          console.warn("Could not refresh extracted data:", refreshErr);
        }
      }

      // ---------------------------------------------
      // AUTOMATIC DATA EXTRACTOR TRIGGER (if Orchestrator was executed)
      // ---------------------------------------------
      if (normalizedAgent === "orchestrator") {
        const planObj = extractPlanObject(response);
        const fieldsToExtract = Array.isArray(planObj?.fields_to_extract)
          ? (planObj.fields_to_extract as string[])
          : [];

        if (fieldsToExtract.length > 0) {
          const documentTypes = Array.isArray(planObj?.document_types)
            ? (planObj.document_types as string[])
            : ["LE"];

          const instructions = Array.isArray(planObj?.instructions)
            ? (planObj.instructions as string[])
            : [];

          const extractorPayload = JSON.stringify(
            {
              document_types: documentTypes,
              fields_to_extract: fieldsToExtract,
              instructions: instructions,
            },
            null,
            2
          );

          console.log(
            "AUTOMATIC TRIGGER: DATA EXTRACTOR WITH PREPARED PLAN:",
            extractorPayload
          );

          // Add status message for Data Extractor
          setMessages((previous) => [
            ...previous,
            {
              role: "assistant",
              agent: "Data Extractor Agent",
              content:
                "⏳ Data Extractor Agent — Extracting fields using orchestrator plan...",
            },
          ]);

          const extractorResponse = (await sendChatMessage(
            extractorPayload,
            documentId,
            history,
            "data_extractor"
          )) as ChatApiResponse;

          console.log("DATA EXTRACTOR RESPONSE:", extractorResponse);

          if (extractorResponse.success === false) {
            throw new Error(
              typeof extractorResponse.error === "string"
                ? extractorResponse.error
                : "Data Extractor Agent failed to extract data."
            );
          }

          // Replace the Data Extractor pending message with the actual extraction response
          setMessages((previous) => {
            const updated = [...previous];
            let pendingIdx = -1;

            for (let i = updated.length - 1; i >= 0; i--) {
              if (
                updated[i].role === "assistant" &&
                updated[i].agent === "Data Extractor Agent" &&
                typeof updated[i].content === "string" &&
                updated[i].content.startsWith("⏳")
              ) {
                pendingIdx = i;
                break;
              }
            }

            const extractorMsg: ChatMessage = {
              role: "assistant",
              agent: extractorResponse.agent_name || "Data Extractor Agent",
              content: getResponseContent(extractorResponse),
            };

            if (pendingIdx !== -1) {
              updated[pendingIdx] = extractorMsg;
              return updated;
            }

            return [...updated, extractorMsg];
          });

          // Refresh the inspection sidebar
          try {
            await refreshExtractedData();
          } catch (refreshErr) {
            console.warn("Could not refresh extracted data:", refreshErr);
          }
        }
      }

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
