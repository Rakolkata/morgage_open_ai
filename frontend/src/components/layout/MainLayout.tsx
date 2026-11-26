
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
  RefreshCw,
  FileSpreadsheet,
  FileCode,
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

  const {
    clearChat,
    currentDocument,
    extractedFields,
    extractedDataLoading,
    extractedDataError,
    refreshExtractedData,
    auditResult,
  } = useChatContext();

  const handleTabChange = (tabName: string) => {
    setActiveTab(tabName);

    if (
      tabName === "Extracted Data" ||
      tabName === "Audit Report" ||
      tabName === "Export Reports"
    ) {
      void refreshExtractedData();
    }
  };

  const documentName =
    typeof currentDocument?.filename === "string"
      ? currentDocument.filename
      : "No document selected";

  const pageCount =
    typeof currentDocument?.page_count === "number"
      ? currentDocument.page_count
      : null;

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
                    onClick={() => handleTabChange(tab.name)}
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
                <section className="workspace-placeholder">
                  <div className="placeholder-icon">
                    <Table2 size={22} />
                  </div>

                  <h2>Extracted Data</h2>

                  <p>
                    Review the information extracted from your selected
                    document.
                  </p>

                  <div className="extracted-data-header">
                    <div className="extracted-doc-info">
                      <strong className="extracted-doc-title">
                        {documentName}
                      </strong>
                      {pageCount !== null && (
                        <p className="extracted-doc-pages">
                          {pageCount} pages
                        </p>
                      )}
                    </div>

                    {extractedFields.length > 0 && (
                      <button
                        type="button"
                        onClick={() => void refreshExtractedData()}
                        disabled={extractedDataLoading}
                        className="extracted-refresh-btn"
                        title="Refresh extracted data"
                        aria-label="Refresh extracted data"
                      >
                        <RefreshCw
                          size={14}
                          className={
                            extractedDataLoading ? "animate-spin" : ""
                          }
                        />
                        <span>Refresh</span>
                      </button>
                    )}
                  </div>

                  {extractedDataLoading ? (
                    <p>Loading extracted data...</p>
                  ) : extractedDataError ? (
                    <p className="text-red-600">
                      {extractedDataError}
                    </p>
                  ) : extractedFields.length > 0 ? (
                    <div className="placeholder-table">
                      <div className="placeholder-table-header">
                        <span>Field</span>
                        <span>Details</span>
                        <span>Status</span>
                      </div>

                      {extractedFields.map((field) => (
                        <div
                          className="placeholder-table-row"
                          key={field.id}
                        >
                          <span>{field.field_path}</span>

                          <span>
                            {field.value?.trim() || "—"}
                          </span>

                          <span>
                            {field.value?.trim()
                              ? "Extracted"
                              : "Missing"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="placeholder-table">
                      <div className="placeholder-table-header">
                        <span>Field</span>
                        <span>Details</span>
                        <span>Status</span>
                      </div>

                      <div className="placeholder-table-row">
                        <span>Document</span>
                        <span>
                          {currentDocument
                            ? documentName
                            : "Waiting for upload"}
                        </span>
                        <span>
                          {currentDocument ? "Uploaded" : "Pending"}
                        </span>
                      </div>

                      <div className="placeholder-table-row">
                        <span>Processing</span>
                        <span>Not started</span>
                        <span>Pending</span>
                      </div>
                    </div>
                  )}

                  <span className="placeholder-note">
                    {currentDocument
                      ? "Extracted fields are loaded from the saved document data."
                      : "Upload a loan document using the Document Assistant to begin."}
                  </span>
                </section>
              )}

              {activeTab === "Audit Report" && (
                auditResult ? (
                  <section className="extracted-data-panel">
                    <div className="extracted-data-header">
                      <div>
                        <h2>Audit & Verification Report</h2>
                        <p>
                          Audit findings and discrepancy checks for{" "}
                          <strong>{documentName}</strong>
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {auditResult.verdict && (
                          <span
                            className={`audit-verdict-pill ${
                              auditResult.verdict.toUpperCase().includes("PASS")
                                ? "passed"
                                : "flagged"
                            }`}
                          >
                            {auditResult.verdict}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => void refreshExtractedData()}
                          disabled={extractedDataLoading}
                          className="extracted-refresh-btn"
                          title="Refresh audit data"
                        >
                          <RefreshCw
                            size={14}
                            className={extractedDataLoading ? "animate-spin" : ""}
                          />
                          <span>Refresh</span>
                        </button>
                      </div>
                    </div>

                    {/* Summary Metric Cards */}
                    <div className="audit-metrics-grid">
                      <div className="audit-metric-card">
                        <span className="metric-label">Total Checks</span>
                        <strong className="metric-val">{auditResult.total_checks ?? auditResult.findings?.length ?? 0}</strong>
                        <span className="metric-sub">Parameters verified</span>
                      </div>

                      <div className="audit-metric-card metric-passed">
                        <span className="metric-label">Passed</span>
                        <strong className="metric-val text-emerald-600">{auditResult.passed ?? 0}</strong>
                        <span className="metric-sub">Matches document</span>
                      </div>

                      <div className="audit-metric-card metric-flagged">
                        <span className="metric-label">Exceptions</span>
                        <strong className="metric-val text-amber-600">{auditResult.exceptions ?? 0}</strong>
                        <span className="metric-sub">Discrepancies found</span>
                      </div>

                      <div className="audit-metric-card">
                        <span className="metric-label">Missing Evidence</span>
                        <strong className="metric-val text-slate-600">{auditResult.missing_evidence ?? 0}</strong>
                        <span className="metric-sub">Unverified fields</span>
                      </div>
                    </div>

                    {/* Primary Download Banner */}
                    {auditResult.download_url && (
                      <div className="audit-download-banner">
                        <div className="flex items-center gap-3">
                          <div className="audit-download-icon">
                            <FileSpreadsheet size={22} className="text-emerald-700" />
                          </div>
                          <div>
                            <strong>{auditResult.export_filename || `Audit Report (${(auditResult.file_format || "excel").toUpperCase()})`}</strong>
                            <p>Ready for instant download in requested format</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <a
                            href={auditResult.download_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-download-primary"
                          >
                            <Download size={14} />
                            <span>Download {(auditResult.file_format || "excel").toUpperCase()}</span>
                          </a>
                        </div>
                      </div>
                    )}

                    {/* Detailed Findings Table */}
                    {Array.isArray(auditResult.findings) && auditResult.findings.length > 0 ? (
                      <div className="placeholder-table mt-4">
                        <div className="placeholder-table-header audit-grid-header">
                          <span>Field / Term</span>
                          <span>Status</span>
                          <span>Extracted Value</span>
                          <span>Document Value</span>
                          <span>Page</span>
                          <span>Audit Explanation</span>
                        </div>

                        {auditResult.findings.map((f, idx) => {
                          const isMatch = String(f.status).toUpperCase() === "MATCH";
                          return (
                            <div key={idx} className="placeholder-table-row audit-grid-row">
                              <span className="font-semibold text-slate-800">{f.field_path}</span>
                              <span>
                                <span className={`status-pill ${isMatch ? "match" : "mismatch"}`}>
                                  {f.status}
                                </span>
                              </span>
                              <span className="text-slate-700">{f.extracted_value ?? "—"}</span>
                              <span className="text-slate-700">{f.document_value ?? "—"}</span>
                              <span className="text-slate-500">{f.page ?? "—"}</span>
                              <span className="text-slate-600 text-xs">{f.explanation ?? "—"}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500 py-4">No detailed field findings recorded in this audit.</p>
                    )}
                  </section>
                ) : (
                  <PlaceholderTab
                    icon={<ClipboardCheck size={22} />}
                    title="Audit Report"
                    description="Run the Auditor Agent to perform document verification and view findings here."
                    instructions="Example prompt: 'Audit the extracted data against the document and prepare in excel format'"
                  />
                )
              )}

              {activeTab === "Export Reports" && (
                auditResult ? (
                  <section className="extracted-data-panel">
                    <div className="extracted-data-header">
                      <div>
                        <h2>Export Reports & Downloads</h2>
                        <p>
                          Download audited reports and extracted data for{" "}
                          <strong>{documentName}</strong>
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => void refreshExtractedData()}
                        disabled={extractedDataLoading}
                        className="extracted-refresh-btn"
                        title="Refresh export reports"
                      >
                        <RefreshCw
                          size={14}
                          className={extractedDataLoading ? "animate-spin" : ""}
                        />
                        <span>Refresh</span>
                      </button>
                    </div>

                    <div className="export-cards-grid">
                      {/* Excel Card */}
                      <div className="export-card">
                        <div className="export-card-header">
                          <div className="export-card-icon excel">
                            <FileSpreadsheet size={24} />
                          </div>
                          <div>
                            <h3>Excel Report</h3>
                            <span>.XLSX Format</span>
                          </div>
                        </div>
                        <p className="export-card-desc">
                          Full multi-tab audit workbook including verification summary, discrepancy analysis, and field evidence.
                        </p>
                        <div className="export-card-footer">
                          {auditResult?.available_downloads?.excel || (auditResult?.file_format === "excel" ? auditResult?.download_url : null) ? (
                            <a
                              href={auditResult?.available_downloads?.excel || auditResult?.download_url!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-card-download"
                            >
                              <Download size={14} />
                              <span>Download Excel (.xlsx)</span>
                            </a>
                          ) : (
                            <span className="export-status-badge">Available via Auditor</span>
                          )}
                        </div>
                      </div>

                      {/* JSON Card */}
                      <div className="export-card">
                        <div className="export-card-header">
                          <div className="export-card-icon json">
                            <FileCode size={24} />
                          </div>
                          <div>
                            <h3>JSON Export</h3>
                            <span>.JSON Format</span>
                          </div>
                        </div>
                        <p className="export-card-desc">
                          Standardized machine-readable audit report with structured findings, confidence levels, and metadata.
                        </p>
                        <div className="export-card-footer">
                          {auditResult?.available_downloads?.json || (auditResult?.file_format === "json" ? auditResult?.download_url : null) ? (
                            <a
                              href={auditResult?.available_downloads?.json || auditResult?.download_url!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-card-download"
                            >
                              <Download size={14} />
                              <span>Download JSON (.json)</span>
                            </a>
                          ) : (
                            <span className="export-status-badge">Available via Auditor</span>
                          )}
                        </div>
                      </div>

                      {/* XML Card */}
                      <div className="export-card">
                        <div className="export-card-header">
                          <div className="export-card-icon xml">
                            <FileCode size={24} />
                          </div>
                          <div>
                            <h3>XML / MISMO</h3>
                            <span>.XML Format</span>
                          </div>
                        </div>
                        <p className="export-card-desc">
                          Mortgage standard XML structure ready for downstream underwriting and servicing ingestion.
                        </p>
                        <div className="export-card-footer">
                          {auditResult?.available_downloads?.xml || (auditResult?.file_format === "xml" ? auditResult?.download_url : null) ? (
                            <a
                              href={auditResult?.available_downloads?.xml || auditResult?.download_url!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-card-download"
                            >
                              <Download size={14} />
                              <span>Download XML (.xml)</span>
                            </a>
                          ) : (
                            <span className="export-status-badge">Available via Auditor</span>
                          )}
                        </div>
                      </div>

                      {/* CSV Card */}
                      <div className="export-card">
                        <div className="export-card-header">
                          <div className="export-card-icon csv">
                            <Table2 size={24} />
                          </div>
                          <div>
                            <h3>CSV Summary</h3>
                            <span>.CSV Format</span>
                          </div>
                        </div>
                        <p className="export-card-desc">
                          Tabular flat-file export of discrepancies and field statuses for spreadsheet review and data warehousing.
                        </p>
                        <div className="export-card-footer">
                          {auditResult?.available_downloads?.csv || (auditResult?.file_format === "csv" ? auditResult?.download_url : null) ? (
                            <a
                              href={auditResult?.available_downloads?.csv || auditResult?.download_url!}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-card-download"
                            >
                              <Download size={14} />
                              <span>Download CSV (.csv)</span>
                            </a>
                          ) : (
                            <span className="export-status-badge">Available via Auditor</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>
                ) : (
                  <PlaceholderTab
                    icon={<Download size={22} />}
                    title="Export Reports"
                    description="Download processed document information and audit reports here."
                    instructions="Trigger an audit by asking the Auditor Agent: 'Audit the extracted data against the document and prepare in excel format'."
                  />
                )
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
                <strong>{documentName}</strong>
                <p>
                  {pageCount !== null ? `${pageCount} pages` : "-- pages"}
                </p>
              </div>
            </div>

            <div className="details-section">
              <h3>Processing Status</h3>

              <StatusRow
                icon={<Upload size={17} />}
                label="Document Upload"
                status={currentDocument ? "Completed" : "Pending"}
              />

              <StatusRow
                icon={<Table2 size={17} />}
                label="Data Extraction"
                status={
                  extractedFields.length > 0
                    ? "Completed"
                    : "Pending"
                }
              />

              <StatusRow
                icon={<ClipboardCheck size={17} />}
                label="Audit Review"
                status={auditResult ? "Completed" : "Pending"}
              />

              <StatusRow
                icon={<Download size={17} />}
                label="Report Export"
                status={auditResult?.download_url ? "Completed" : "Pending"}
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
      <span
        className={`status-badge ${
          status === "Completed" ? "completed" : ""
        }`}
      >
        {status}
      </span>
    </div>
  );
}

function PlaceholderTab({
  icon,
  title,
  description,
  instructions,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  instructions?: string;
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
        {instructions || "Upload a loan document using the Document Assistant to begin."}
      </span>
    </div>
  );
}
