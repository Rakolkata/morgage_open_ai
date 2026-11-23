"use client";

import {
  createContext,
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
  data?: {
    id?: string;
    document_id?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  document: DocumentData | null;
  createdAt: string;
  updatedAt: string;
}

interface ChatContextType {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  addMessage: (message: ChatMessage) => void;

  currentDocument: DocumentData | null;
  setCurrentDocument: (document: DocumentData | null) => void;

  selectedFile: File | null;
  setSelectedFile: (file: File | null) => void;

  selectedAgent: string;
  setSelectedAgent: (agent: string) => void;

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
    id: documentId,
    document_id: documentId,
  };
}

// -----------------------------
// Provider
// -----------------------------

export function ChatProvider({
  children,
}: ChatProviderProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentDocument, setCurrentDocument] =
    useState<DocumentData | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string>("orchestrator");

  const [loading, setLoading] = useState<boolean>(false);

  const [conversations, setConversations] =
    useState<Conversation[]>([]);

  const [activeConversationId, setActiveConversationId] =
    useState<string | null>(null);

  const [historyLoaded, setHistoryLoaded] =
    useState<boolean>(false);

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

        setCurrentDocument(
          normalizeDocument(latest.document)
        );
      }
    } catch (error) {
      console.error(
        "Failed to load chat history:",
        error
      );
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
      (typeof crypto !== "undefined" &&
      crypto.randomUUID
        ? crypto.randomUUID()
        : `chat-${Date.now()}`);

    const existingConversation =
      conversations.find(
        (conversation) => conversation.id === id
      );

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

    setConversations((previous) => {
      return [
        conversation,
        ...previous.filter(
          (item) => item.id !== id
        ),
      ];
    });

    try {
      saveConversation(conversation);
    } catch (error) {
      console.error(
        "Failed to save conversation:",
        error
      );
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

  const addMessage = (
    message: ChatMessage
  ): void => {
    setMessages((previous) => [
      ...previous,
      message,
    ]);
  };

  // -----------------------------
  // Clear chat
  // -----------------------------

  const clearChat = (): void => {
    setMessages([]);
    setCurrentDocument(null);
    setSelectedFile(null);
    setActiveConversationId(null);
    setLoading(false);
  };

  // -----------------------------
  // Open conversation
  // -----------------------------

  const openConversation = (
    id: string
  ): void => {
    const conversation = conversations.find(
      (item) => item.id === id
    );

    if (!conversation) return;

    setLoading(false);

    setActiveConversationId(
      conversation.id
    );

    setMessages(
      conversation.messages || []
    );

    setCurrentDocument(
      normalizeDocument(
        conversation.document
      )
    );
  };

  // -----------------------------
  // Update current document
  // -----------------------------

  const updateCurrentDocument = (
    document: DocumentData | null
  ): void => {
    const normalized =
      normalizeDocument(document);

    setCurrentDocument(normalized);
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

    selectedFile,
    setSelectedFile,

    selectedAgent,
    setSelectedAgent,

    loading,
    setLoading,

    clearChat,

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