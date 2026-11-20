
"use client";

import {
  FileText,
  ShieldCheck,
  Search,
  Clock,
  CheckCircle,
  AlertCircle,
  Settings,
} from "lucide-react";

import { useChatContext } from "../../context/ChatContext";

interface DocumentInfo {
  name?: string;
  filename?: string;
  size?: number;
}

export default function DetailsPanel() {
  const { currentDocument, loading } = useChatContext();

  const documentInfo = currentDocument as DocumentInfo | null;

  return (
    <aside className="details-panel">
      <div className="details-heading">
        <h3>Document Details</h3>
        <Settings size={19} />
      </div>

      <div className="document-preview">
        <FileText size={32} />

        <strong>
          {documentInfo?.name ||
            documentInfo?.filename ||
            "No PDF uploaded"}
        </strong>

        <span>
          {documentInfo
            ? "Document uploaded"
            : "Upload a document to begin"}
        </span>

        {typeof documentInfo?.size === "number" && (
          <small>
            {(documentInfo.size / 1024 / 1024).toFixed(2)} MB
          </small>
        )}
      </div>

      <div className="detail-section">
        <h4>DOCUMENT STATUS</h4>

        <div className="detail-row">
          <span>Document</span>
          <strong>
            {documentInfo ? "Uploaded" : "Pending"}
          </strong>
        </div>

        <div className="detail-row">
          <span>Processing</span>
          <strong>
            {loading ? "In progress" : "Not started"}
          </strong>
        </div>

        <div className="detail-row">
          <span>AI Status</span>
          <strong className="status-text">
            {loading ? "Analyzing" : "Ready"}
          </strong>
        </div>
      </div>

      <div className="detail-section">
        <h4>AUDIT INFORMATION</h4>

        <div className="audit-stat">
          <Search size={17} />
          <div>
            <strong>Audit Findings</strong>
            <span>Awaiting analysis</span>
          </div>
        </div>

        <div className="audit-stat">
          <CheckCircle size={17} />
          <div>
            <strong>Verified Evidence</strong>
            <span>Not available yet</span>
          </div>
        </div>

        <div className="audit-stat">
          <AlertCircle size={17} />
          <div>
            <strong>Discrepancies</strong>
            <span>Not evaluated</span>
          </div>
        </div>

        <div className="audit-stat">
          <Clock size={17} />
          <div>
            <strong>Last Audit</strong>
            <span>Not started</span>
          </div>
        </div>
      </div>

      <div className="security-note">
        <ShieldCheck size={21} />

        <div>
          <strong>Secure Document Processing</strong>
          <p>
            Documents are processed by your configured backend.
          </p>
        </div>
      </div>
    </aside>
  );
}
