
"use client";

import { useEffect, useRef, useState } from "react";
import {
  MessageSquare,
  Sparkles,
  FileSearch,
  FileText,
  AlertTriangle,
  Upload,
  X,
} from "lucide-react";

import ChatMessage from "./ChatMessage";
import MessageInput from "./MessageInput";
import TypingIndicator from "./TypingIndicator";
import { useChatContext } from "../../context/ChatContext";
import useChat from "../../hooks/useChat";

const suggestedPrompts = [
  {
    title: "Extract All Mortgage Values",
    description:
      "Extract all critical mortgage values from the uploaded document and present them in a structured, readable format.",
    icon: FileSearch,
  },
  {
    title: "Summarize Loan Document",
    description:
      "Provide a clear summary of the uploaded loan document, including important borrower, property and loan details.",
    icon: FileText,
  },
  {
    title: "Identify Missing Information",
    description:
      "Analyze the uploaded loan document and identify missing, incomplete or unclear mortgage information.",
    icon: AlertTriangle,
  },
];

export default function ChatWindow() {
  const {
    messages,
    loading,
    selectedFile,
    currentDocument,
  } = useChatContext();

  const { sendMessage } = useChat();

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [uploadPopup, setUploadPopup] = useState(false);

  const [pendingPrompt, setPendingPrompt] = useState<string | null>(
    null
  );

  const hasDocument = Boolean(
    selectedFile ||
      currentDocument?.document_id ||
      currentDocument?.id ||
      currentDocument?.data?.document_id ||
      currentDocument?.data?.id
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  const handlePromptClick = async (prompt: string) => {
    if (loading) return;

    if (!hasDocument) {
      setPendingPrompt(prompt);
      setUploadPopup(true);
      return;
    }

    await sendMessage(prompt);
  };

  const handleUploadPopupClose = () => {
    setUploadPopup(false);
    setPendingPrompt(null);
  };

  const handleContinue = async () => {
    if (!hasDocument) {
      setUploadPopup(false);
      return;
    }

    const prompt = pendingPrompt;

    setUploadPopup(false);
    setPendingPrompt(null);

    if (prompt && !loading) {
      await sendMessage(prompt);
    }
  };

  return (
    <section className="chat-window formal-chat-window">
      {/* Empty Chat State */}
      {messages.length === 0 && !loading ? (
        <div className="formal-chat-empty">
          <div className="formal-chat-empty-content">
            <div className="formal-chat-icon">
              <MessageSquare size={24} />
            </div>

            <h2>How can I help with your mortgage audit?</h2>

            <p>
              Ask questions about your loan documents, extract mortgage
              information, review missing fields, or analyze audit
              requirements.
            </p>

            {/* Suggested Prompts */}
            <div className="mortgage-prompt-grid">
              {suggestedPrompts.map((prompt, index) => {
                const Icon = prompt.icon;

                return (
                  <button
                    key={index}
                    type="button"
                    className="mortgage-prompt-card"
                    onClick={() =>
                      handlePromptClick(prompt.description)
                    }
                    disabled={loading}
                  >
                    <div className="mortgage-prompt-card-icon">
                      <Icon size={18} />
                    </div>

                    <div className="mortgage-prompt-card-content">
                      <h3>{prompt.title}</h3>

                      <p>{prompt.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="formal-chat-hint">
              <Sparkles size={15} />

              <span>
                Upload a document and start a conversation.
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* Chat Messages */
        <div className="chat-messages formal-chat-messages">
          {messages.map((message, index) => (
            <ChatMessage
              key={index}
              message={{
                role: message.role,
                content: message.content,
                agent: message.agent,
                evidence: message.evidence,
              }}
            />
          ))}

          {loading && <TypingIndicator />}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Chat Input */}
      <div className="formal-chat-input-wrapper">
        <MessageInput />
      </div>

      {/* Upload Required Popup */}
      {uploadPopup && (
        <div
          className="mortgage-upload-modal-overlay"
          onClick={handleUploadPopupClose}
        >
          <div
            className="mortgage-upload-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="mortgage-upload-modal-close"
              onClick={handleUploadPopupClose}
              aria-label="Close popup"
            >
              <X size={20} />
            </button>

            <div className="mortgage-upload-modal-icon">
              <Upload size={26} />
            </div>

            <h3>Upload a Loan Document</h3>

            <p>
              Upload a mortgage PDF before starting this task.
              The AI will analyze the document and provide the
              requested information.
            </p>

            <div className="mortgage-upload-modal-info">
              <FileText size={18} />

              <span>
                PDF documents are supported for mortgage analysis.
              </span>
            </div>

            <button
              type="button"
              className="mortgage-upload-modal-button"
              onClick={handleUploadPopupClose}
            >
              Go to Document Upload
            </button>

            <button
              type="button"
              className="mortgage-upload-modal-secondary"
              onClick={handleUploadPopupClose}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
