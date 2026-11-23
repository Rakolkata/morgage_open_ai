
"use client";

import {
  User,
  Bot,
  Copy,
  FileSearch,
  Check,
} from "lucide-react";

import { useState } from "react";

interface MessageData {
  role: "user" | "assistant" | string;
  content: string;
  agent?: string;
  evidence?: unknown;
}

interface ChatMessageProps {
  message: MessageData;
}

function parseJSON(value: unknown): any {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getStructuredResponse(content: string) {
  const parsed = parseJSON(content);

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  // Handle nested agent output
  const output =
    parsed.agent_output ??
    parseJSON(parsed.answer) ??
    parsed;

  if (
    !output ||
    typeof output !== "object" ||
    (!output.task &&
      !output.fields_to_extract &&
      !output.instructions)
  ) {
    return null;
  }

  return {
    data: output,
    metadata: parsed,
  };
}

export default function ChatMessage({
  message,
}: ChatMessageProps) {
  const [copied, setCopied] = useState<boolean>(false);

  const isUser = message.role === "user";

  const structured = !isUser
    ? getStructuredResponse(message.content)
    : null;

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content);

      setCopied(true);

      setTimeout(() => setCopied(false), 1500);
    } catch (error: unknown) {
      console.error("Copy failed:", error);
    }
  };

  const data = structured?.data;
  const metadata = structured?.metadata;

  return (
    <div className={`chat-message ${isUser ? "user" : "assistant"}`}>
      <div className="message-avatar">
        {isUser ? <User size={18} /> : <Bot size={19} />}
      </div>

      <div className="message-content">
        <div className="message-header">
          <strong>
            {isUser
              ? "You"
              : message.agent ||
                metadata?.agent_name ||
                "Mortgage AI"}
          </strong>

          {!isUser && (
            <span>
              {message.agent ||
              metadata?.agent_name
                ? "Agent Response"
                : "AI Assistant"}
            </span>
          )}
        </div>

        <div className="message-text">
          {structured ? (
            <div className="space-y-5 text-sm leading-6">
              {/* Task */}
              {data.task && (
                <section>
                  <h3 className="font-semibold text-base mb-2">
                    Task
                  </h3>

                  <p>{data.task}</p>
                </section>
              )}

              {/* Document Types */}
              {Array.isArray(data.document_types) &&
                data.document_types.length > 0 && (
                  <section>
                    <h3 className="font-semibold mb-2">
                      Document Type
                    </h3>

                    <div className="flex flex-wrap gap-2">
                      {data.document_types.map(
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
                  </section>
                )}

              {/* Schema */}
              {data.schema_name && (
                <section>
                  <h3 className="font-semibold mb-2">
                    Schema
                  </h3>

                  <p>{data.schema_name}</p>
                </section>
              )}

              {/* Fields */}
              {Array.isArray(data.fields_to_extract) &&
                data.fields_to_extract.length > 0 && (
                  <section>
                    <h3 className="font-semibold text-base mb-2">
                      Fields to Extract
                    </h3>

                    <ul className="list-disc pl-5 space-y-1">
                      {data.fields_to_extract.map(
                        (field: string, index: number) => (
                          <li key={index}>
                            {field}
                          </li>
                        )
                      )}
                    </ul>
                  </section>
                )}

              {/* Instructions */}
              {Array.isArray(data.instructions) &&
                data.instructions.length > 0 && (
                  <section>
                    <h3 className="font-semibold text-base mb-2">
                      Extraction Instructions
                    </h3>

                    <ol className="list-decimal pl-5 space-y-2">
                      {data.instructions.map(
                        (instruction: string, index: number) => (
                          <li key={index}>
                            {instruction}
                          </li>
                        )
                      )}
                    </ol>
                  </section>
                )}

              {/* Additional readable data */}
              {data.additional_information && (
                <section>
                  <h3 className="font-semibold mb-2">
                    Additional Information
                  </h3>

                  <p>
                    {String(data.additional_information)}
                  </p>
                </section>
              )}

              {/* Metadata */}
              {(metadata?.model ||
                metadata?.file_name ||
                metadata?.status) && (
                <section className="border-t pt-4">
                  <h3 className="font-semibold mb-3">
                    Response Details
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {metadata.model && (
                      <div>
                        <span className="font-medium">
                          Model
                        </span>

                        <p className="opacity-70">
                          {metadata.model}
                        </p>
                      </div>
                    )}

                    {metadata.file_name && (
                      <div>
                        <span className="font-medium">
                          File
                        </span>

                        <p className="opacity-70 break-words">
                          {metadata.file_name}
                        </p>
                      </div>
                    )}

                    {metadata.status && (
                      <div>
                        <span className="font-medium">
                          Status
                        </span>

                        <p className="opacity-70">
                          {metadata.status}
                        </p>
                      </div>
                    )}

                    {metadata.document_id && (
                      <div>
                        <span className="font-medium">
                          Document ID
                        </span>

                        <p className="opacity-70 break-all">
                          {metadata.document_id}
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
