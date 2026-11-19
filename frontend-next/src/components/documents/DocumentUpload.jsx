"use client";

import { useRef, useState } from "react";
import {
  Upload,
  FileText,
  X,
  LoaderCircle,
  CheckCircle2,
} from "lucide-react";

import { useChatContext } from "../../context/ChatContext";
import { uploadDocument } from "../../services/documentService";

export default function DocumentUpload() {
  const inputRef = useRef(null);

  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const {
    currentDocument,
    setCurrentDocument,
    setLoading,
  } = useChatContext();

  const processFile = async (file) => {
    if (!file) return;

    setError("");

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setError("Only PDF files are supported.");
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setError("File size exceeds the 25 MB limit.");
      return;
    }

    setUploading(true);
    setLoading(true);

    try {
      const result = await uploadDocument(file);

      // Support different backend response structures.
      const documentData =
        result?.data?.data ||
        result?.data ||
        result;

      const documentId =
        documentData?.document_id ||
        documentData?.id ||
        result?.document_id ||
        result?.data?.document_id;

      const filename =
        documentData?.filename ||
        result?.filename ||
        file.name;

      const pageCount =
        documentData?.page_count ??
        result?.page_count ??
        null;

      // Do not save a document without a valid ID.
      if (!documentId) {
        console.error("Upload response:", result);

        throw new Error(
          "Upload completed, but the backend did not return a document ID."
        );
      }

      // Store both id and document_id.
      const uploadedDocument = {
        id: documentId,
        document_id: documentId,
        name: filename,
        filename,
        size: file.size,
        pageCount,
        page_count: pageCount,
        status: "Uploaded",
      };

      console.log("Uploaded document stored:", uploadedDocument);

      setCurrentDocument(uploadedDocument);

      setError("");
    } catch (err) {
      console.error("Document upload failed:", err);

      const detail =
        err.response?.data?.detail ||
        err.response?.data?.error?.message;

      let errorMessage =
        err.message ||
        "Upload failed. Please check the backend connection.";

      if (typeof detail === "string") {
        errorMessage = detail;
      } else if (Array.isArray(detail)) {
        errorMessage = detail
          .map((item) =>
            typeof item === "string"
              ? item
              : item.msg || JSON.stringify(item)
          )
          .join(", ");
      } else if (detail && typeof detail === "object") {
        errorMessage =
          detail.message ||
          detail.error ||
          JSON.stringify(detail);
      }

      setError(errorMessage);
    } finally {
      setUploading(false);
      setLoading(false);
    }
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];

    await processFile(file);

    event.target.value = "";
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    setDragging(false);

    if (uploading || currentDocument) return;

    const file = event.dataTransfer.files?.[0];

    await processFile(file);
  };

  const removeDocument = () => {
    setCurrentDocument(null);
    setError("");
  };

  return (
    <div className="document-upload">
      {!currentDocument ? (
        <div
          className={`upload-dropzone ${
            dragging ? "dragging" : ""
          } ${uploading ? "uploading" : ""}`}
          onClick={() =>
            !uploading && inputRef.current?.click()
          }
          onDragOver={(event) => {
            event.preventDefault();
            if (!uploading) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (
              (event.key === "Enter" ||
                event.key === " ") &&
              !uploading
            ) {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={handleUpload}
            disabled={uploading}
          />

          <div className="upload-visual">
            {uploading ? (
              <LoaderCircle
                size={24}
                className="upload-spinner"
              />
            ) : (
              <Upload size={24} />
            )}
          </div>

          <div className="upload-text">
            <h3>
              {uploading
                ? "Uploading document"
                : "Upload mortgage document"}
            </h3>

            <p>
              {uploading
                ? "Please wait while your document is processed."
                : "Drag and drop your PDF here, or browse files"}
            </p>
          </div>

          {!uploading && (
            <span className="upload-file-limit">
              PDF only · Maximum 25 MB
            </span>
          )}
        </div>
      ) : (
        <div className="uploaded-document">
          <div className="uploaded-document-icon">
            <FileText size={21} />
          </div>

          <div className="uploaded-document-info">
            <strong title={currentDocument.name}>
              {currentDocument.name}
            </strong>

            <span>
              {currentDocument.pageCount
                ? `${currentDocument.pageCount} pages`
                : "PDF document"}
            </span>

            <span className="uploaded-status">
              <CheckCircle2 size={13} />
              Successfully uploaded
            </span>
          </div>

          <button
            type="button"
            className="remove-document-button"
            onClick={removeDocument}
            aria-label="Remove uploaded document"
            title="Remove document"
          >
            <X size={17} />
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
