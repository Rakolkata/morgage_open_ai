
"use client";

import {
  User,
  Bot,
  Copy,
  FileSearch,
  Check,
} from "lucide-react";
import { useState } from "react";

interface MessageData {
  role: "user" | "assistant";
  content: string;
  evidence?: unknown;
}

interface ChatMessageProps {
  message: MessageData;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const [copied, setCopied] = useState<boolean>(false);

  const isUser = message.role === "user";

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (error: unknown) {
      console.error("Copy failed:", error);
    }
  };

  return (
    <div className={`chat-message ${isUser ? "user" : "assistant"}`}>
      <div className="message-avatar">
        {isUser ? <User size={18} /> : <Bot size={19} />}
      </div>

      <div className="message-content">
        <div className="message-header">
          <strong>{isUser ? "You" : "Mortgage AI"}</strong>
          {!isUser && <span>AI Assistant</span>}
        </div>

        <div className="message-text">
          {message.content}
        </div>

        {!isUser && (
          <div className="message-actions">
            <button onClick={copyMessage}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </button>

            {Boolean(message.evidence) && (
              <button>
                <FileSearch size={14} />
                View evidence
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
