export interface UploadDocumentResponse {
  document_id: string;
  id: string;
  filename: string;
  page_count?: number;
  message?: string;
  [key: string]: unknown;
}

interface MulterUploadResponse {
  success: boolean;
  message: string;
  document: {
    id: string;
    original_filename: string;
    stored_filename: string;
    storage_path: string;
    mime_type: string;
    file_size: number;
    uploaded_at: string;
  };
}

export async function uploadDocument(
  file: File
): Promise<UploadDocumentResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let errorMessage = `Upload failed with status ${response.status}`;

    try {
      const errorData = await response.json();
      errorMessage = errorData.error || errorData.message || errorMessage;
    } catch {
      // Keep the default error message.
    }

    throw new Error(errorMessage);
  }

  const result: MulterUploadResponse = await response.json();

  if (!result.success || !result.document) {
    throw new Error("Invalid upload response from server.");
  }

  return {
    id: result.document.id,
    document_id: result.document.id,
    filename: result.document.original_filename,
    message: result.message,
  };
}