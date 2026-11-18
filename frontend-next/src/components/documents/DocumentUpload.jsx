
"use client";

import { useRef, useState } from "react";
import { Upload, FileText, X, LoaderCircle } from "lucide-react";
import { useChatContext } from "../../context/ChatContext";
import { uploadDocument } from "../../services/documentService";

export default function DocumentUpload() {
  const inputRef = useRef(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const {
    currentDocument,
    setCurrentDocument,
    setLoading,
  } = useChatContext();

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setError("Please select a valid PDF document.");
      event.target.value = "";
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setError("PDF size must be less than 25 MB.");
      event.target.value = "";
      return;
    }

    setError("");
    setUploading(true);
    setLoading(true);

    try {
      const result = await uploadDocument(file);

      setCurrentDocument({
        id: result.document_id,
        name: result.filename || file.name,
        size: file.size,
        pageCount: result.page_count,
        status: "Uploaded",
      });

      console.log("Document uploaded successfully:", result);

    } catch (err) {
      console.error("Document upload failed:", err);

      const detail = err.response?.data?.detail;

      let errorMessage =
        "Unable to upload document. Please check your backend.";

      if (typeof detail === "string") {
        errorMessage = detail;
      } else if (Array.isArray(detail)) {
        errorMessage = detail
          .map((item) => {
            if (typeof item === "string") return item;
            return item.msg || JSON.stringify(item);
          })
          .join(", ");
      } else if (detail && typeof detail === "object") {
        errorMessage =
          detail.message ||
          detail.error ||
          JSON.stringify(detail);
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);

    } finally {
      setUploading(false);
      setLoading(false);

      if (event.target) {
        event.target.value = "";
      }
    }
  };

  const removeDocument = () => {
    setCurrentDocument(null);
    setError("");
  };

  return (
    <div className="document-upload">
      {!currentDocument ? (
        <div
          className="upload-dropzone"
          onClick={() => !uploading && inputRef.current?.click()}
        >
          {uploading ? (
            <LoaderCircle
              className="upload-spinner"
              size={28}
            />
          ) : (
            <Upload size={28} />
          )}

          <strong>
            {uploading ? "Uploading PDF..." : "Upload Mortgage PDF"}
          </strong>

          <span>
            Click to select a PDF document
          </span>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={handleUpload}
            disabled={uploading}
          />
        </div>
      ) : (
        <div className="uploaded-document">
          <FileText size={22} />

          <div className="uploaded-document-info">
            <strong>{currentDocument.name}</strong>
            <span>
              {currentDocument.pageCount
                ? `${currentDocument.pageCount} pages uploaded`
                : "Document uploaded"}
            </span>
          </div>

          <button
            type="button"
            onClick={removeDocument}
            aria-label="Remove document"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {error && (
        <p className="upload-error">
          {error}
        </p>
      )}
    </div>
  );
}
