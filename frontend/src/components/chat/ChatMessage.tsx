
"use client";

import {
  User,
  Bot,
  Copy,
  FileSearch,
  Check,
  AlertTriangle,
  FileText,
  Table as TableIcon,
} from "lucide-react";

import { useState } from "react";

// ------------------------------------
// Types
// ------------------------------------

interface ExtractedField {
  field_path: string;
  value: string | number | null;
  document_type?: string;
  page?: number | null;
  source_text?: string;
  confidence?: number;
}

interface ExtractionResult {
  extracted_fields?: ExtractedField[];
  missing_fields?: string[];
  warnings?: string[];
  workflow_steps?: unknown[];
}

interface ChatMessageProps {
  message: {
    role: "user" | "assistant" | "system" | string;
    content: string;
    agent?: string;
    evidence?: unknown;
  };
}

// ------------------------------------
// Default Mortgage Fields
// ------------------------------------

const DEFAULT_MORTGAGE_FIELDS = [
  "Borrower Full Name",
  "Property Address",
  "Base Loan Amount",
  "Note Interest Rate",
  "Monthly Principal and Interest Payment",
  "Loan Term / Amortization",
  "Lender Name",
];

// ------------------------------------
// Helpers
// ------------------------------------

function parseJSON(value: unknown): any {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalized(value: string) {
  return value.trim().toLowerCase();
}

function getStructuredResponse(content: string) {
  const parsed = parseJSON(content);

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const parsedAnswer = parseJSON(parsed.answer);

  const output =
    parsed.agent_output ??
    parsedAnswer?.agent_output ??
    parsedAnswer ??
    parsed;

  if (!output || typeof output !== "object") {
    return null;
  }

  const plan =
    output.extraction_plan ??
    parsed.extraction_plan ??
    parsedAnswer?.extraction_plan ??
    {};

  const result =
    output.extraction_result ??
    output.extraction_data ??
    output.result ??
    parsed.extraction_result ??
    parsedAnswer?.extraction_result ??
    output;

  const extractedFields =
    result?.extracted_fields ??
    output?.extracted_fields ??
    parsed?.extracted_fields ??
    parsedAnswer?.extracted_fields ??
    [];

  const missingFields =
    result?.missing_fields ??
    output?.missing_fields ??
    parsed?.missing_fields ??
    parsedAnswer?.missing_fields ??
    [];

  const warnings =
    result?.warnings ??
    output?.warnings ??
    parsed?.warnings ??
    parsedAnswer?.warnings ??
    [];

  const normalizedResult: ExtractionResult = {
    ...result,
    extracted_fields: Array.isArray(extractedFields)
      ? extractedFields
      : [],
    missing_fields: Array.isArray(missingFields)
      ? missingFields
      : [],
    warnings: Array.isArray(warnings)
      ? warnings
      : [],
  };

  const hasPlan =
    Array.isArray(plan?.fields_to_extract) ||
    Boolean(plan?.task) ||
    Boolean(plan?.instructions);

  const hasResult =
    Array.isArray(normalizedResult.extracted_fields) ||
    Array.isArray(normalizedResult.missing_fields) ||
    Array.isArray(normalizedResult.warnings);

  if (!hasPlan && !hasResult) {
    return null;
  }

  return {
    plan,
    result: normalizedResult,
    metadata: parsed,
    output,
  };
}

// ------------------------------------
// Component
// ------------------------------------

export default function ChatMessage({
  message,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);

  const isUser = message.role === "user";

  const structured = !isUser
    ? getStructuredResponse(message.content)
    : null;

  const plan = structured?.plan;
  const result = structured?.result;
  const metadata = structured?.metadata;
  const output = structured?.output;

  // ------------------------------------
  // Build complete field list
  // ------------------------------------

  const requestedFields: string[] = Array.isArray(
    plan?.fields_to_extract
  )
    ? plan.fields_to_extract
    : [];

  const extractedFields: ExtractedField[] =
    result?.extracted_fields ?? [];

  const missingFields: string[] =
    result?.missing_fields ?? [];

  const allFieldNames = [
    ...requestedFields,
    ...extractedFields.map(
      (field: ExtractedField) => field.field_path
    ),
    ...missingFields,
  ];

  const tableFields = allFieldNames.length
    ? allFieldNames.filter(
        (field, index, arr) =>
          arr.findIndex(
            (item) =>
              normalized(item) === normalized(field)
          ) === index
      )
    : DEFAULT_MORTGAGE_FIELDS;

  // ------------------------------------
  // Build table rows
  // ------------------------------------

  const rows = tableFields.map((fieldName) => {
    const extracted = extractedFields.find(
      (field: ExtractedField) =>
        normalized(field.field_path) ===
          normalized(fieldName) &&
        field.value !== null &&
        field.value !== undefined &&
        String(field.value).trim() !== ""
    );

    const isMissing = missingFields.some(
      (field: string) =>
        normalized(field) === normalized(fieldName)
    );

    return {
      fieldName,
      value: extracted?.value ?? "—",
      documentType: extracted?.document_type ?? "—",
      page: extracted?.page ?? "—",
      confidence:
        typeof extracted?.confidence === "number"
          ? `${(extracted.confidence * 100).toFixed(0)}%`
          : "—",
      sourceText: extracted?.source_text,
      status: extracted ? "Extracted" : "Missing",
    };
  });

  // ------------------------------------
  // Copy message
  // ------------------------------------

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content);

      setCopied(true);

      setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };

  // ------------------------------------
  // Metadata helpers
  // ------------------------------------

  const model =
    metadata?.model ??
    output?.model;

  const fileName =
    metadata?.file_name ??
    metadata?.filename ??
    metadata?.file ??
    output?.file_name ??
    output?.filename;

  const status =
    metadata?.status ??
    output?.status;

  const documentId =
    metadata?.document_id ??
    output?.document_id;

  const documentTypes =
    plan?.document_types ??
    output?.document_types ??
    [];

  const schemaName =
    plan?.schema_name ??
    plan?.schema ??
    output?.schema_name;

  // ------------------------------------
  // Render
  // ------------------------------------

  return (
    <div
      className={`chat-message ${
        isUser ? "user" : "assistant"
      }`}
    >
      <div className="message-avatar">
        {isUser ? <User size={18} /> : <Bot size={19} />}
      </div>

      <div className="message-content">
        {/* HEADER */}

        <div className="message-header">
          <strong>
            {isUser
              ? "You"
              : message.agent ||
                metadata?.agent_name ||
                "Mortgage AI"}
          </strong>

          {!isUser && <span>Agent Response</span>}
        </div>

        {/* MESSAGE BODY */}

        <div className="message-text">
          {structured ? (
            <div className="space-y-6 text-sm leading-6">

              {/* -------------------------------- */}
              {/* EXTRACTION PLAN */}
              {/* -------------------------------- */}

              <section>
                <div className="flex items-center gap-2 mb-3">
                  <FileText size={18} />

                  <h3 className="font-semibold text-base">
                    Extraction Plan
                  </h3>
                </div>

                {plan?.task && (
                  <div className="mb-3">
                    <h4 className="font-semibold mb-1">
                      Task
                    </h4>

                    <p>{plan.task}</p>
                  </div>
                )}

                {Array.isArray(documentTypes) &&
                  documentTypes.length > 0 && (
                    <div className="mb-3">
                      <h4 className="font-semibold mb-2">
                        Document Types
                      </h4>

                      <div className="flex flex-wrap gap-2">
                        {documentTypes.map(
                          (type: string, index: number) => (
                            <span
                              key={index}
                              className="px-3 py-1 rounded-full border text-xs"
                            >
                              {type}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  )}

                {schemaName && (
                  <div className="mb-3">
                    <h4 className="font-semibold">
                      Schema
                    </h4>

                    <p>{schemaName}</p>
                  </div>
                )}
              </section>

              {/* -------------------------------- */}
              {/* EXTRACTED MORTGAGE FIELDS */}
              {/* -------------------------------- */}

              <section className="border-t pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <TableIcon size={18} />

                  <h3 className="font-semibold text-base">
                    Extracted Mortgage Fields
                  </h3>
                </div>

                {rows.length > 0 ? (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b bg-gray-100 dark:bg-gray-800">
                          <th className="p-3">
                            Field
                          </th>

                          <th className="p-3">
                            Details
                          </th>

                          <th className="p-3">
                            Status
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {rows.map((row, index) => (
                          <tr
                            key={`${row.fieldName}-${index}`}
                            className="border-b last:border-b-0 align-top"
                          >
                            <td className="p-3 font-medium">
                              {row.fieldName}
                            </td>

                            <td className="p-3 break-words">
                              {row.value}
                            </td>

                            <td className="p-3">
                              <span
                                className={
                                  row.status === "Extracted"
                                    ? "text-green-600 font-medium"
                                    : "text-red-500 font-medium"
                                }
                              >
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="opacity-70">
                    No extraction fields available.
                  </p>
                )}
              </section>

              {/* -------------------------------- */}
              {/* SOURCE EVIDENCE */}
              {/* -------------------------------- */}

              {rows.some((row) => row.sourceText) && (
                <section className="border-t pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FileSearch size={18} />

                    <h3 className="font-semibold text-base">
                      Source Evidence
                    </h3>
                  </div>

                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b bg-gray-100 dark:bg-gray-800">
                          <th className="p-3">
                            Field
                          </th>

                          <th className="p-3">
                            Source Evidence
                          </th>

                          <th className="p-3">
                            Page
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {rows
                          .filter((row) => row.sourceText)
                          .map((row, index) => (
                            <tr
                              key={index}
                              className="border-b last:border-b-0 align-top"
                            >
                              <td className="p-3 font-medium">
                                {row.fieldName}
                              </td>

                              <td className="p-3 break-words">
                                {row.sourceText}
                              </td>

                              <td className="p-3">
                                {row.page}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* -------------------------------- */}
              {/* WARNINGS */}
              {/* -------------------------------- */}

              {Array.isArray(result?.warnings) &&
                result.warnings.length > 0 && (
                  <section className="border-t pt-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle size={17} />

                      <h3 className="font-semibold text-base">
                        Warnings
                      </h3>
                    </div>

                    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3">
                      <ul className="list-disc pl-5 space-y-1">
                        {result.warnings.map(
                          (warning: string, index: number) => (
                            <li key={index}>
                              {warning}
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  </section>
                )}

              {/* -------------------------------- */}
              {/* RESPONSE DETAILS */}
              {/* -------------------------------- */}

              {(model ||
                fileName ||
                status ||
                documentId) && (
                <section className="border-t pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText size={18} />

                    <h3 className="font-semibold text-base">
                      Response Details
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {model && (
                      <div className="rounded-lg border p-3">
                        <span className="font-medium">
                          Model
                        </span>

                        <p className="opacity-70 break-words">
                          {model}
                        </p>
                      </div>
                    )}

                    {fileName && (
                      <div className="rounded-lg border p-3">
                        <span className="font-medium">
                          File
                        </span>

                        <p className="opacity-70 break-words">
                          {fileName}
                        </p>
                      </div>
                    )}

                    {status && (
                      <div className="rounded-lg border p-3">
                        <span className="font-medium">
                          Status
                        </span>

                        <p className="opacity-70">
                          {status}
                        </p>
                      </div>
                    )}

                    {documentId && (
                      <div className="rounded-lg border p-3">
                        <span className="font-medium">
                          Document ID
                        </span>

                        <p className="opacity-70 break-all">
                          {documentId}
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="whitespace-pre-wrap break-words text-sm leading-6">
              {message.content}
            </div>
          )}
        </div>

        {/* -------------------------------- */}
        {/* MESSAGE ACTIONS */}
        {/* -------------------------------- */}

        {!isUser && (
          <div className="message-actions">
            <button onClick={copyMessage}>
              {copied ? (
                <Check size={14} />
              ) : (
                <Copy size={14} />
              )}

              {copied ? "Copied" : "Copy"}
            </button>

            {Boolean(message.evidence) && (
              <button>
                <FileSearch size={14} />

                View evidence
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
