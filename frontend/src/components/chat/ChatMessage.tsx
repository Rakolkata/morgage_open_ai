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
  Download,
} from "lucide-react";

import { useState } from "react";
import type { ReactNode } from "react";

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
// Helpers
// ------------------------------------

function parseJSON(value: unknown): any {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// Recursively render JSON as readable text
function renderReadableValue(value: any, key?: string): ReactNode {
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    if (value.length === 0) return null;

    if (
      value.every(
        (item) =>
          typeof item !== "object" || item === null
      )
    ) {
      return (
        <div key={key} className="mb-3">
          {key && (
            <p className="font-semibold mb-1">
              {formatLabel(key)}
            </p>
          )}

          <p>{value.join(", ")}</p>
        </div>
      );
    }

    return (
      <section key={key} className="mb-3">
        {key && (
          <h4 className="font-semibold mb-2">
            {formatLabel(key)}
          </h4>
        )}

        <div className="space-y-3">
          {value.map((item, index) => (
            <div key={index}>
              {renderReadableValue(item)}
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (typeof value === "object") {
    return (
      <section key={key} className="mb-3">
        {key && (
          <h4 className="font-semibold mb-2">
            {formatLabel(key)}
          </h4>
        )}

        <div className="space-y-2">
          {Object.entries(value).map(
            ([childKey, childValue]) =>
              renderReadableValue(childValue, childKey)
          )}
        </div>
      </section>
    );
  }

  return (
    <p key={key} className="mb-2 break-words">
      {key && (
        <strong>{formatLabel(key)}: </strong>
      )}

      {String(value)}
    </p>
  );
}

// ------------------------------------
// Structured Response Parser
// ------------------------------------

function getStructuredResponse(content: string) {
  const parsed = parseJSON(content);

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const parsedAnswer = parseJSON(parsed.answer);

  const output =
    parsed.agent_output ??
    parsedAnswer?.agent_output ??
    parsedAnswer?.extraction_result ??
    parsedAnswer ??
    parsed;

  if (!output || typeof output !== "object") {
    return null;
  }

  const plan =
    output.extraction_plan ??
    parsed.extraction_plan ??
    parsedAnswer?.extraction_plan ??
    (Array.isArray(output.fields_to_extract) ||
    output.task ||
    output.instructions
      ? output
      : {});

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
    Boolean(plan?.task) ||
    Array.isArray(plan?.fields_to_extract) ||
    Array.isArray(plan?.instructions);

  const hasResult =
    (normalizedResult.extracted_fields?.length ?? 0) > 0 ||
    (normalizedResult.missing_fields?.length ?? 0) > 0 ||
    (normalizedResult.warnings?.length ?? 0) > 0;

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

  const extractedFields: ExtractedField[] =
    result?.extracted_fields ?? [];

  const missingFields: string[] =
    result?.missing_fields ?? [];

  // ------------------------------------
  // Copy Message
  // ------------------------------------

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content);

      setCopied(true);

      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error("Copy failed:", error);
    }
  };

  // ------------------------------------
  // Response Metadata
  // ------------------------------------

  const model =
    metadata?.model ??
    output?.model;

  const agentName =
    message.agent ??
    metadata?.agent_name ??
    output?.agent_name ??
    "Mortgage AI";

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

  const downloadUrl =
    metadata?.download_url ??
    output?.download_url;

  const downloadFormat =
    metadata?.download_format ??
    output?.download_format ??
    "File";

  const availableDownloads =
    (metadata?.available_downloads || output?.available_downloads) as
      | Record<string, string>
      | undefined;

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
            {isUser ? "You" : agentName}
          </strong>

          {!isUser && <span>Agent Response</span>}
        </div>

        {/* MESSAGE BODY */}

        <div className="message-text">
          {structured ? (
            <div className="space-y-5 text-sm leading-6">

              {/* EXTRACTION PLAN */}

              {plan?.task && (
                <section className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText size={18} />

                    <h3 className="font-semibold text-base">
                      Extraction Plan
                    </h3>
                  </div>

                  <div className="mb-3">
                    <p className="font-semibold mb-1">
                      Task
                    </p>

                    <p>{plan.task}</p>
                  </div>

                  {Array.isArray(documentTypes) &&
                    documentTypes.length > 0 && (
                      <div className="mb-3">
                        <p className="font-semibold mb-1">
                          Document Types
                        </p>

                        <p>
                          {documentTypes.join(", ")}
                        </p>
                      </div>
                    )}

                  {schemaName && (
                    <div className="mb-3">
                      <p className="font-semibold mb-1">
                        Schema
                      </p>

                      <p>{schemaName}</p>
                    </div>
                  )}

                  {Array.isArray(plan.fields_to_extract) &&
                    plan.fields_to_extract.length > 0 && (
                      <div className="mb-3">
                        <p className="font-semibold mb-1">
                          Fields to Extract
                        </p>

                        <p>
                          {plan.fields_to_extract.join(", ")}
                        </p>
                      </div>
                    )}

                  {Array.isArray(plan.instructions) &&
                    plan.instructions.length > 0 && (
                      <div className="mt-3">
                        <p className="font-semibold mb-2">
                          Instructions
                        </p>

                        <div className="space-y-2">
                          {plan.instructions.map(
                            (
                              instruction: string,
                              index: number
                            ) => (
                              <p key={index}>
                                {instruction}
                              </p>
                            )
                          )}
                        </div>
                      </div>
                    )}
                </section>
              )}

              {/* EXTRACTED VALUES */}

              {extractedFields.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <TableIcon size={18} />

                    <h3 className="font-semibold text-base">
                      Actual Extracted Mortgage Values
                    </h3>
                  </div>

                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b bg-gray-100 dark:bg-gray-800">
                          <th className="p-3">Field</th>
                          <th className="p-3">Value</th>
                          <th className="p-3">Status</th>
                        </tr>
                      </thead>

                      <tbody>
                        {extractedFields.map(
                          (field, index) => {
                            const hasValue =
                              field.value !== null &&
                              field.value !== undefined &&
                              String(field.value).trim() !== "" &&
                              String(field.value).toLowerCase() !==
                                "not supplied";

                            return (
                              <tr
                                key={`${field.field_path}-${index}`}
                                className="border-b last:border-b-0 align-top"
                              >
                                <td className="p-3 font-medium">
                                  {field.field_path}
                                </td>

                                <td className="p-3 break-words">
                                  {field.value ?? "—"}
                                </td>

                                <td className="p-3">
                                  {hasValue ? (
                                    <span className="text-green-600 font-medium">
                                      Extracted
                                    </span>
                                  ) : (
                                    <span className="text-red-500 font-medium">
                                      Missing
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          }
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* SOURCE EVIDENCE */}

              {extractedFields.some(
                (field) => field.source_text
              ) && (
                <section>
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
                          <th className="p-3">Field</th>
                          <th className="p-3">Source Text</th>
                          <th className="p-3">Page</th>
                          <th className="p-3">Confidence</th>
                        </tr>
                      </thead>

                      <tbody>
                        {extractedFields
                          .filter(
                            (field) => field.source_text
                          )
                          .map((field, index) => (
                            <tr
                              key={index}
                              className="border-b last:border-b-0 align-top"
                            >
                              <td className="p-3 font-medium">
                                {field.field_path}
                              </td>

                              <td className="p-3 break-words">
                                {field.source_text}
                              </td>

                              <td className="p-3">
                                {field.page ?? "—"}
                              </td>

                              <td className="p-3">
                                {typeof field.confidence === "number"
                                  ? `${(
                                      field.confidence * 100
                                    ).toFixed(0)}%`
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {/* MISSING FIELDS */}

              {missingFields.length > 0 && (
                <section className="rounded-lg border p-3">
                  <h3 className="font-semibold mb-2">
                    Missing Fields
                  </h3>

                  <ul className="list-disc pl-5 space-y-1">
                    {missingFields.map(
                      (field: string, index: number) => (
                        <li key={index}>{field}</li>
                      )
                    )}
                  </ul>
                </section>
              )}

              {/* WARNINGS */}

              {result?.warnings &&
                result.warnings.length > 0 && (
                  <section className="rounded-lg border border-amber-300 p-3">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertTriangle size={17} />

                      <h3 className="font-semibold text-base">
                        Warnings
                      </h3>
                    </div>

                    <ul className="list-disc pl-5 space-y-1">
                      {result.warnings.map(
                        (
                          warning: string,
                          index: number
                        ) => (
                          <li key={index}>
                            {warning}
                          </li>
                        )
                      )}
                    </ul>
                  </section>
                )}

              {/* DOWNLOAD SECTION */}
              {(downloadUrl || availableDownloads) && (
                <section className="rounded-lg border border-blue-200 bg-blue-50/60 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Download size={18} className="text-blue-600" />
                    <h3 className="font-semibold text-base text-blue-900">
                      Download Audited Data
                    </h3>
                  </div>
                  <p className="text-xs text-blue-800 mb-3">
                    Verified and audited data export ready for download:
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {downloadUrl && (
                      <a
                        href={downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition"
                      >
                        <Download size={13} />
                        Download {String(downloadFormat).toUpperCase()}
                      </a>
                    )}
                    {availableDownloads &&
                      Object.entries(availableDownloads).map(
                        ([formatKey, urlStr]) =>
                          urlStr !== downloadUrl && (
                            <a
                              key={formatKey}
                              href={String(urlStr)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white border border-blue-300 text-blue-900 text-xs font-medium hover:bg-blue-50 transition"
                            >
                              <Download size={13} />
                              {formatKey.toUpperCase()}
                            </a>
                          )
                      )}
                  </div>
                </section>
              )}

              {/* RESPONSE DETAILS */}

              {(model || fileName || status || documentId) && (
                <section className="border-t pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText size={18} />

                    <h3 className="font-semibold text-base">
                      Response Details
                    </h3>
                  </div>

                  <div className="space-y-2">
                    {model && (
                      <p className="break-words">
                        <strong>Model:</strong> {model}
                      </p>
                    )}

                    {fileName && (
                      <p className="break-words">
                        <strong>File:</strong> {fileName}
                      </p>
                    )}

                    {status && (
                      <p>
                        <strong>Status:</strong> {status}
                      </p>
                    )}

                    {documentId && (
                      <p className="break-all">
                        <strong>Document ID:</strong> {documentId}
                      </p>
                    )}
                  </div>
                </section>
              )}

            </div>
          ) : (
            /* READABLE FALLBACK FOR OTHER RESPONSES */

            <div className="whitespace-pre-wrap break-words text-sm leading-6">
              {(() => {
                const parsedFallback = parseJSON(message.content);

                if (
                  parsedFallback &&
                  typeof parsedFallback === "object"
                ) {
                  const nestedAnswer = parseJSON(
                    parsedFallback.answer
                  );

                  const dlUrl =
                    parsedFallback.download_url ||
                    nestedAnswer?.download_url;

                  const dlFormat =
                    parsedFallback.download_format ||
                    nestedAnswer?.download_format ||
                    "File";

                  const availDls =
                    parsedFallback.available_downloads ||
                    nestedAnswer?.available_downloads;

                  const readableData =
                    nestedAnswer ?? parsedFallback;

                  return (
                    <div className="space-y-3">
                      {(dlUrl || availDls) && (
                        <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-4 mb-2">
                          <div className="flex items-center gap-2 mb-2">
                            <Download size={18} className="text-blue-600" />
                            <h4 className="font-semibold text-blue-900 text-sm">
                              Download Audited Data
                            </h4>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {dlUrl && (
                              <a
                                href={dlUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition"
                              >
                                <Download size={13} />
                                Download {String(dlFormat).toUpperCase()}
                              </a>
                            )}
                            {availDls &&
                              typeof availDls === "object" &&
                              Object.entries(availDls).map(
                                ([fmtKey, uStr]) =>
                                  uStr !== dlUrl && (
                                    <a
                                      key={fmtKey}
                                      href={String(uStr)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white border border-blue-300 text-blue-900 text-xs font-medium hover:bg-blue-50 transition"
                                    >
                                      <Download size={13} />
                                      {fmtKey.toUpperCase()}
                                    </a>
                                  )
                              )}
                          </div>
                        </div>
                      )}

                      {renderReadableValue(readableData)}

                      {parsedFallback.model && (
                        <p>
                          <strong>Model:</strong>{" "}
                          {parsedFallback.model}
                        </p>
                      )}

                      {parsedFallback.agent_name && (
                        <p>
                          <strong>Agent:</strong>{" "}
                          {parsedFallback.agent_name}
                        </p>
                      )}

                      {(parsedFallback.file_name ||
                        parsedFallback.filename) && (
                        <p>
                          <strong>File:</strong>{" "}
                          {parsedFallback.file_name ??
                            parsedFallback.filename}
                        </p>
                      )}

                      {parsedFallback.status && (
                        <p>
                          <strong>Status:</strong>{" "}
                          {parsedFallback.status}
                        </p>
                      )}
                    </div>
                  );
                }

                return message.content;
              })()}
            </div>
          )}
        </div>

        {/* MESSAGE ACTIONS */}

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