
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  History,
  MessageSquare,
  FileText,
  Clock,
} from "lucide-react";

import { useChatContext } from "../../context/ChatContext";

interface HistoryMessage {
  id?: string;
  role?: string;
  content: string;
}

interface HistoryDocument {
  filename?: string;
  name?: string;
}

interface HistoryConversation {
  id: string;
  title?: string;
  messages?: HistoryMessage[];
  document?: HistoryDocument;
  createdAt?: string;
  updatedAt?: string;
}

export default function HistoryPage() {
  const router = useRouter();

  const { conversations = [], openConversation } = useChatContext();

  const typedConversations = conversations as HistoryConversation[];

  const sortedConversations = [...typedConversations].sort(
    (a, b) =>
      new Date(b.updatedAt || b.createdAt || 0).getTime() -
      new Date(a.updatedAt || a.createdAt || 0).getTime()
  );

  const handleOpenConversation = (id: string) => {
    openConversation(id);
    router.push("/");
  };

  const formatDate = (date?: string) => {
    if (!date) return "Date unavailable";

    const parsedDate = new Date(date);

    if (isNaN(parsedDate.getTime())) {
      return "Date unavailable";
    }

    return parsedDate.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <main className="history-page">
      <div className="history-header">
        <Link href="/" className="history-back-link">
          <ArrowLeft size={18} />
          Back to Chat
        </Link>

        <div className="history-heading">
          <div className="history-heading-icon">
            <History size={25} />
          </div>

          <div>
            <h1>Chat History</h1>
            <p>View and reopen your previous conversations.</p>
          </div>
        </div>

        <div className="history-count">
          {typedConversations.length}{" "}
          {typedConversations.length === 1
            ? "Conversation"
            : "Conversations"}
        </div>
      </div>

      {sortedConversations.length === 0 ? (
        <div className="history-empty">
          <MessageSquare size={42} />

          <h2>No chat history yet</h2>

          <p>
            Your previous questions and AI responses will
            appear here after you start a conversation.
          </p>

          <Link href="/" className="history-start-button">
            <MessageSquare size={17} />
            Start a conversation
          </Link>
        </div>
      ) : (
        <div className="history-list">
          {sortedConversations.map((conversation) => {
            const messages = conversation.messages || [];

            const lastMessage = messages[messages.length - 1];

            const documentName =
              conversation.document?.filename ||
              conversation.document?.name;

            return (
              <div
                key={conversation.id}
                className="history-card"
                onClick={() =>
                  handleOpenConversation(conversation.id)
                }
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" ||
                    event.key === " "
                  ) {
                    event.preventDefault();
                    handleOpenConversation(conversation.id);
                  }
                }}
              >
                <div className="history-card-icon">
                  <MessageSquare size={21} />
                </div>

                <div className="history-card-content">
                  <h3>
                    {conversation.title || "Untitled conversation"}
                  </h3>

                  <p className="history-preview">
                    {lastMessage?.content ||
                      "No messages available"}
                  </p>

                  <div className="history-card-meta">
                    <span>
                      <Clock size={14} />
                      {formatDate(
                        conversation.updatedAt ||
                          conversation.createdAt
                      )}
                    </span>

                    <span>
                      <MessageSquare size={14} />
                      {messages.length} messages
                    </span>

                    {documentName && (
                      <span>
                        <FileText size={14} />
                        {documentName}
                      </span>
                    )}
                  </div>
                </div>

                <div className="history-open">
                  Open chat →
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
