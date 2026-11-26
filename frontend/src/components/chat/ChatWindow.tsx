"use client";

import { useEffect, useRef } from "react";

import ChatMessage from "./ChatMessage";
import MessageInput from "./MessageInput";
import TypingIndicator from "./TypingIndicator";

import { useChatContext } from "../../context/ChatContext";
import useChat from "../../hooks/useChat";
import { agentPrompts } from "../../config/agentPrompts";

export default function ChatWindow() {
  const {
    messages,
    loading,
    selectedFile,
    currentDocument,
    selectedAgent,
  } = useChatContext();

  const { sendMessage } = useChat();

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // =========================================
  // DOCUMENT CHECK
  // =========================================

  const hasDocument = Boolean(
    selectedFile ||
      currentDocument?.document_id ||
      currentDocument?.id ||
      currentDocument?.data?.document_id ||
      currentDocument?.data?.id
  );

  // =========================================
  // AGENT-SPECIFIC PREDEFINED PROMPTS
  // =========================================

  const suggestedPrompts =
    agentPrompts[selectedAgent] || agentPrompts.orchestrator;

  // =========================================
  // AUTO SCROLL
  // =========================================

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  // =========================================
  // PROMPT CLICK
  // =========================================

  const handlePromptClick = async (prompt: string) => {
    if (loading || !hasDocument) return;

    await sendMessage(prompt);
  };

  // =========================================
  // UI
  // =========================================

  return (
    <section className="chat-window formal-chat-window">

      {/* CHAT MESSAGES */}

      <div className="mortgage-chat-main">

        {messages.length === 0 && !loading ? (
          <div className="mortgage-chat-welcome">

            <div className="mortgage-chat-welcome-icon">
              <MessageSquareIcon />
            </div>

            <h2>Mortgage Audit Assistant</h2>

            <p>
              Upload your loan document and ask questions,
              extract mortgage values, or review missing
              information.
            </p>

          </div>
        ) : (
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

      </div>

      {/* INPUT PANEL */}

      <div className="formal-chat-input-wrapper">

        <MessageInput />

        {/* PREDEFINED PROMPTS */}

        {hasDocument &&
          messages.length === 0 &&
          !loading && (

            <div className="chat-prompt-dropdown">

              <div className="chat-prompt-dropdown-header">
                Predefined Prompts
              </div>

              <div className="chat-prompt-dropdown-list">

                {suggestedPrompts.map(
                  (prompt, index) => (
                    <button
                      key={index}
                      type="button"
                      className="chat-prompt-dropdown-item"
                      onClick={() =>
                        handlePromptClick(prompt)
                      }
                      disabled={loading}
                    >
                      {prompt}
                    </button>
                  )
                )}

              </div>

            </div>
          )}

      </div>

    </section>
  );
}

// WELCOME ICON

function MessageSquareIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15a4 4 0 0 1-4 4H7l-4 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
    </svg>
  );
}