
"use client";

import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import ChatMessage from "./ChatMessage";
import MessageInput from "./MessageInput";
import TypingIndicator from "./TypingIndicator";
import { useChatContext } from "../../context/ChatContext";

export default function ChatWindow() {
  const { messages, loading } = useChatContext();

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  return (
    <section className="chat-window">
      {messages.length === 0 ? (
        <div className="chat-empty">
          <div className="empty-icon">
            <Sparkles size={27} />
          </div>

          <h2>Welcome to Mortgage AI</h2>

          <p>
            Upload your mortgage PDF and ask questions about
            loan information, document details and potential
            post-closing discrepancies.
          </p>
        </div>
      ) : (
        <div className="chat-messages">
          {messages.map((message, index) => (
            <ChatMessage
              key={index}
              message={{
                role: message.role === "user" ? "user" : "assistant",
                content: message.content,
              }}
            />
          ))}

          {loading && <TypingIndicator />}

          <div ref={messagesEndRef} />
        </div>
      )}

      <MessageInput />
    </section>
  );
}
