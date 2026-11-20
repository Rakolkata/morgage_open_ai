import { NextRequest, NextResponse } from "next/server";
import pool from "../../../../lib/db";
import { randomUUID } from "crypto";
import type { PoolClient } from "pg";

export const runtime = "nodejs";

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

function findColumn(
  columns: ColumnInfo[],
  candidates: string[]
) {
  return columns.find((column) =>
    candidates.includes(column.column_name)
  );
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

// Rule-based chatbot response
function generateResponse(
  message: string,
  filename: string
): string {
  const text = message.toLowerCase().trim();

  if (/^(hi|hello|hey|good morning|good afternoon)\b/.test(text)) {
    return `Hello! Welcome to the Mortgage Post-Closing Audit Assistant. Your document "${filename}" is selected. How can I help you today?`;
  }

  if (
    text.includes("help") ||
    text.includes("what can you do") ||
    text.includes("how can you help")
  ) {
    return [
      "I am your Mortgage Post-Closing Audit Assistant.",
      "",
      "I can help you with:",
      "",
      "- Mortgage document audit workflow",
      "- Loan document verification",
      "- Post-closing audit checklist",
      "- Missing document identification",
      "- Loan file review guidance",
      "- Understanding mortgage audit requirements",
      "- General mortgage-related questions",
      "",
      `Currently selected document: ${filename}`,
      "",
      "Please ask me a question to continue.",
    ].join("\n");
  }

  if (
    text.includes("document") &&
    (text.includes("upload") || text.includes("uploaded"))
  ) {
    return [
      "Your document upload workflow is handled by the document upload API.",
      "",
      `Selected document: ${filename}`,
      "",
      "The document is stored locally and its metadata is saved in PostgreSQL.",
    ].join("\n");
  }

  if (
    text.includes("audit checklist") ||
    text.includes("checklist")
  ) {
    return [
      "A typical post-closing mortgage audit checklist includes:",
      "",
      "1. Verify borrower information.",
      "2. Verify loan amount and loan details.",
      "3. Review closing documents.",
      "4. Check signatures and initials.",
      "5. Review dates and document completeness.",
      "6. Verify required disclosures.",
      "7. Identify missing or inconsistent documents.",
      "8. Record audit findings.",
      "",
      "This is a general checklist and is not an actual audit result for the uploaded PDF.",
    ].join("\n");
  }

  if (
    text.includes("borrower") ||
    text.includes("loan amount") ||
    text.includes("loan number") ||
    text.includes("interest rate")
  ) {
    return [
      "I can help you understand what to verify in your mortgage file.",
      "",
      `Selected document: ${filename}`,
      "",
      "However, this version of the chatbot uses predefined rule-based responses. It does not extract or verify actual borrower or loan information from the PDF.",
      "",
      "Please verify borrower details, loan number, loan amount and interest rate against the original document.",
    ].join("\n");
  }

  if (
    text.includes("missing") ||
    text.includes("incomplete")
  ) {
    return [
      "For a post-closing audit, missing-document verification generally involves:",
      "",
      "- Checking the required document checklist.",
      "- Confirming that each required document is present.",
      "- Verifying signatures and dates.",
      "- Checking document consistency.",
      "- Recording missing or incomplete items.",
      "",
      "This version does not automatically detect missing documents in your PDF.",
    ].join("\n");
  }

  if (
    text.includes("mortgage") ||
    text.includes("post closing") ||
    text.includes("post-closing") ||
    text.includes("audit")
  ) {
    return [
      "Mortgage Post-Closing Audit Assistant",
      "",
      "Post-closing auditing is the process of reviewing mortgage loan documents after closing to identify missing documents, inconsistencies, errors and compliance-related issues.",
      "",
      "Typical review areas include:",
      "",
      "- Borrower information",
      "- Loan information",
      "- Closing documentation",
      "- Signature verification",
      "- Required disclosures",
      "- Document completeness",
      "- Date consistency",
      "",
      `Selected document: ${filename}`,
      "",
      "This chatbot currently uses predefined rule-based responses rather than AI document analysis.",
    ].join("\n");
  }

  return [
    "I am your Mortgage Post-Closing Audit Assistant.",
    "",
    `Selected document: ${filename}`,
    "",
    "I can help with general mortgage audit guidance, document checklists and post-closing audit workflows.",
    "",
    "This version uses predefined rules. It does not analyze the actual contents of the PDF.",
    "",
    "Try asking about:",
    "- Mortgage audit checklist",
    "- Missing documents",
    "- Post-closing audit process",
    "- Loan document verification",
  ].join("\n");
}

export async function POST(request: NextRequest) {
  let client: PoolClient | null = null;

  try {
    const body = await request.json();

    const documentId = body.document_id;
    const conversationId = body.conversation_id;

    const message =
      typeof body.message === "string"
        ? body.message.trim()
        : "";

    if (!documentId || !message) {
      return NextResponse.json(
        {
          success: false,
          error: "Document ID and message are required.",
        },
        { status: 400 }
      );
    }

    client = await pool.connect();

    await client.query("BEGIN");

    // 1. Find the uploaded document
    const documentResult = await client.query(
      `SELECT *
       FROM uploaded_documents
       WHERE id = $1
       LIMIT 1`,
      [documentId]
    );

    if (documentResult.rows.length === 0) {
      throw new Error("Uploaded document not found.");
    }

    const document = documentResult.rows[0];

    const filename =
      document.original_filename || "Uploaded document";

    // 2. Inspect chat_sessions table
    const sessionColumnsResult =
      await client.query<ColumnInfo>(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_name = 'chat_sessions'
         ORDER BY ordinal_position`
      );

    const sessionColumns =
      sessionColumnsResult.rows;

    // 3. Inspect chat_history table
    const historyColumnsResult =
      await client.query<ColumnInfo>(
        `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
         WHERE table_name = 'chat_history'
         ORDER BY ordinal_position`
      );

    const historyColumns =
      historyColumnsResult.rows;

    // 4. Identify required columns
    const sessionIdColumn = findColumn(
      sessionColumns,
      ["id", "session_id"]
    );

    const sessionDocumentColumn = findColumn(
      sessionColumns,
      ["document_id", "doc_id", "uploaded_document_id"]
    );

    const historySessionColumn = findColumn(
      historyColumns,
      ["session_id", "chat_session_id"]
    );

    const roleColumn = findColumn(
      historyColumns,
      ["role", "sender", "message_role"]
    );

    const contentColumn = findColumn(
      historyColumns,
      ["content", "message", "message_content", "text"]
    );

    if (
      !sessionIdColumn ||
      !sessionDocumentColumn ||
      !historySessionColumn ||
      !roleColumn ||
      !contentColumn
    ) {
      throw new Error(
        "Required chat database columns were not found."
      );
    }

    // 5. Create or reuse conversation
    let activeConversationId = conversationId;

    if (activeConversationId) {
      const existingSession = await client.query(
        `SELECT *
         FROM chat_sessions
         WHERE ${quoteIdentifier(sessionIdColumn.column_name)} = $1
         LIMIT 1`,
        [activeConversationId]
      );

      if (existingSession.rows.length === 0) {
        throw new Error("Chat session not found.");
      }

      const existingDocumentId =
        existingSession.rows[0][
          sessionDocumentColumn.column_name
        ];

      if (
        String(existingDocumentId) !==
        String(documentId)
      ) {
        throw new Error(
          "This chat session belongs to a different document."
        );
      }
    } else {
      activeConversationId = randomUUID();

      const insertColumns: string[] = [];
      const insertValues: unknown[] = [];

      insertColumns.push(
        sessionIdColumn.column_name
      );

      insertValues.push(activeConversationId);

      insertColumns.push(
        sessionDocumentColumn.column_name
      );

      insertValues.push(documentId);

      const titleColumn = findColumn(
        sessionColumns,
        ["title", "session_title", "name"]
      );

      if (titleColumn) {
        insertColumns.push(
          titleColumn.column_name
        );

        insertValues.push(message.slice(0, 100));
      }

      const createdColumn = findColumn(
        sessionColumns,
        ["created_at", "created_on"]
      );

      if (createdColumn) {
        insertColumns.push(
          createdColumn.column_name
        );

        insertValues.push(new Date());
      }

      const placeholders = insertValues
        .map((_, index) => `$${index + 1}`)
        .join(", ");

      const columnsSQL = insertColumns
        .map(quoteIdentifier)
        .join(", ");

      await client.query(
        `INSERT INTO chat_sessions (${columnsSQL})
         VALUES (${placeholders})`,
        insertValues
      );
    }

    // 6. Save chat messages in PostgreSQL
    const insertMessage = async (
      role: string,
      content: string
    ) => {
      const insertColumns: string[] = [];
      const insertValues: unknown[] = [];

      insertColumns.push(
        historySessionColumn.column_name
      );

      insertValues.push(
        activeConversationId
      );

      insertColumns.push(
        roleColumn.column_name
      );

      insertValues.push(role);

      insertColumns.push(
        contentColumn.column_name
      );

      insertValues.push(content);

      const createdColumn = findColumn(
        historyColumns,
        ["created_at", "created_on", "timestamp"]
      );

      if (createdColumn) {
        insertColumns.push(
          createdColumn.column_name
        );

        insertValues.push(new Date());
      }

      const placeholders = insertValues
        .map((_, index) => `$${index + 1}`)
        .join(", ");

      const columnsSQL = insertColumns
        .map(quoteIdentifier)
        .join(", ");

      await client!.query(
        `INSERT INTO chat_history (${columnsSQL})
         VALUES (${placeholders})`,
        insertValues
      );
    };

    // 7. Save user message
    await insertMessage("user", message);

    // 8. Generate rule-based response
    const answer = generateResponse(
      message,
      filename
    );

    // 9. Save assistant message
    await insertMessage("assistant", answer);

    // 10. Update session timestamp
    const updatedColumn = findColumn(
      sessionColumns,
      ["updated_at", "updated_on"]
    );

    if (updatedColumn) {
      await client.query(
        `UPDATE chat_sessions
         SET ${quoteIdentifier(updatedColumn.column_name)} = $1
         WHERE ${quoteIdentifier(sessionIdColumn.column_name)} = $2`,
        [new Date(), activeConversationId]
      );
    }

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      answer,
      conversation_id: activeConversationId,
      document_id: documentId,
      filename,
      mode: "rule-based",
    });
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Ignore rollback errors.
      }
    }

    console.error("Chat API error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to process chat message.",
      },
      { status: 500 }
    );
  } finally {
    client?.release();
  }
}