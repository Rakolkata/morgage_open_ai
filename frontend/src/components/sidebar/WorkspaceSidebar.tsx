
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
  ChevronDown,
} from "lucide-react";

import { useChatContext } from "../../context/ChatContext";

interface Conversation {
  id: string;
  title: string;
}

interface WorkspaceSidebarProps {
  onNewChat?: () => void;
}

export default function WorkspaceSidebar({
  onNewChat,
}: WorkspaceSidebarProps) {
  const {
    conversations = [],
    activeConversationId,
    openConversation,
    selectedAgent,
    setSelectedAgent,
  } = useChatContext();

  const typedConversations = conversations as Conversation[];

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
          type="button"
        >
          <PanelLeftClose size={18} />
        </button>
      </div>

      <button
        className="new-chat-button"
        onClick={onNewChat}
        type="button"
      >
        <Plus size={18} />
        New document
      </button>

      <div className="workspace-navigation">
        <p className="sidebar-label">WORKSPACE</p>

        <Link href="/" className="sidebar-link">
          <MessageSquare size={18} />
          Document Assistant
        </Link>

        {/* <Link href="/history" className="sidebar-link">
          <History size={18} />
          Chat History
        </Link>

        <Link href="/settings" className="sidebar-link">
          <Settings size={18} />
          Settings
        </Link> */}
      </div>

      <div className="recent-documents">
        <p className="sidebar-label">RECENT CHATS</p>

        {typedConversations.length === 0 ? (
          <div className="recent-empty">
            <MessageSquare size={20} />
            <span>No conversations yet</span>
          </div>
        ) : (
          <div className="recent-chat-list">
            {typedConversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                className={`sidebar-link recent-chat-item ${activeConversationId === conversation.id
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

      <div className="sidebar-agent-section">
        <p className="sidebar-label">ACTIVE AGENT</p>
        <div className="sidebar-agent-select-wrapper">
          <select
            id="agent-select"
            className="sidebar-agent-select"
            value={selectedAgent}
            onChange={(e) => setSelectedAgent(e.target.value)}
            aria-label="Select active agent"
          >
            <option value="orchestrator">orchestrator</option>
            <option value="data-extractor">data-extractor</option>
            <option value="auditor">auditor</option>
          </select>
          <ChevronDown size={14} className="sidebar-agent-select-arrow" />
        </div>
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
