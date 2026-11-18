
const STORAGE_KEY = "mortgage_ai_chat_history";

export function getConversations() {
  if (typeof window === "undefined") return [];

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch (error) {
    console.error("Failed to load chat history:", error);
    return [];
  }
}

export function saveConversation(conversation) {
  if (typeof window === "undefined") return;

  const conversations = getConversations();

  const index = conversations.findIndex(
    (item) => item.id === conversation.id
  );

  if (index >= 0) {
    conversations[index] = {
      ...conversations[index],
      ...conversation,
      updatedAt: new Date().toISOString(),
    };
  } else {
    conversations.unshift({
      ...conversation,
      createdAt: conversation.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}

export function deleteConversation(id) {
  if (typeof window === "undefined") return;

  const updated = getConversations().filter(
    (conversation) => conversation.id !== id
  );

  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

export function clearAllConversations() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}
