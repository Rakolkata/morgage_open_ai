import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const documentId = body.document_id;
    let conversationId = body.conversation_id;
    const message =
      typeof body.message === "string" ? body.message.trim() : "";
    const selectedAgent =
      typeof body.agent === "string" && body.agent.trim()
        ? body.agent.trim()
        : "orchestrator";

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

    // 3. Generate static response for the selected agent
    let aiAnswer = "";
    const normalizedAgent = selectedAgent.toLowerCase();

    if (normalizedAgent === "orchestrator") {
      aiAnswer = [
        `### 📋 Orchestrator Agent Plan`,
        `**Document:** ${document.filename}`,
        `**Task / Instruction:** ${message}`,
        ``,
        `**Extraction Blueprint:**`,
        `1. **Document Classification:** Closing Disclosure (CD) / Promissory Note`,
        `2. **Target Schema:** \`CD_Standard_v1\``,
        `3. **Fields Targeted for Extraction:**`,
        `   - Borrower Full Name`,
        `   - Property Address`,
        `   - Base Loan Amount`,
        `   - Note Interest Rate`,
        `   - Monthly Principal and Interest Payment`,
        `   - Loan Term / Amortization`,
        `   - Lender Name`,
        `4. **Handoff Instruction:** Forward to **Data Extractor Agent** for structured field extraction from Pages 1–3.`,
      ].join("\n");
    } else if (normalizedAgent === "data-extractor") {
      aiAnswer = [
        `### 🔍 Data Extractor Agent Results`,
        `**Document:** ${document.filename}`,
        `**Instruction:** ${message}`,
        ``,
        `| Field Name | Extracted Value | Source Page | Confidence |`,
        `| :--- | :--- | :--- | :--- |`,
        `| **Borrower Full Name** | Sunil Kumar | Page 1 | 98.7% |`,
        `| **Property Address** | 742 Evergreen Terrace, Springfield, OR | Page 1 | 97.4% |`,
        `| **Base Loan Amount** | $425,000.00 | Page 1 | 99.2% |`,
        `| **Note Interest Rate** | 6.375% | Page 1 | 99.5% |`,
        `| **Monthly P&I Payment** | $2,654.12 | Page 1 | 99.1% |`,
        `| **Loan Term / Amortization** | 30 Years (360 Months) | Page 1 | 99.0% |`,
        `| **Lender Name** | Apex Home Mortgage Corp | Page 3 | 98.2% |`,
      ].join("\n");
    } else if (normalizedAgent === "auditor") {
      aiAnswer = [
        `### 🛡️ Auditor Agent Compliance & Verification Report`,
        `**Document:** ${document.filename}`,
        `**Audit Review:** ${message}`,
        ``,
        `**Audit Findings & Verification:**`,
        `- ✅ **TRID Timing & Disclosure:** Closing disclosure provided within required 3-day timeline prior to consummation.`,
        `- ✅ **Math & Payment Validation:** Monthly P&I ($2,654.12) matches $425,000 loan at 6.375% for 360 months.`,
        `- ✅ **Tolerance Test:** 0% tolerance category verified with 0.00% variance against initial Loan Estimate.`,
        `- ✅ **Borrower & Property Vesting:** Borrower identity and property address confirmed against title records.`,
        `- 🎯 **Final Audit Verdict:** **COMPLIANT** — Approved for post-closing archival.`,
      ].join("\n");
    } else {
      aiAnswer = [
        `### 🤖 Agent (${selectedAgent}) Response`,
        `**Document:** ${document.filename}`,
        `**Instruction:** ${message}`,
        ``,
        `Processed instruction successfully under static mode.`,
      ].join("\n");
    }

    // 4. Record user query and AI response in chat_logs
    await prisma.chat_logs.create({
      data: {
        conversation_id: conversationId,
        agent: selectedAgent,
        message: message,
        response: aiAnswer,
      },
    });

    return NextResponse.json({
      success: true,
      answer: aiAnswer,
      agent: selectedAgent,
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
