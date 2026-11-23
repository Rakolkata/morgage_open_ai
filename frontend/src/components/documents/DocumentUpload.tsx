"use client";

import { useRef, useState } from "react";
import type {
  ChangeEvent,
  DragEvent,
  MouseEvent,
  KeyboardEvent,
} from "react";
import {
  Upload,
  FileText,
  X,
  LoaderCircle,
  CheckCircle2,
} from "lucide-react";

import { useChatContext } from "../../context/ChatContext";

interface UploadedDocument {
  id: string;
  document_id: string;
  name: string;
  filename: string;
  storage_path?: string;
  instruction?: string;
  size?: number;
  pageCount?: number | null;
  page_count?: number | null;
  status?: string;
  [key: string]: unknown;
}

export default function DocumentUpload() {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [error, setError] = useState<string>("");
  const [dragging, setDragging] = useState<boolean>(false);

  const {
    currentDocument,
    setCurrentDocument,
    selectedFile,
    setSelectedFile,
    loading,
  } = useChatContext();

  const documentInfo = currentDocument as UploadedDocument | null;

  const handleSelectFile = (file?: File) => {
    if (!file) return;

    setError("");

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setError("Only PDF files are supported.");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setError("File size exceeds the 50 MB limit.");
      return;
    }

    setSelectedFile(file);
    setError("");
  };

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    handleSelectFile(file);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);

    if (loading || currentDocument) return;

    const file = event.dataTransfer.files?.[0];
    handleSelectFile(file);
  };

  const removeDocument = () => {
    setCurrentDocument(null);
    setSelectedFile(null);
    setError("");
  };

  const handleDropzoneClick = (event: MouseEvent<HTMLDivElement>) => {
    if (
      loading ||
      (event.target instanceof HTMLElement &&
        event.target.closest("input, button"))
    ) {
      return;
    }

    inputRef.current?.click();
  };

  const handleDropzoneKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      (event.key === "Enter" || event.key === " ") &&
      !loading
    ) {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  return (
    <div className="document-upload">
      {/* 1. DROPZONE (when no file is selected and no document is uploaded) */}
      {!documentInfo && !selectedFile && (
        <div
          className={`upload-dropzone ${
            dragging ? "dragging" : ""
          } ${loading ? "uploading" : ""}`}
          onClick={handleDropzoneClick}
          onDragOver={(event) => {
            event.preventDefault();
            if (!loading) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          onKeyDown={handleDropzoneKeyDown}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={handleFileInputChange}
            disabled={loading}
          />

          <div className="upload-visual">
            <Upload size={24} />
          </div>

          <div className="upload-text">
            <h3>Upload mortgage document</h3>
            <p>Drag and drop your PDF here, or click to browse</p>
          </div>

          <span className="upload-file-limit">
            PDF only · Up to 50 MB
          </span>
        </div>
      )}

      {/* 2. SELECTED FILE READY (styled matching the design without extra buttons or textareas) */}
      {!documentInfo && selectedFile && (
        <div className="uploaded-document">
          <FileText size={22} className="text-blue-600" />

          <div className="uploaded-document-info">
            <strong title={selectedFile.name}>
              {selectedFile.name}
            </strong>
            <span>
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB · PDF attached
            </span>
            <span className="text-[11px] text-blue-600 font-medium">
              Enter your instruction below and send to upload &amp; analyze ↓
            </span>
          </div>

          <button
            type="button"
            onClick={() => setSelectedFile(null)}
            disabled={loading}
            aria-label="Remove selected file"
            title="Remove file"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* 3. UPLOADED DOCUMENT DISPLAY */}
      {documentInfo && (
        <div className="uploaded-document">
          <FileText size={22} />

          <div className="uploaded-document-info">
            <strong title={documentInfo.name || documentInfo.filename}>
              {documentInfo.name || documentInfo.filename}
            </strong>

            <span>
              {documentInfo.page_count || documentInfo.pageCount
                ? `${documentInfo.page_count || documentInfo.pageCount} pages`
                : "PDF document"}
            </span>

            {documentInfo.storage_path && (
              <span
                className="text-[11px] text-slate-500 truncate max-w-sm block font-mono bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 mt-0.5"
                title={documentInfo.storage_path}
              >
                📁 {documentInfo.storage_path}
              </span>
            )}

            <span className="uploaded-status">
              <CheckCircle2 size={13} />
              Saved to uploads &amp; database
            </span>
          </div>

          <button
            type="button"
            onClick={removeDocument}
            aria-label="Remove document"
            title="Remove document"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {error && (
        <div className="upload-error">
          {error}
        </div>
      )}
    </div>
  );
}
