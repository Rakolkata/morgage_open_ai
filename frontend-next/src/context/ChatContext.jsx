
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

export function ChatProvider({ children }) {
  const [messages, setMessages] = useState([]);
  const [currentDocument, setCurrentDocument] = useState(null);
  const [loading, setLoading] = useState(false);

  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Load saved conversations when the application starts
  useEffect(() => {
    const savedConversations = getConversations();

    setConversations(savedConversations);

    // Reopen the most recently updated conversation
    if (savedConversations.length > 0) {
      const latest = [...savedConversations].sort(
        (a, b) =>
          new Date(b.updatedAt || b.createdAt) -
          new Date(a.updatedAt || a.createdAt)
      )[0];

      setActiveConversationId(latest.id);
      setMessages(latest.messages || []);
      setCurrentDocument(latest.document || null);
    }

    setHistoryLoaded(true);
  }, []);

  // Automatically save messages whenever the conversation changes
  useEffect(() => {
    if (!historyLoaded || messages.length === 0) return;

    const existingConversation = conversations.find(
      (item) => item.id === activeConversationId
    );

    const id =
      activeConversationId ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `chat-${Date.now()}`);

    const firstUserMessage = messages.find(
      (message) => message.role === "user"
    );

    const conversation = {
      id,
      title: firstUserMessage
        ? firstUserMessage.content.slice(0, 55)
        : "New chat",
      messages,
      document: currentDocument,
      createdAt:
        existingConversation?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setActiveConversationId(id);

    setConversations((previous) => {
      const updated = [
        conversation,
        ...previous.filter((item) => item.id !== id),
      ];

      saveConversation(conversation);
      return updated;
    });
  }, [
    messages,
    currentDocument,
    activeConversationId,
    historyLoaded,
  ]);

  const addMessage = (message) => {
    setMessages((previous) => [...previous, message]);
  };

  // Start a new chat without deleting previous conversations
  const clearChat = () => {
    setMessages([]);
    setCurrentDocument(null);
    setActiveConversationId(null);
    setLoading(false);
  };

  // Open an existing conversation
  const openConversation = (id) => {
    const conversation = conversations.find(
      (item) => item.id === id
    );

    if (!conversation) return;

    setActiveConversationId(conversation.id);
    setMessages(conversation.messages || []);
    setCurrentDocument(conversation.document || null);
  };

  return (
    <ChatContext.Provider
      value={{
        messages,
        setMessages,
        addMessage,
        currentDocument,
        setCurrentDocument,
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
    throw new Error("useChatContext must be used inside ChatProvider");
  }

  return context;
}
