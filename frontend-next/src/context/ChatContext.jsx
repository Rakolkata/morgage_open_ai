"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  getConversations,
  saveConversation,
} from "../services/historyService";

const ChatContext = createContext(null);

// Normalize document IDs so the chat always uses document_id.
function normalizeDocument(document) {
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

export function ChatProvider({ children }) {
  const [messages, setMessages] = useState([]);
  const [currentDocument, setCurrentDocument] = useState(null);
  const [loading, setLoading] = useState(false);

  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Load saved conversations on startup.
  useEffect(() => {
    try {
      const savedConversations = getConversations() || [];

      const normalizedConversations = savedConversations.map(
        (conversation) => ({
          ...conversation,
          document: normalizeDocument(conversation.document),
          messages: conversation.messages || [],
        })
      );

      setConversations(normalizedConversations);

      if (normalizedConversations.length > 0) {
        const latest = [...normalizedConversations].sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt || 0) -
            new Date(a.updatedAt || a.createdAt || 0)
        )[0];

        setActiveConversationId(latest.id);
        setMessages(latest.messages || []);
        setCurrentDocument(
          normalizeDocument(latest.document)
        );
      }
    } catch (error) {
      console.error("Failed to load chat history:", error);
    } finally {
      setHistoryLoaded(true);
    }
  }, []);

  // Save the active conversation when messages or document change.
  useEffect(() => {
    if (!historyLoaded || messages.length === 0) return;

    const id =
      activeConversationId ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `chat-${Date.now()}`);

    const existingConversation = conversations.find(
      (conversation) => conversation.id === id
    );

    const firstUserMessage = messages.find(
      (message) => message.role === "user"
    );

    const normalizedDocument = normalizeDocument(currentDocument);

    const conversation = {
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
      const updated = [
        conversation,
        ...previous.filter((item) => item.id !== id),
      ];

      return updated;
    });

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

  // Add a message to the current conversation.
  const addMessage = (message) => {
    setMessages((previous) => [...previous, message]);
  };

  // Start a fresh conversation.
  const clearChat = () => {
    setMessages([]);
    setCurrentDocument(null);
    setActiveConversationId(null);
    setLoading(false);
  };

  // Open an existing conversation.
  const openConversation = (id) => {
    const conversation = conversations.find(
      (item) => item.id === id
    );

    if (!conversation) return;

    setLoading(false);
    setActiveConversationId(conversation.id);
    setMessages(conversation.messages || []);
    setCurrentDocument(
      normalizeDocument(conversation.document)
    );
  };

  // Safely store the uploaded document.
  const updateCurrentDocument = (document) => {
    const normalized = normalizeDocument(document);

    setCurrentDocument(normalized);
  };

  return (
    <ChatContext.Provider
      value={{
        messages,
        setMessages,
        addMessage,

        currentDocument,
        setCurrentDocument: updateCurrentDocument,

        loading,
        setLoading,

        clearChat,

        conversations,
        activeConversationId,
        openConversation,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const context = useContext(ChatContext);

  if (!context) {
    throw new Error(
      "useChatContext must be used inside ChatProvider"
    );
  }

  return context;
}
