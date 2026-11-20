"use client";

import { useState } from "react";
import {
  Menu,
  Layers3,
  FileText,
  Table2,
  ClipboardCheck,
  Download,
  ShieldCheck,
  Upload,
  Clock3,
} from "lucide-react";

import WorkspaceSidebar from "../sidebar/WorkspaceSidebar";
import ChatWindow from "../chat/ChatWindow";
import { useChatContext } from "../../context/ChatContext";

const tabs = [
  { name: "Document Assistant", icon: FileText },
  { name: "Extracted Data", icon: Table2 },
  { name: "Audit Report", icon: ClipboardCheck },
  { name: "Export Reports", icon: Download },
];

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("Document Assistant");

  const { clearChat } = useChatContext();

  return (
    <main className="app-container">
      {sidebarOpen && <WorkspaceSidebar onNewChat={clearChat} />}

      <section className="main-panel">
        <header className="topbar">
          <button
            type="button"
            className="icon-button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label="Toggle sidebar"
          >
            <Menu size={20} />
          </button>

          <div className="topbar-title">
            <span>MORTGAGE OPERATIONS</span>
            <h3>Post-Closing Audit Workspace</h3>
          </div>

          <div className="status">
            <span className="status-dot" />
            Local AI Workspace
          </div>
        </header>

        <div className="workspace-content">
          <section className="workspace-main">
            <div className="workspace-heading">
              <div className="workspace-heading-icon">
                <Layers3 size={23} />
              </div>

              <div>
                <h1>Mortgage Audit Workspace</h1>
                <p>
                  Review loan documents, extracted information and
                  post-closing audit results.
                </p>
              </div>
            </div>

            <div className="workspace-tabs">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.name;

                return (
                  <button
                    key={tab.name}
                    type="button"
                    className={`workspace-tab ${isActive ? "active" : ""}`}
                    onClick={() => setActiveTab(tab.name)}
                  >
                    <Icon size={17} />
                    <span>{tab.name}</span>
                  </button>
                );
              })}
            </div>

            <div className="workspace-view">
              {activeTab === "Document Assistant" && <ChatWindow />}

              {activeTab === "Extracted Data" && (
                <PlaceholderTab
                  icon={<Table2 size={22} />}
                  title="Extracted Data"
                  description="Extracted loan information will appear here after document processing."
                />
              )}

              {activeTab === "Audit Report" && (
                <PlaceholderTab
                  icon={<ClipboardCheck size={22} />}
                  title="Audit Report"
                  description="Review post-closing audit findings and document verification results here."
                />
              )}

              {activeTab === "Export Reports" && (
                <PlaceholderTab
                  icon={<Download size={22} />}
                  title="Export Reports"
                  description="Download processed document information and audit reports here."
                />
              )}
            </div>
          </section>

          <aside className="workspace-details-panel">
            <div className="details-heading">
              <span>DOCUMENT OVERVIEW</span>
              <h2>Document Details</h2>
            </div>

            <div className="current-document-card">
              <div className="current-document-icon">
                <FileText size={22} />
              </div>

              <div className="current-document-content">
                <span className="details-label">CURRENT DOCUMENT</span>
                <strong>No document selected</strong>
                <p>-- pages</p>
              </div>
            </div>

            <div className="details-section">
              <h3>Processing Status</h3>

              <StatusRow
                icon={<Upload size={17} />}
                label="Document Upload"
                status="Pending"
              />

              <StatusRow
                icon={<Table2 size={17} />}
                label="Data Extraction"
                status="Pending"
              />

              <StatusRow
                icon={<ClipboardCheck size={17} />}
                label="Audit Review"
                status="Pending"
              />

              <StatusRow
                icon={<Download size={17} />}
                label="Report Export"
                status="Pending"
              />
            </div>

            <div className="details-section">
              <div className="document-security">
                <ShieldCheck size={21} className="security-icon" />

                <div>
                  <strong>Document Workspace</strong>
                  <p>
                    Verify extracted data and audit findings against
                    original source documents.
                  </p>
                </div>
              </div>
            </div>

            <div className="details-footer">
              <Clock3 size={15} />
              Local document processing workspace
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function StatusRow({
  icon,
  label,
  status,
}: {
  icon: React.ReactNode;
  label: string;
  status: string;
}) {
  return (
    <div className="details-status-row">
      {icon}
      <span>{label}</span>
      <span className={`status-badge ${status === "Completed" ? "completed" : ""}`}>
        {status}
      </span>
    </div>
  );
}

function PlaceholderTab({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="workspace-placeholder">
      <div className="placeholder-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{description}</p>

      <div className="placeholder-table">
        <div className="placeholder-table-header">
          <span>Field</span>
          <span>Details</span>
          <span>Status</span>
        </div>

        <div className="placeholder-table-row">
          <span>Document</span>
          <span>Waiting for upload</span>
          <span>Pending</span>
        </div>

        <div className="placeholder-table-row">
          <span>Processing</span>
          <span>Not started</span>
          <span>Pending</span>
        </div>
      </div>

      <span className="placeholder-note">
        Upload a loan document using the Document Assistant to begin.
      </span>
    </div>
  );
}