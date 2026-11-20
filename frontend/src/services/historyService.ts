// src/services/historyService.ts

export interface HistoryMessage {
  role: string;
  content: string;
  [key: string]: unknown;
}

export interface HistoryConversation {
  id: string;
  title: string;
  messages: HistoryMessage[];
  document: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = "mortgage_chat_history";

// Retrieve conversations from local storage.
export function getConversations(): HistoryConversation[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedData = localStorage.getItem(STORAGE_KEY);

    if (!storedData) {
      return [];
    }

    const parsedData: unknown = JSON.parse(storedData);

    return Array.isArray(parsedData) ? parsedData : [];
  } catch (error) {
    console.error("Error retrieving conversations:", error);
    return [];
  }
}

// Save or update a conversation.
export function saveConversation(
  conversation: HistoryConversation
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const conversations = getConversations();

    const existingIndex = conversations.findIndex(
      (item) => item.id === conversation.id
    );

    if (existingIndex !== -1) {
      conversations[existingIndex] = conversation;
    } else {
      conversations.unshift(conversation);
    }

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(conversations)
    );
  } catch (error) {
    console.error("Error saving conversation:", error);
  }
}

// Delete a conversation.
export function deleteConversation(id: string): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const conversations = getConversations();

    const updatedConversations = conversations.filter(
      (conversation) => conversation.id !== id
    );

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(updatedConversations)
    );
  } catch (error) {
    console.error("Error deleting conversation:", error);
  }
}

// Delete all conversations.
export function clearConversationHistory(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Error clearing conversation history:", error);
  }
}