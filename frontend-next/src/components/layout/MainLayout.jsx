
"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import WorkspaceSidebar from "../sidebar/WorkspaceSidebar";
import ChatWindow from "../chat/ChatWindow";

import { useChatContext } from "../../context/ChatContext";

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { clearChat } = useChatContext();

  const handleNewChat = () => {
    clearChat();
  };

  return (
    <main className="app-container">

      {sidebarOpen && (
        <WorkspaceSidebar onNewChat={handleNewChat} />
      )}

      <section className="main-panel">

        <header className="topbar">
          <button
            className="icon-button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            <Menu size={20} />
          </button>

          <div className="topbar-title">
            <span>MORTGAGE INTELLIGENCE</span>
            <h3>Document Assistant</h3>
          </div>

          <div className="status">
            <span className="status-dot"></span>
            Local AI Assistant
          </div>
        </header>

        <ChatWindow />

      </section>

    </main>
  );
}
