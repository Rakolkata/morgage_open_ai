
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  getConversations,
  saveConversation,
} from "../services/historyService";

// -----------------------------
// Types
// -----------------------------

export interface ChatMessage {
  role: "user" | "assistant" | "system" | string;
  content: string;
  agent?: string;
  [key: string]: unknown;
}

export interface DocumentData {
  id?: string;
  document_id?: string;
  filename?: string;
  page_count?: number;
  data?: {
    id?: string;
    document_id?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ExtractedField {
  id: string;
  field_path: string;
  value: string;
  status: string;
  document_type?: string | null;
  page?: number | null;
  source_text?: string | null;
  confidence?: number | null;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  document: DocumentData | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditFinding {
  field_path: string;
  status: string;
  extracted_value?: string | null;
  document_value?: string | null;
  page?: number | string | null;
  explanation?: string | null;
}

export interface AuditResultData {
  total_checks?: number;
  passed?: number;
  exceptions?: number;
  missing_evidence?: number;
  verdict?: string;
  findings?: AuditFinding[];
  download_url?: string | null;
  file_format?: string | null;
  export_filename?: string | null;
  available_downloads?: Record<string, string> | null;
  updated_at?: string;
}

interface ChatContextType {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  addMessage: (message: ChatMessage) => void;

  currentDocument: DocumentData | null;
  setCurrentDocument: (document: DocumentData | null) => void;

  extractedFields: ExtractedField[];
  setExtractedFields: React.Dispatch<
    React.SetStateAction<ExtractedField[]>
  >;
  extractedDataLoading: boolean;
  extractedDataError: string | null;
  refreshExtractedData: () => Promise<void>;
  saveExtractedFields: (
    fields: ExtractedField[]
  ) => Promise<void>;

  auditResult: AuditResultData | null;
  setAuditResult: (result: AuditResultData | null) => void;

  selectedFile: File | null;
  setSelectedFile: (file: File | null) => void;

  selectedAgent: string;
  setSelectedAgent: (agent: string) => void;

  inputPrompt: string;
  setInputPrompt: (prompt: string) => void;

  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;

  clearChat: () => void;

  conversations: Conversation[];
  activeConversationId: string | null;
  openConversation: (id: string) => void;
}

interface ChatProviderProps {
  children: ReactNode;
}

// -----------------------------
// Context
// -----------------------------

const ChatContext = createContext<ChatContextType | undefined>(
  undefined
);

// -----------------------------
// Normalize document IDs
// -----------------------------

function normalizeDocument(
  document: DocumentData | null | undefined
): DocumentData | null {
  if (!document) return null;

  const documentId =
    document.document_id ||
    document.id ||
    document.data?.document_id ||
    document.data?.id;

  if (!documentId) return document;

  return {
    ...document,
    id: String(documentId),
    document_id: String(documentId),
  };
}

function getDocumentId(
  document: DocumentData | null
): string | null {
  const normalized = normalizeDocument(document);

  return normalized?.document_id || normalized?.id || null;
}

// -----------------------------
// Provider
// -----------------------------

export function ChatProvider({
  children,
}: ChatProviderProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentDocument, setCurrentDocumentState] =
    useState<DocumentData | null>(null);

  const [extractedFields, setExtractedFields] =
    useState<ExtractedField[]>([]);
  const [extractedDataLoading, setExtractedDataLoading] =
    useState(false);
  const [extractedDataError, setExtractedDataError] =
    useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string>("orchestrator");
  const [inputPrompt, setInputPrompt] = useState<string>("");
  const [auditResult, setAuditResult] = useState<AuditResultData | null>(null);

  const [loading, setLoading] = useState<boolean>(false);

  const [conversations, setConversations] =
    useState<Conversation[]>([]);

  const [activeConversationId, setActiveConversationId] =
    useState<string | null>(null);

  const [historyLoaded, setHistoryLoaded] =
    useState<boolean>(false);

  // -----------------------------
  // Update current document
  // -----------------------------

  const updateCurrentDocument = (
    document: DocumentData | null
  ): void => {
    setCurrentDocumentState(normalizeDocument(document));
  };

  // -----------------------------
  // Load extracted data from PostgreSQL
  // -----------------------------

  const refreshExtractedData = useCallback(async () => {
    const documentId = getDocumentId(currentDocument);

    if (!documentId) {
      setExtractedFields([]);
      setExtractedDataError(null);
      return;
    }

    setExtractedDataLoading(true);
    setExtractedDataError(null);

    try {
      const response = await fetch(
        `/api/documents/${encodeURIComponent(documentId)}/extracted-data`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Failed to load extracted data"
        );
      }

      setExtractedFields(
        Array.isArray(result.fields) ? result.fields : []
      );

      if (result.audit_result) {
        setAuditResult({
          ...result.audit_result,
          download_url: result.download_url || result.audit_result.download_url || null,
          file_format: result.download_format || result.audit_result.file_format || "excel",
          available_downloads: result.available_downloads || result.audit_result.available_downloads || {},
        });
      }
    } catch (error) {
      console.error("LOAD EXTRACTED DATA ERROR:", error);

      setExtractedDataError(
        error instanceof Error
          ? error.message
          : "Unable to load extracted data"
      );
    } finally {
      setExtractedDataLoading(false);
    }
  }, [currentDocument]);

  // Load saved data whenever the selected document changes.
  useEffect(() => {
    if (!getDocumentId(currentDocument)) {
      setExtractedFields([]);
      setExtractedDataError(null);
      return;
    }

    void refreshExtractedData();
  }, [currentDocument, refreshExtractedData]);

  // -----------------------------
  // Save edited fields to PostgreSQL
  // -----------------------------

  const saveExtractedFields = async (
    fields: ExtractedField[]
  ): Promise<void> => {
    const documentId = getDocumentId(currentDocument);

    if (!documentId) {
      throw new Error("Please select a document first.");
    }

    const response = await fetch(
      `/api/documents/${encodeURIComponent(documentId)}/extracted-data`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fields }),
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.error || "Failed to save extracted data"
      );
    }

    setExtractedFields(
      Array.isArray(result.fields) ? result.fields : fields
    );

    setExtractedDataError(null);
  };

  // -----------------------------
  // Load saved conversations
  // -----------------------------

  useEffect(() => {
    try {
      const savedConversations =
        getConversations() || [];

      const normalizedConversations: Conversation[] =
        savedConversations.map(
          (conversation: Conversation) => ({
            ...conversation,
            document: normalizeDocument(
              conversation.document
            ),
            messages: conversation.messages || [],
          })
        );

      setConversations(normalizedConversations);

      if (normalizedConversations.length > 0) {
        const latest = [...normalizedConversations].sort(
          (a, b) =>
            new Date(
              b.updatedAt || b.createdAt || 0
            ).getTime() -
            new Date(
              a.updatedAt || a.createdAt || 0
            ).getTime()
        )[0];

        setActiveConversationId(latest.id);
        setMessages(latest.messages || []);

        setCurrentDocumentState(
          normalizeDocument(latest.document)
        );
      }
    } catch (error) {
      console.error("Failed to load chat history:", error);
    } finally {
      setHistoryLoaded(true);
    }
  }, []);

  // -----------------------------
  // Save active conversation
  // -----------------------------

  useEffect(() => {
    if (!historyLoaded || messages.length === 0) {
      return;
    }

    const id =
      activeConversationId ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `chat-${Date.now()}`);

    const existingConversation = conversations.find(
      (conversation) => conversation.id === id
    );

    // Only update and put first if there are actual new or changed messages
    const hasNewOrChangedMessages =
      !existingConversation ||
      messages.length !== (existingConversation.messages?.length ?? 0) ||
      messages[messages.length - 1]?.content !==
        existingConversation.messages?.[existingConversation.messages.length - 1]?.content;

    if (!hasNewOrChangedMessages) {
      return;
    }

    const firstUserMessage = messages.find(
      (message) => message.role === "user"
    );

    const normalizedDocument =
      normalizeDocument(currentDocument);

    const conversation: Conversation = {
      id,
      title: firstUserMessage
        ? firstUserMessage.content.slice(0, 55)
        : existingConversation?.title || "New chat",
      messages,
      document: normalizedDocument,
      createdAt:
        existingConversation?.createdAt ||
        new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!activeConversationId) {
      setActiveConversationId(id);
    }

    setConversations((previous) => [
      conversation,
      ...previous.filter((item) => item.id !== id),
    ]);

    try {
      saveConversation(conversation);
    } catch (error) {
      console.error("Failed to save conversation:", error);
    }
  }, [
    messages,
    currentDocument,
    activeConversationId,
    historyLoaded,
  ]);

  // -----------------------------
  // Add message
  // -----------------------------

  const addMessage = (message: ChatMessage): void => {
    setMessages((previous) => [...previous, message]);
  };

  // -----------------------------
  // Clear chat
  // -----------------------------

  const clearChat = (): void => {
    setMessages([]);
    setCurrentDocumentState(null);
    setExtractedFields([]);
    setExtractedDataError(null);
    setAuditResult(null);
    setSelectedFile(null);
    setInputPrompt("");
    setActiveConversationId(null);
    setLoading(false);
  };

  // -----------------------------
  // Open conversation
  // -----------------------------

  const openConversation = (id: string): void => {
    const conversation = conversations.find(
      (item) => item.id === id
    );

    if (!conversation) return;

    setLoading(false);
    setActiveConversationId(conversation.id);
    setMessages(conversation.messages || []);

    setCurrentDocumentState(
      normalizeDocument(conversation.document)
    );
  };

  // -----------------------------
  // Context value
  // -----------------------------

  const contextValue: ChatContextType = {
    messages,
    setMessages,
    addMessage,

    currentDocument,
    setCurrentDocument: updateCurrentDocument,

    extractedFields,
    setExtractedFields,
    extractedDataLoading,
    extractedDataError,
    refreshExtractedData,
    saveExtractedFields,

    selectedFile,
    setSelectedFile,

    selectedAgent,
    setSelectedAgent,

    inputPrompt,
    setInputPrompt,

    loading,
    setLoading,

    clearChat,

    auditResult,
    setAuditResult,

    conversations,
    activeConversationId,
    openConversation,
  };

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
}

// -----------------------------
// Custom Hook
// -----------------------------

export function useChatContext(): ChatContextType {
  const context = useContext(ChatContext);

  if (!context) {
    throw new Error(
      "useChatContext must be used inside ChatProvider"
    );
  }

  return context;
}
