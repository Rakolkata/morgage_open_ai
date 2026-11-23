
// @ts-nocheck
"use strict";

const ChatDB = (() => {
  const DB_NAME = "MortgageAIHistory";
  const DB_VERSION = 1;
  const STORE_NAME = "conversations";

  let dbInstance = null;

  function openDatabase() {
    if (dbInstance) {
      return Promise.resolve(dbInstance);
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: "id"
          });

          store.createIndex("updatedAt", "updatedAt");
        }
      };

      request.onsuccess = () => {
        dbInstance = request.result;
        resolve(dbInstance);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async function createConversation(title = "New chat") {
    const db = await openDatabase();

    const conversation = {
      id: crypto.randomUUID(),
      title,
      documentName: null,
      documentId: null,
      messages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");

      tx.objectStore(STORE_NAME).add(conversation);

      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });

    return conversation;
  }

  async function getConversation(id) {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const request = db
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async function saveConversation(conversation) {
    const db = await openDatabase();

    conversation.updatedAt = new Date().toISOString();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");

      tx.objectStore(STORE_NAME).put(conversation);

      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function listConversations() {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const request = db
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .getAll();

      request.onsuccess = () => {
        const conversations = request.result || [];

        conversations.sort(
          (a, b) =>
            new Date(b.updatedAt) - new Date(a.updatedAt)
        );

        resolve(conversations);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async function deleteConversation(id) {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");

      tx.objectStore(STORE_NAME).delete(id);

      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  return {
    openDatabase,
    createConversation,
    getConversation,
    saveConversation,
    listConversations,
    deleteConversation
  };
})();

window.ChatDB = ChatDB;
