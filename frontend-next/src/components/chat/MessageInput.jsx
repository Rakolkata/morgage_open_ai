
"use client";

import { useState } from "react";
import { Send, Paperclip, LoaderCircle } from "lucide-react";
import useChat from "../../hooks/useChat";
import DocumentUpload from "../documents/DocumentUpload";

export default function MessageInput() {
  const [message, setMessage] = useState("");
  const { sendMessage, loading } = useChat();

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!message.trim() || loading) return;

    const currentMessage = message;
    setMessage("");

    await sendMessage(currentMessage);
  };

  return (
    <div className="message-input-container">
      <DocumentUpload />

      <form className="message-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Ask anything about your mortgage document..."
          disabled={loading}
        />

        <button
          type="submit"
          disabled={!message.trim() || loading}
          aria-label="Send message"
        >
          {loading ? (
            <LoaderCircle size={19} className="upload-spinner" />
          ) : (
            <Send size={19} />
          )}
        </button>
      </form>

      <p className="input-disclaimer">
        <Paperclip size={12} />
        Upload PDF documents for mortgage audit analysis.
        Verify AI-generated findings against original evidence.
      </p>
    </div>
  );
}
