
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
import { uploadDocument } from "../../services/documentService";

interface UploadedDocument {
  id: string;
  document_id: string;
  name: string;
  filename: string;
  size: number;
  pageCount: number | null;
  page_count: number | null;
  status: string;
   [key: string]: unknown;
}

interface UploadError {
  response?: {
    data?: {
      detail?: unknown;
      error?: {
        message?: string;
      };
    };
  };
  message?: string;
}

interface UploadResponse {
  data?: {
    data?: Record<string, unknown>;
    document_id?: string;
    filename?: string;
    page_count?: number;
  } & Record<string, unknown>;
  document_id?: string;
  id?: string;
  filename?: string;
  page_count?: number;
}

function getErrorMessage(error: unknown): string {
  const err = error as UploadError;

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
      .map((item: unknown) => {
        if (typeof item === "string") return item;

        if (item && typeof item === "object" && "msg" in item) {
          return String(item.msg);
        }

        return JSON.stringify(item);
      })
      .join(", ");
  } else if (detail && typeof detail === "object") {
    const detailObject = detail as Record<string, unknown>;

    errorMessage =
      String(detailObject.message || detailObject.error || JSON.stringify(detail));
  }

  return errorMessage;
}

export default function DocumentUpload() {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [error, setError] = useState<string>("");
  const [uploading, setUploading] = useState<boolean>(false);
  const [dragging, setDragging] = useState<boolean>(false);

  const {
    currentDocument,
    setCurrentDocument,
    setLoading,
  } = useChatContext();

  const documentInfo = currentDocument as UploadedDocument | null;

  const processFile = async (file?: File) => {
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
      const result = (await uploadDocument(file)) as UploadResponse;

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

      const validDocumentId = String(documentId);
      const validFilename = String(filename);

      const uploadedDocument: UploadedDocument = {
        id: validDocumentId,
        document_id: validDocumentId,
        name: validFilename,
        filename: validFilename,
        size: file.size,
        pageCount:
          typeof pageCount === "number" ? pageCount : null,
        page_count:
          typeof pageCount === "number" ? pageCount : null,
        status: "Uploaded",
      };

      console.log("Uploaded document stored:", uploadedDocument);

      setCurrentDocument(uploadedDocument);
      setError("");
    } catch (err: unknown) {
      console.error("Document upload failed:", err);
      setError(getErrorMessage(err));
    } finally {
      setUploading(false);
      setLoading(false);
    }
  };

  const handleUpload = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    await processFile(file);

    event.target.value = "";
  };

  const handleDrop = async (
    event: DragEvent<HTMLDivElement>
  ) => {
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

  const handleDropzoneClick = (
    event: MouseEvent<HTMLDivElement>
  ) => {
    if (
      uploading ||
      (event.target instanceof HTMLElement &&
        event.target.closest("input"))
    ) {
      return;
    }

    inputRef.current?.click();
  };

  const handleDropzoneKeyDown = (
    event: KeyboardEvent<HTMLDivElement>
  ) => {
    if (
      (event.key === "Enter" || event.key === " ") &&
      !uploading
    ) {
      event.preventDefault();
      inputRef.current?.click();
    }
  };

  return (
    <div className="document-upload">
      {!documentInfo ? (
        <div
          className={`upload-dropzone ${
            dragging ? "dragging" : ""
          } ${uploading ? "uploading" : ""}`}
          onClick={handleDropzoneClick}
          onDragOver={(event) => {
            event.preventDefault();
            if (!uploading) setDragging(true);
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
            <strong title={documentInfo.name}>
              {documentInfo.name}
            </strong>

            <span>
              {documentInfo.pageCount
                ? `${documentInfo.pageCount} pages`
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
