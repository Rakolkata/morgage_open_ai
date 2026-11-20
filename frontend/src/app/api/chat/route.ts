import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import fs from "fs";

export const runtime = "nodejs";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const documentId = body.document_id;
    let conversationId = body.conversation_id;
    const message =
      typeof body.message === "string" ? body.message.trim() : "";

    if (!documentId || !message) {
      return NextResponse.json(
        {
          success: false,
          error: "Document ID and message are required.",
        },
        { status: 400 }
      );
    }

    // 1. Fetch document from PostgreSQL via Prisma
    const document = await prisma.documents.findUnique({
      where: { id: String(documentId) },
    });

    if (!document) {
      return NextResponse.json(
        {
          success: false,
          error: "Uploaded document not found in database.",
        },
        { status: 404 }
      );
    }

    // Update document instruction if not previously set
    if (!document.instruction) {
      await prisma.documents.update({
        where: { id: document.id },
        data: { instruction: message },
      });
    }

    // 2. Ensure conversation exists
    if (conversationId) {
      const existingConv = await prisma.conversations.findUnique({
        where: { id: String(conversationId) },
      });
      if (!existingConv) {
        conversationId = undefined;
      }
    }

    if (!conversationId) {
      const newConv = await prisma.conversations.create({
        data: {
          id: randomUUID(),
          document_id: document.id,
          session_id: randomUUID(),
        },
      });
      conversationId = newConv.id;
    }

    // 3. Forward request to Python FastAPI backend (with Ollama / Agents)
    let aiAnswer = "";
    let agentName = "Orchestrator Agent";

    try {
      const backendFormData = new FormData();
      backendFormData.append("msg", message);
      backendFormData.append("agent", "orchestrator");

      // Attach the saved file from uploads folder if it exists on disk
      if (document.storage_path && fs.existsSync(document.storage_path)) {
        const fileBytes = fs.readFileSync(document.storage_path);
        const blob = new Blob([fileBytes], { type: "application/pdf" });
        backendFormData.append("file", blob, document.filename);
      }

      const backendResponse = await fetch(`${BACKEND_URL}/api/v1/chat`, {
        method: "POST",
        body: backendFormData,
      });

      if (backendResponse.ok) {
        const backendData = await backendResponse.json();
        aiAnswer =
          backendData.answer ||
          backendData.ans ||
          JSON.stringify(backendData.agent_output, null, 2);
        agentName = backendData.agent_name || "Orchestrator Agent";
      } else {
        console.warn("Backend returned status:", backendResponse.status);
      }
    } catch (backendError) {
      console.warn("Could not reach Python backend, generating local response:", backendError);
    }

    // Fallback if Python backend is offline
    if (!aiAnswer) {
      aiAnswer = [
        `📄 Document: **${document.filename}**`,
        `📁 Storage Path: \`${document.storage_path}\``,
        `📝 Instruction: "${message}"`,
        "",
        "The document path and instruction are recorded in the PostgreSQL database.",
        "To run Ollama extraction agents, ensure your FastAPI backend is running on http://127.0.0.1:8000.",
      ].join("\n");
      agentName = "Mortgage Audit Assistant";
    }

    // 4. Record user query and AI response in chat_logs
    await prisma.chat_logs.create({
      data: {
        conversation_id: conversationId,
        agent: agentName,
        message: message,
        response: aiAnswer,
      },
    });

    return NextResponse.json({
      success: true,
      answer: aiAnswer,
      conversation_id: conversationId,
      document_id: document.id,
      filename: document.filename,
      storage_path: document.storage_path,
      instruction: document.instruction || message,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to process chat message.",
      },
      { status: 500 }
    );
  }
}
