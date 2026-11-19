
"use client";

import { useState } from "react";
import {
  Menu,
  PanelRightClose,
  PanelRightOpen,
  FileText,
  Table2,
  ClipboardCheck,
  Download,
  ShieldCheck,
  FileUp,
  CircleCheck,
  Clock3,
  Layers3,
} from "lucide-react";

import WorkspaceSidebar from "../sidebar/WorkspaceSidebar";
import ChatWindow from "../chat/ChatWindow";
import { useChatContext } from "../../context/ChatContext";

const tabs = [
  { id: "chat", label: "Document Assistant", icon: FileText },
  { id: "extraction", label: "Extracted Data", icon: Table2 },
  { id: "audit", label: "Audit Report", icon: ClipboardCheck },
  { id: "export", label: "Export Reports", icon: Download },
];

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState("chat");

  const { clearChat, currentDocument } = useChatContext();

  const handleNewChat = () => {
    clearChat();
    setActiveTab("chat");
  };

  return (
    <main className="app-container">
      {sidebarOpen && <WorkspaceSidebar onNewChat={handleNewChat} />}

      <section className="main-panel">
        <header className="topbar">
          <button
            className="icon-button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label="Toggle sidebar"
          >
            <Menu size={19} />
          </button>

          <div className="topbar-title">
            <span>MORTGAGE OPERATIONS</span>
            <h3>Post-Closing Audit Workspace</h3>
          </div>

          <div className="topbar-actions">
            <div className="status">
              <span className="status-dot" />
              Local AI
            </div>

            <button
              className="icon-button"
              onClick={() => setDetailsOpen((prev) => !prev)}
              aria-label="Toggle document details"
            >
              {detailsOpen ? (
                <PanelRightClose size={19} />
              ) : (
                <PanelRightOpen size={19} />
              )}
            </button>
          </div>
        </header>

        <div className="workspace-content">
          <section className="workspace-main">
            <div className="workspace-heading">
              <div className="workspace-heading-icon">
                <Layers3 size={22} />
              </div>

              <div>
                <h1>Mortgage Audit Workspace</h1>
                <p>
                  Review loan documents, extracted information and
                  post-closing audit results.
                </p>
              </div>
            </div>

            <nav className="workspace-tabs" aria-label="Audit workspace">
              {tabs.map((tab) => {
                const Icon = tab.icon;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    className={`workspace-tab ${
                      activeTab === tab.id ? "active" : ""
                    }`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <Icon size={17} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="workspace-view">
              {activeTab === "chat" && <ChatWindow />}

              {activeTab === "extraction" && (
                <section className="workspace-placeholder">
                  <div className="placeholder-icon">
                    <Table2 size={24} />
                  </div>

                  <h2>Extracted Loan Data</h2>

                  <p>
                    Structured information extracted from the uploaded
                    mortgage document will appear here.
                  </p>

                  <div className="placeholder-table">
                    <div className="placeholder-table-header">
                      <span>Field</span>
                      <span>Extracted Value</span>
                      <span>Source</span>
                    </div>

                    {[
                      "Borrower Name",
                      "Loan Number",
                      "Loan Amount",
                      "Property Address",
                      "Loan Type",
                      "Interest Rate",
                    ].map((field) => (
                      <div className="placeholder-table-row" key={field}>
                        <span>{field}</span>
                        <span>—</span>
                        <span>—</span>
                      </div>
                    ))}
                  </div>

                  <span className="placeholder-note">
                    Extraction results will populate this table after
                    document processing.
                  </span>
                </section>
              )}

              {activeTab === "audit" && (
                <section className="workspace-placeholder">
                  <div className="placeholder-icon">
                    <ClipboardCheck size={24} />
                  </div>

                  <h2>Post-Closing Audit Report</h2>

                  <p>
                    Audit discrepancies, missing evidence and review
                    findings will be displayed here.
                  </p>

                  <div className="audit-summary-grid">
                    <div className="audit-summary-item">
                      <span>Audit Status</span>
                      <strong>Not started</strong>
                    </div>

                    <div className="audit-summary-item">
                      <span>Findings</span>
                      <strong>—</strong>
                    </div>

                    <div className="audit-summary-item">
                      <span>Missing Documents</span>
                      <strong>—</strong>
                    </div>
                  </div>

                  <div className="placeholder-table">
                    <div className="placeholder-table-header audit-table-header">
                      <span>Audit Item</span>
                      <span>Status</span>
                      <span>Evidence</span>
                    </div>

                    <div className="placeholder-table-row">
                      <span>Audit findings will appear here</span>
                      <span>—</span>
                      <span>—</span>
                    </div>
                  </div>
                </section>
              )}

              {activeTab === "export" && (
                <section className="workspace-placeholder">
                  <div className="placeholder-icon">
                    <Download size={24} />
                  </div>

                  <h2>Download Audit Report</h2>

                  <p>
                    Download the structured audit results in your
                    preferred format.
                  </p>

                  <div className="export-format-grid">
                    {[
                      { name: "JSON", description: "Structured data" },
                      { name: "XML", description: "XML report" },
                      { name: "Excel", description: "Spreadsheet report" },
                      { name: "PDF", description: "Audit document" },
                    ].map((format) => (
                      <div className="export-format" key={format.name}>
                        <div className="export-format-icon">
                          <Download size={18} />
                        </div>

                        <strong>{format.name}</strong>
                        <span>{format.description}</span>

                        <button type="button" disabled>
                          <Download size={15} />
                          Download
                        </button>
                      </div>
                    ))}
                  </div>

                  <span className="placeholder-note">
                    Report downloads will be connected after the
                    frontend workspace is completed.
                  </span>
                </section>
              )}
            </div>
          </section>

          {detailsOpen && (
            <aside className="workspace-details-panel">
              <div className="details-heading">
                <span>DOCUMENT OVERVIEW</span>
                <h2>Document Details</h2>
              </div>

              <div className="current-document-card">
                <div className="current-document-icon">
                  <FileText size={20} />
                </div>

                <div className="current-document-content">
                  <span className="details-label">CURRENT DOCUMENT</span>

                  <strong>
                    {currentDocument
                      ? currentDocument.name
                      : "No document uploaded"}
                  </strong>

                  <p>
                    {currentDocument
                      ? `${currentDocument.pageCount || "—"} pages`
                      : "Upload a PDF to begin"}
                  </p>
                </div>
              </div>

              <div className="details-section">
                <h3>Processing Status</h3>

                <div className="details-status-row">
                  <FileUp size={16} />
                  <span>Document Upload</span>

                  <span
                    className={`status-badge ${
                      currentDocument ? "completed" : ""
                    }`}
                  >
                    {currentDocument ? "Completed" : "Pending"}
                  </span>
                </div>

                <div className="details-status-row">
                  <Table2 size={16} />
                  <span>Data Extraction</span>
                  <span className="status-badge">Pending</span>
                </div>

                <div className="details-status-row">
                  <ClipboardCheck size={16} />
                  <span>Audit Review</span>
                  <span className="status-badge">Pending</span>
                </div>

                <div className="details-status-row">
                  <Download size={16} />
                  <span>Report Export</span>
                  <span className="status-badge">Pending</span>
                </div>
              </div>

              <div className="details-section document-security">
                <div className="security-icon">
                  <ShieldCheck size={18} />
                </div>

                <div>
                  <strong>Document Workspace</strong>
                  <p>
                    Verify extracted data and audit findings against
                    original source documents.
                  </p>
                </div>
              </div>

              <div className="details-footer">
                <Clock3 size={14} />
                <span>Review source evidence before finalizing</span>
              </div>
            </aside>
          )}
        </div>
      </section>
    </main>
  );
}
