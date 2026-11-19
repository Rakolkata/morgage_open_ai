
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

    const text = message.trim();

    if (!text || loading) return;

    setMessage("");
    await sendMessage(text);
  };

  return (
    <div className="message-input-container">

      {/* DOCUMENT UPLOAD */}
      <div className="message-upload-section">
        <DocumentUpload />
      </div>

      {/* CHAT INPUT */}
      <form
        className="message-input-form"
        onSubmit={handleSubmit}
      >
        <div className="message-input-field">

          <input
            type="text"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Ask a question about this loan file..."
            disabled={loading}
            aria-label="Ask about mortgage document"
          />

          <button
            type="submit"
            className="message-send-button"
            disabled={!message.trim() || loading}
            aria-label="Send message"
          >
            {loading ? (
              <LoaderCircle
                size={18}
                className="upload-spinner"
              />
            ) : (
              <Send size={18} />
            )}
          </button>

        </div>
      </form>

      {/* FOOTER */}
      <div className="message-input-footer">

        <span>
          <Paperclip size={13} />
          PDF document analysis
        </span>

        <span>
          Verify extracted information against source documents.
        </span>

      </div>

    </div>
  );
}
