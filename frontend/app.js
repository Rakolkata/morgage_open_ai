// ==================================================
// 1. APPLICATION STATE
// ==================================================

let currentDocument = null;
let history = [];
let isSending = false;
let isUploading = false;

let activeConversationId = null;
let activeConversation = null;

let saveQueue = Promise.resolve();

const $ = (id) => document.getElementById(id);

const statusEl = $("llmStatus");
const messageInput = $("messageInput");
const sendButton = $("sendButton");
const pdfInput = $("pdfInput");

const FHA_PURCHASE_PROMPT_ID =
  "[Post-Closing] FHA (Federal Housing Administration) | Purchase | Prompt 4";

const HISTORY_ENABLED =
  typeof window.ChatDB !== "undefined";


// ==================================================
// 2. API CONFIGURATION
// ==================================================

const API_BASE_URL =
  window.location.port === "5500"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : window.location.origin;


// ==================================================
// 3. API HELPER
// ==================================================

async function api(url, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${url}`, {
      mode: "cors",
      credentials: "include",
      cache: "no-store",
      ...options
    });

  } catch (error) {
    console.error("API connection failed:", error);

    throw new Error(
      "Cannot connect to backend at " +
      API_BASE_URL +
      ". Please start FastAPI."
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail = data.detail;

    throw new Error(
      typeof detail === "string"
        ? detail
        : detail?.message ||
          data.message ||
          data.error ||
          `HTTP error ${response.status}`
    );
  }

  return data;
}


// ==================================================
// 4. BACKEND HEALTH CHECK
// ==================================================

async function checkHealth() {
  try {
    const data = await api("/api/health");
    const llm = data.llm || {};

    statusEl.className = "status";

    const dot = document.createElement("span");
    dot.className = "status-dot";

    const label = document.createElement("span");
    label.textContent =
      llm.message || "Service status unknown";

    statusEl.replaceChildren(dot, label);

    if (llm.is_mock) {
      statusEl.classList.add("mock");
    } else if (llm.ready) {
      statusEl.classList.add("ready");
    }

  } catch (error) {
    console.error("Health check failed:", error);

    statusEl.className = "status error";

    const dot = document.createElement("span");
    dot.className = "status-dot";

    const label = document.createElement("span");
    label.textContent = "Backend unavailable";

    statusEl.replaceChildren(dot, label);
  }
}


// ==================================================
// 5. CONVERSATION TITLE
// ==================================================

function makeConversationTitle(text) {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return "New chat";

  return clean.length > 34
    ? clean.slice(0, 34) + "..."
    : clean;
}


// ==================================================
// 6. CREATE ACTIVE CONVERSATION
// ==================================================

async function ensureActiveConversation() {
  if (!HISTORY_ENABLED) {
    console.warn("ChatDB is unavailable.");
    return null;
  }

  if (activeConversation && activeConversationId) {
    return activeConversation;
  }

  activeConversation =
    await ChatDB.createConversation("New chat");

  activeConversationId = activeConversation.id;

  await renderConversationList();

  return activeConversation;
}


// ==================================================
// 7. SAVE CONVERSATION
// ==================================================

async function persistCurrentConversation() {
  if (!HISTORY_ENABLED || !activeConversationId) {
    return;
  }

  const conversationId = activeConversationId;

  const snapshot = {
    title: activeConversation?.title || "New chat",

    documentName:
      $("documentName")?.textContent || "No PDF uploaded",

    documentId:
      currentDocument || activeConversation?.documentId || null,

    messages: (activeConversation?.messages || []).map(
      (message) => ({ ...message })
    )
  };

  saveQueue = saveQueue.then(async () => {
    const conversation =
      await ChatDB.getConversation(conversationId);

    if (!conversation) return;

    conversation.title = snapshot.title;
    conversation.documentName = snapshot.documentName;
    conversation.documentId = snapshot.documentId;
    conversation.messages = snapshot.messages;
    conversation.updatedAt = new Date().toISOString();

    await ChatDB.saveConversation(conversation);

    if (activeConversationId === conversationId) {
      activeConversation = conversation;
    }

    await renderConversationList();
  });

  try {
    await saveQueue;
  } catch (error) {
    console.error("Conversation save failed:", error);
  }
}


// ==================================================
// 8. SAVE MESSAGE
// ==================================================

async function appendConversationMessage(
  role,
  text,
  evidence = []
) {
  if (!HISTORY_ENABLED) return;

  await ensureActiveConversation();

  activeConversation.messages.push({
    role,
    text: String(text ?? ""),
    evidence: Array.isArray(evidence) ? evidence : [],
    createdAt: new Date().toISOString()
  });

  if (
    role === "user" &&
    (
      !activeConversation.title ||
      activeConversation.title === "New chat"
    )
  ) {
    activeConversation.title =
      makeConversationTitle(text);
  }

  activeConversation.documentId =
    currentDocument || null;

  activeConversation.documentName =
    $("documentName").textContent;

  await persistCurrentConversation();
}


// ==================================================
// 9. DISPLAY CHAT HISTORY
// ==================================================

async function renderConversationList() {
  const list = $("historyList");

  if (!list) return;

  if (!HISTORY_ENABLED) {
    list.textContent = "History unavailable";
    return;
  }

  try {
    const allConversations =
      await ChatDB.listConversations();

    const conversations = (
      Array.isArray(allConversations)
        ? allConversations
        : []
    )
      .filter((conversation) =>
        (
          Array.isArray(conversation.messages) &&
          conversation.messages.length > 0
        ) ||
        Boolean(
          conversation.documentName &&
          conversation.documentName !== "No PDF uploaded"
        )
      )
      .sort((a, b) =>
        new Date(b.updatedAt || b.createdAt || 0) -
        new Date(a.updatedAt || a.createdAt || 0)
      );

    list.replaceChildren();

    if (!conversations.length) {
      const empty = document.createElement("p");

      empty.className = "history-empty";
      empty.textContent = "No conversations yet";

      list.appendChild(empty);
      return;
    }

    conversations.forEach((conversation) => {
      const item = document.createElement("div");

      item.className = "history-item";

      if (conversation.id === activeConversationId) {
        item.classList.add("active");
      }

      const title = document.createElement("button");

      title.type = "button";
      title.className = "history-item-title";
      title.textContent =
        conversation.title || "New chat";

      title.addEventListener("click", () => {
        openConversation(conversation.id);
      });

      const actions = document.createElement("div");
      actions.className = "history-actions";

      const renameButton = document.createElement("button");

      renameButton.type = "button";
      renameButton.className = "history-action";
      renameButton.textContent = "✎";
      renameButton.title = "Rename";

      renameButton.addEventListener("click", async (event) => {
        event.stopPropagation();

        const newTitle = prompt(
          "Enter conversation name:",
          conversation.title
        );

        if (!newTitle || !newTitle.trim()) return;

        const updated =
          await ChatDB.getConversation(conversation.id);

        if (!updated) return;

        updated.title = makeConversationTitle(newTitle);

        await ChatDB.saveConversation(updated);

        if (conversation.id === activeConversationId) {
          activeConversation = updated;
        }

        await renderConversationList();
      });

      const deleteButton = document.createElement("button");

      deleteButton.type = "button";
      deleteButton.className = "history-action";
      deleteButton.textContent = "×";
      deleteButton.title = "Delete";

      deleteButton.addEventListener("click", async (event) => {
        event.stopPropagation();

        if (!confirm("Delete this conversation?")) return;

        await ChatDB.deleteConversation(conversation.id);

        if (conversation.id === activeConversationId) {
          activeConversationId = null;
          activeConversation = null;
          currentDocument = null;
          history = [];

          resetChatScreen();

          await ensureActiveConversation();
        } else {
          await renderConversationList();
        }
      });

      actions.append(renameButton, deleteButton);
      item.append(title, actions);
      list.appendChild(item);
    });

  } catch (error) {
    console.error("History loading failed:", error);
    list.textContent = "Could not load history";
  }
}
// ==================================================
// 10. OPEN SAVED CONVERSATION
// ==================================================

async function openConversation(id) {
  if (isSending || isUploading || !HISTORY_ENABLED) {
    return;
  }

  try {
    const conversation =
      await ChatDB.getConversation(id);

    if (!conversation) return;

    activeConversationId = conversation.id;
    activeConversation = conversation;

    currentDocument =
      conversation.documentId || null;

    history = [];

    const savedMessages =
      conversation.messages || [];

    savedMessages.forEach((message) => {
      if (
        message.role === "user" ||
        message.role === "assistant"
      ) {
        history.push({
          role: message.role,
          content: message.text
        });
      }
    });

    history = history.slice(-12);

    $("messages").replaceChildren();

    $("documentName").textContent =
      conversation.documentName || "No PDF uploaded";

    $("documentPages").textContent =
      conversation.documentId
        ? "Saved conversation"
        : "Upload a document to begin";

    savedMessages.forEach((message) => {
      addMessage(
        message.role,
        message.text,
        message.evidence || [],
        false
      );
    });

    $("welcome").classList.add("hidden");
    $("chatArea").classList.remove("hidden");

    // A saved document ID may no longer exist after backend restart.
    // Allow upload of a replacement PDF when reopening old chats.
    messageInput.disabled = !currentDocument;
    sendButton.disabled = !currentDocument;

    messageInput.placeholder = currentDocument
      ? "Ask a question or request a mortgage audit..."
      : "Upload a PDF to start asking questions...";

    // Show the upload card if the conversation has no document.
    if (!currentDocument) {
      $("welcome").classList.remove("hidden");
      $("chatArea").classList.add("hidden");
    }

    await renderConversationList();

    if (currentDocument) {
      checkHealth();
    }

  } catch (error) {
    console.error("Conversation opening failed:", error);
    alert("Unable to open conversation.");
  }
}


// ==================================================
// 11. NEW CONVERSATION
// ==================================================

async function startNewConversation() {
  activeConversationId = null;
  activeConversation = null;

  currentDocument = null;
  history = [];

  resetChatScreen();

  if (HISTORY_ENABLED) {
    await ensureActiveConversation();
    await renderConversationList();
  }
}


// ==================================================
// 12. RESET SCREEN
// ==================================================

function resetChatScreen() {
  $("documentName").textContent = "No PDF uploaded";

  $("documentPages").textContent =
    "Upload a document to begin";

  $("messages").replaceChildren();

  // The welcome section contains the PDF upload card.
  $("chatArea").classList.add("hidden");
  $("welcome").classList.remove("hidden");

  messageInput.value = "";
  messageInput.disabled = true;

  messageInput.placeholder =
    "Upload a PDF to start asking questions...";

  messageInput.style.height = "auto";

  sendButton.disabled = true;

  pdfInput.value = "";
}


// ==================================================
// 13. MESSAGE DISPLAY
// ==================================================

function addMessage(
  role,
  text,
  evidence = [],
  save = true
) {
  $("welcome").classList.add("hidden");
  $("chatArea").classList.remove("hidden");

  const wrap = document.createElement("div");

  wrap.className = `message ${role}`;

  const bubble = document.createElement("div");

  bubble.className = "bubble";
  bubble.textContent = String(text ?? "");

  if (Array.isArray(evidence) && evidence.length) {
    const box = document.createElement("div");

    box.className = "evidence";

    const heading = document.createElement("strong");

    heading.textContent = "Verified Evidence";

    box.appendChild(heading);

    evidence.forEach((item) => {
      const evidenceItem =
        document.createElement("div");

      evidenceItem.className = "evidence-item";

      evidenceItem.textContent =
        `Page ${item.page}: "${item.quote}"`;

      box.appendChild(evidenceItem);
    });

    bubble.appendChild(box);
  }

  wrap.appendChild(bubble);

  $("messages").appendChild(wrap);

  scrollToBottom();

  if (save) {
    return appendConversationMessage(
      role,
      text,
      evidence
    );
  }

  return Promise.resolve();
}


function scrollToBottom() {
  const messages = $("messages");

  messages.scrollTop = messages.scrollHeight;
}


// ==================================================
// 14. PDF UPLOAD
// ==================================================

pdfInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];

  if (!file) return;

  const isPdf =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    alert("Please upload a valid PDF file.");
    pdfInput.value = "";
    return;
  }

  if (isUploading || isSending) return;

  isUploading = true;

  const uploadCard =
    document.querySelector(".upload-card");

  const uploadText =
    uploadCard?.querySelector("strong");

  const originalText =
    uploadText?.textContent || "Upload a mortgage PDF";

  uploadCard?.classList.add("uploading");

  if (uploadText) {
    uploadText.textContent = "Uploading document...";
  }

  try {
    const form = new FormData();

    form.append("file", file);

    const data = await api("/api/documents", {
      method: "POST",
      body: form
    });

    // Preserve the new document ID when creating a new chat.
    // A newly uploaded PDF gets its own conversation.
    if (
      activeConversation &&
      activeConversation.messages?.length
    ) {
      await startNewConversation();
    } else {
      await ensureActiveConversation();
    }

    currentDocument = data.document_id;
    history = [];

    $("messages").replaceChildren();

    $("documentName").textContent = data.filename;

    $("documentPages").textContent =
      `${data.page_count} pages extracted`;

    messageInput.disabled = false;
    sendButton.disabled = false;

    messageInput.placeholder =
      "Ask a question or request a mortgage audit...";

    $("welcome").classList.add("hidden");
    $("chatArea").classList.remove("hidden");

    let uploadMessage =
      "DOCUMENT UPLOADED SUCCESSFULLY\n\n" +
      `File: ${data.filename}\n` +
      `Pages extracted: ${data.page_count}`;

    if (data.pages_needing_ocr?.length) {
      uploadMessage +=
        "\n\nOCR may be required for pages: " +
        data.pages_needing_ocr.join(", ");
    }

    await addMessage("assistant", uploadMessage);

    await persistCurrentConversation();

  } catch (error) {
    console.error("Upload failed:", error);

    if (uploadText) {
      uploadText.textContent = originalText;
    }

    await addMessage(
      "assistant",
      "UPLOAD FAILED\n\n" +
      error.message +
      "\n\nCheck that FastAPI is running."
    );

  } finally {
    isUploading = false;

    uploadCard?.classList.remove("uploading");

    pdfInput.value = "";
  }
});


// ==================================================
// 15. TYPING INDICATOR
// ==================================================

function showTyping(message) {
  const typing = document.createElement("div");

  typing.className = "typing";
  typing.textContent = message;

  $("messages").appendChild(typing);

  scrollToBottom();

  return typing;
}


// ==================================================
// 16. AUDIT REQUEST DETECTION
// ==================================================

function isAuditRequest(message) {
  const text = message.toLowerCase();

  const keywords = [
    "audit",
    "post-closing",
    "post closing",
    "missing document",
    "missing documents",
    "underwriting condition",
    "underwriting conditions",
    "closing disclosure",
    "mortgage compliance",
    "loan compliance",
    "fha audit",
    "full audit",
    "audit report",
    "post closing review"
  ];

  return keywords.some((keyword) =>
    text.includes(keyword)
  );
}


// ==================================================
// 17. MORTGAGE AUDIT API
// ==================================================

async function runMortgageAudit() {
  if (!currentDocument) {
    throw new Error("Please upload a PDF first.");
  }

  console.log("Calling audit endpoint: POST /api/audit");

  const result = await api("/api/audit", {
    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      document_id: currentDocument,
      prompt_ids: [FHA_PURCHASE_PROMPT_ID]
    })
  });

  console.log("Audit API response:", result);

  return result;
}


// ==================================================
// 18. NORMAL DOCUMENT CHAT API
// ==================================================

async function runDocumentChat(userMessage) {
  if (!currentDocument) {
    throw new Error("Please upload a PDF first.");
  }

  console.log("Calling chat endpoint: POST /api/chat");

  const result = await api("/api/chat", {
    method: "POST",

    headers: {
      "Content-Type": "application/json"
    },

    body: JSON.stringify({
      document_id: currentDocument,
      message: userMessage,
      history
    })
  });

  console.log("Chat API response:", result);

  return result;
}


// ==================================================
// 19. FORMAT AUDIT REPORT
// ==================================================

function formatAuditReport(data) {
  const rows = Array.isArray(data.rows)
    ? data.rows
    : [];

  if (!rows.length) {
    return (
      "AUDIT REPORT\n\n" +
      "The backend returned no audit findings.\n" +
      "Check the backend and audit prompt configuration."
    );
  }

  const counts = {
    PASS: 0,
    EXCEPTION: 0,
    NOT_FOUND: 0,
    NEEDS_HUMAN_REVIEW: 0
  };

  rows.forEach((row) => {
    const status = String(
      row.status || "NEEDS_HUMAN_REVIEW"
    ).toUpperCase();

    if (Object.hasOwn(counts, status)) {
      counts[status]++;
    } else {
      counts.NEEDS_HUMAN_REVIEW++;
    }
  });

  const output = [
    "MORTGAGE POST-CLOSING AUDIT REPORT",
    "===================================",
    `Document ID: ${data.document_id || currentDocument}`,
    `Total findings: ${rows.length}`,
    "",
    "AUDIT STATUS SUMMARY",
    "--------------------",
    `PASS: ${counts.PASS}`,
    `EXCEPTION: ${counts.EXCEPTION}`,
    `NOT FOUND: ${counts.NOT_FOUND}`,
    `NEEDS HUMAN REVIEW: ${counts.NEEDS_HUMAN_REVIEW}`
  ];

  rows.forEach((row, index) => {
    output.push(
      "",
      `FINDING ${index + 1}`,
      "--------------------",
      `Audit Area: ${row.audit_area || "Not provided"}`,
      `Document Checked: ${row.document_checked || "Not provided"}`,
      `Issue Found: ${row.issue_found || "Not provided"}`,
      `Guideline Referenced: ${row.guideline_referenced || "Not provided"}`,
      `Evidence: ${row.exact_quote_or_data_point || "Not provided"}`,
      `Page: ${row.page ?? "Not provided"}`,
      `Evidence Verified: ${row.verified ? "Yes" : "No"}`,
      `Status: ${row.status || "NEEDS HUMAN REVIEW"}`
    );
  });

  output.push(
    "",
    "REVIEW NOTICE",
    "-------------",
    data.notice ||
      "AI-generated draft only. Human verification is required."
  );

  if (data.mock) {
    output.push(
      "",
      "WARNING: This is a mock response, not an AI-generated audit."
    );
  }

  if (data.human_review_required !== false) {
    output.push(
      "",
      "A qualified human reviewer must verify the findings."
    );
  }

  return output.join("\n");
}// ==================================================
// 20. SEND MESSAGE
// ==================================================

async function sendMessage(text) {
  const userMessage = String(text || "").trim();

  if (!currentDocument || !userMessage || isSending) {
    return;
  }

  isSending = true;

  try {
    await ensureActiveConversation();

    await addMessage("user", userMessage);

    messageInput.value = "";
    messageInput.style.height = "auto";

    sendButton.disabled = true;

    const auditRequest = isAuditRequest(userMessage);

    console.log("USER MESSAGE:", userMessage);
    console.log("AUDIT ROUTING:", auditRequest);

    const typing = showTyping(
      auditRequest
        ? "Running mortgage post-closing audit..."
        : "Analyzing your document..."
    );

    try {
      if (auditRequest) {
        const data = await runMortgageAudit();

        typing.remove();

        await addMessage(
          "assistant",
          formatAuditReport(data)
        );

      } else {
        const data = await runDocumentChat(userMessage);

        typing.remove();

        const answer =
          data.answer || "No answer was returned.";

        let response = answer;

        if (data.status) {
          response += `\n\nStatus: ${data.status}`;
        }

        if (data.mock) {
          response +=
            "\n\nMOCK RESPONSE — NOT AI-GENERATED.";
        }

        if (data.notice) {
          response += `\n\n${data.notice}`;
        }

        const evidence = Array.isArray(data.evidence)
          ? data.evidence.filter((item) => item.verified)
          : [];

        await addMessage(
          "assistant",
          response,
          evidence
        );

        history.push(
          {
            role: "user",
            content: userMessage
          },
          {
            role: "assistant",
            content: answer
          }
        );

        history = history.slice(-12);
      }

      await persistCurrentConversation();

    } catch (error) {
      typing.remove();

      console.error("Request failed:", error);

      await addMessage(
        "assistant",
        "REQUEST FAILED\n\n" +
        error.message +
        "\n\nPlease check the backend terminal for the full error."
      );
    }

  } finally {
    isSending = false;

    sendButton.disabled = !currentDocument;

    messageInput.focus();
  }
}


// ==================================================
// 21. CHAT FORM
// ==================================================

$("chatForm").addEventListener("submit", (event) => {
  event.preventDefault();

  sendMessage(messageInput.value);
});


// ==================================================
// 22. ENTER KEY
// ==================================================

messageInput.addEventListener("keydown", (event) => {
  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.isComposing
  ) {
    event.preventDefault();

    $("chatForm").requestSubmit();
  }
});


// ==================================================
// 23. TEXTAREA RESIZE
// ==================================================

messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";

  messageInput.style.height =
    Math.min(messageInput.scrollHeight, 140) + "px";
});


// ==================================================
// 24. SUGGESTED QUESTIONS
// ==================================================

document.querySelectorAll(".suggestion").forEach((button) => {
  button.addEventListener("click", () => {
    if (!currentDocument) {
      alert("Please upload a PDF first.");
      return;
    }

    sendMessage(button.textContent);
  });
});


// ==================================================
// 25. NEW CHAT BUTTON
// ==================================================

$("newChat").addEventListener("click", async () => {
  if (isSending || isUploading) return;

  const oldDocument = currentDocument;

  // Create a new empty conversation and show the upload screen.
  await startNewConversation();

  $("welcome").classList.remove("hidden");
  $("chatArea").classList.add("hidden");

  $("documentName").textContent = "No PDF uploaded";

  $("documentPages").textContent =
    "Upload a document to begin";

  messageInput.value = "";
  messageInput.disabled = true;

  sendButton.disabled = true;

  messageInput.placeholder =
    "Upload a PDF to start asking questions...";

  pdfInput.value = "";

  await renderConversationList();

  // Remove the old backend document if the endpoint supports deletion.
  if (oldDocument) {
    try {
      await api(`/api/documents/${oldDocument}`, {
        method: "DELETE"
      });

    } catch (error) {
      console.warn(
        "Document cleanup:",
        error.message
      );
    }
  }
});


// ==================================================
// 26. INITIALIZE APPLICATION
// ==================================================

async function initializeApp() {
  // Check backend health.
  checkHealth();

  if (!HISTORY_ENABLED) {
    console.warn(
      "db.js was not loaded. Chat history is disabled."
    );

    return;
  }

  try {
    // Open local IndexedDB storage.
    await ChatDB.openDatabase();

    // Load saved conversations.
    await renderConversationList();

    // Create a fresh conversation for the initial screen.
    await ensureActiveConversation();

    await renderConversationList();

    console.log(
      "Mortgage AI initialized successfully."
    );

  } catch (error) {
    console.error(
      "Chat history initialization failed:",
      error
    );

    alert(
      "Chat history could not be initialized. " +
      "Please check db.js and your browser console."
    );
  }
}


// ==================================================
// 27. START APPLICATION
// ==================================================

initializeApp();