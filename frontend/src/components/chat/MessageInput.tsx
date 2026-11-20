"use client";

import { useState } from "react";
import type { FormEvent, ChangeEvent } from "react";
import { Send, Paperclip, LoaderCircle } from "lucide-react";
import useChat from "../../hooks/useChat";
import { useChatContext } from "../../context/ChatContext";
import DocumentUpload from "../documents/DocumentUpload";

export default function MessageInput() {
  const [message, setMessage] = useState<string>("");
  const { sendMessage, loading } = useChat();
  const { selectedFile, currentDocument } = useChatContext();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const text = message.trim();

    if (!text || loading) return;

    setMessage("");
    await sendMessage(text);
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setMessage(event.target.value);
  };

  const placeholderText = selectedFile
    ? `Ask a question or enter extraction instruction for "${selectedFile.name}"...`
    : currentDocument
    ? "Ask a question about this loan file..."
    : "Upload a PDF above and ask a question or give instruction...";

  return (
    <div className="message-input-container">
      {/* DOCUMENT UPLOAD */}
      <div className="message-upload-section">
        <DocumentUpload />
      </div>

      {/* CHAT INPUT */}
      <form className="message-input-form" onSubmit={handleSubmit}>
        <div
          className="message-input-field"
          style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%" }}
        >
          <input
            type="text"
            value={message}
            onChange={handleChange}
            placeholder={placeholderText}
            disabled={loading}
            aria-label="Ask about mortgage document"
          />

          <button
            type="submit"
            className="message-send-button"
            disabled={!message.trim() || loading}
            aria-label="Send message"
            title="Send instruction and process document"
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
