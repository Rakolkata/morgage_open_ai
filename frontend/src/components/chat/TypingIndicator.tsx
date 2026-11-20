
"use client";

import { Bot } from "lucide-react";

export default function TypingIndicator() {
  return (
    <div className="chat-message assistant">
      <div className="message-avatar">
        <Bot size={19} />
      </div>

      <div className="message-content">
        <div className="message-header">
          <strong>Mortgage AI</strong>
          <span>Analyzing document...</span>
        </div>

        <div className="typing-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  );
}
