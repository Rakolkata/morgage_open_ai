export interface UploadDocumentResponse {
  document_id: string;
  id: string;
  filename: string;
  storage_path?: string;
  instruction?: string;
  page_count?: number;
  file_size?: number;
  message?: string;
  document?: {
    id: string;
    filename: string;
    storage_path: string;
    instruction?: string;
    page_count?: number;
    file_size?: number;
    created_at?: string;
  };
  [key: string]: unknown;
}

interface ServerUploadResponse {
  success: boolean;
  message: string;
  document_id?: string;
  id?: string;
  filename?: string;
  storage_path?: string;
  instruction?: string;
  page_count?: number;
  file_size?: number;
  document?: {
    id: string;
    filename: string;
    storage_path: string;
    instruction?: string;
    page_count?: number;
    file_size?: number;
    created_at?: string;
  };
  error?: string;
}

export async function uploadDocument(
  file: File,
  instruction?: string
): Promise<UploadDocumentResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (instruction && instruction.trim()) {
    formData.append("instruction", instruction.trim());
  }

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
      // Keep default error message
    }

    throw new Error(errorMessage);
  }

  const result: ServerUploadResponse = await response.json();

  if (!result.success) {
    throw new Error(result.error || "Invalid upload response from server.");
  }

  const doc = result.document;
  const docId = result.document_id || result.id || doc?.id || "";
  const filename = result.filename || doc?.filename || file.name;
  const storagePath = result.storage_path || doc?.storage_path || "";
  const savedInstruction = result.instruction || doc?.instruction || instruction || "";
  const pageCount = result.page_count ?? doc?.page_count;

  return {
    id: docId,
    document_id: docId,
    filename,
    storage_path: storagePath,
    instruction: savedInstruction,
    page_count: pageCount,
    message: result.message,
    document: result.document,
  };
}

export async function getUploadedDocuments() {
  const response = await fetch("/api/upload", { method: "GET" });
  if (!response.ok) {
    throw new Error("Failed to fetch documents");
  }
  return response.json();
}
