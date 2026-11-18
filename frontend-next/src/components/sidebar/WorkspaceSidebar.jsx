
"use client";

import Link from "next/link";
import {
  FileText,
  Plus,
  MessageSquare,
  History,
  Settings,
  ShieldCheck,
  PanelLeftClose,
} from "lucide-react";

import { useChatContext } from "../../context/ChatContext";

export default function WorkspaceSidebar({ onNewChat }) {
  const { conversations = [], activeConversationId, openConversation } =
    useChatContext();

  return (
    <aside className="workspace-sidebar">
      <div className="workspace-brand">
        <div className="workspace-logo">
          <FileText size={22} />
        </div>

        <div>
          <h2>Mortgage AI</h2>
          <span>Post-Closing Audit</span>
        </div>

        <button
          className="sidebar-collapse"
          aria-label="Close sidebar"
        >
          <PanelLeftClose size={18} />
        </button>
      </div>

      <button className="new-chat-button" onClick={onNewChat}>
        <Plus size={18} />
        New document
      </button>

      <div className="workspace-navigation">
        <p className="sidebar-label">WORKSPACE</p>

        <Link href="/" className="sidebar-link">
          <MessageSquare size={18} />
          Document Assistant
        </Link>

        <Link href="/history" className="sidebar-link">
          <History size={18} />
          Chat History
        </Link>

        <Link href="/settings" className="sidebar-link">
          <Settings size={18} />
          Settings
        </Link>
      </div>

      <div className="recent-documents">
        <p className="sidebar-label">RECENT CHATS</p>

        {conversations.length === 0 ? (
          <div className="recent-empty">
            <MessageSquare size={20} />
            <span>No conversations yet</span>
          </div>
        ) : (
          <div className="recent-chat-list">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                className={`sidebar-link recent-chat-item ${
                  activeConversationId === conversation.id
                    ? "active"
                    : ""
                }`}
                onClick={() => openConversation(conversation.id)}
                title={conversation.title}
              >
                <MessageSquare size={16} />
                <span>{conversation.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="sidebar-security">
        <ShieldCheck size={20} />

        <div>
          <strong>Secure Processing</strong>
          <span>Local document analysis</span>
        </div>
      </div>
    </aside>
  );
}
