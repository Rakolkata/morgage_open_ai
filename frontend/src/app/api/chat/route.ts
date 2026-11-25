
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 600;

const FASTAPI_URL =
  process.env.FASTAPI_URL || "http://127.0.0.1:8000";

// Mortgage extraction instructions
const extractionTask = {
  task: "Extract the document and prepare the necessary fields for the mortgage loan application.",

  document_types: ["OTHER"],

  schema_name: "OTHER",

  fields_to_extract: [
    "Borrower Full Name",
    "Property Address",
    "Base Loan Amount",
    "Note Interest Rate",
    "Monthly Principal and Interest Payment",
    "Loan Term / Amortization",
    "Lender Name",
  ],

  instructions: [
    "Locate the borrower's full name in the document. It is typically found in the header or on the first page.",
    "Identify the property address by looking for the address details provided in the document. This is usually found on the first page.",
    "Find the base loan amount by searching for the total loan amount mentioned in the document. This is usually found on the first page.",
    "Locate the note interest rate by looking for the interest rate specified in the document. This is typically found on the first page.",
    "Extract the monthly principal and interest payment by finding the monthly payment details provided in the document. This is usually found on the first page.",
    "Identify the loan term or amortization period by searching for the duration of the loan mentioned in the document. This is typically found on the first page.",
    "Find the lender's name by locating the information provided about the lending institution in the document. This is usually found on the first page.",
  ],
};

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export async function POST(request: NextRequest) {
  try {
    // 1. Receive frontend request
    const body = await request.json();

    const documentId = body.document_id;
    const conversationId = body.conversation_id ?? null;
    const userMessage = body.message ?? "";

    if (!documentId) {
      return NextResponse.json(
        {
          success: false,
          error: "document_id is required",
        },
        { status: 400 }
      );
    }

    // 2. Find uploaded document in PostgreSQL
    const document = await prisma.documents.findUnique({
      where: {
        id: String(documentId),
      },
    });

    if (!document) {
      return NextResponse.json(
        {
          success: false,
          error: "Document not found",
        },
        { status: 404 }
      );
    }

    // 3. Get PDF storage path
    const storagePath = document.storage_path;

    if (!storagePath) {
      return NextResponse.json(
        {
          success: false,
          error: "Document storage path is missing",
        },
        { status: 404 }
      );
    }

    // 4. Validate file location
    const uploadsDirectory = path.resolve(
      process.cwd(),
      "..",
      "uploads"
    );

    const absoluteFilePath = path.resolve(storagePath);

    const relativePath = path.relative(
      uploadsDirectory,
      absoluteFilePath
    );

    if (
      relativePath.startsWith("..") ||
      path.isAbsolute(relativePath)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid document storage path",
        },
        { status: 403 }
      );
    }

    // 5. Read actual uploaded PDF
    const pdfBuffer = await fs.readFile(absoluteFilePath);

    // 6. Prepare instruction for Orchestrator Agent
    const instruction = JSON.stringify(extractionTask);

    // 7. Create multipart form data for FastAPI
    const formData = new FormData();

    formData.append("msg", instruction);
    formData.append("agent", "orchestrator");

    formData.append(
      "file",
      new Blob([pdfBuffer], {
        type: "application/pdf",
      }),
      document.filename || "mortgage_document.pdf"
    );

    // 8. Send PDF and instructions to FastAPI
    const fastApiResponse = await fetch(
      `${FASTAPI_URL}/api/v1/chat`,
      {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(600000),
      }
    );

    // 9. Read FastAPI response
    const responseText = await fastApiResponse.text();

    let fastApiData: any;

    try {
      fastApiData = JSON.parse(responseText);
    } catch {
      fastApiData = {
        response: responseText,
      };
    }

    // 10. Handle FastAPI errors
    if (!fastApiResponse.ok) {
      console.error(
        "FASTAPI ERROR:",
        fastApiData
      );

      return NextResponse.json(
        {
          success: false,
          error: "FastAPI request failed",
          status: fastApiResponse.status,
          details: fastApiData,
        },
        { status: 502 }
      );
    }

    // 11. Get actual AI-generated answer
    const answer =
      fastApiData.answer ??
      fastApiData.response ??
      fastApiData.message ??
      fastApiData.result ??
      JSON.stringify(fastApiData);

    // 12. Return actual FastAPI response to frontend
    return NextResponse.json({
      success: true,

      answer,

      agent_name: fastApiData.agent_name ?? null,

      agent_output: fastApiData.agent_output ?? null,

      model: fastApiData.model ?? null,

      file_name: fastApiData.file_name ?? document.filename,

      status: fastApiData.status ?? "success",

      conversation_id: conversationId,

      document_id: documentId,
    });

  } catch (error: unknown) {
    console.error("CHAT API ERROR:", error);

    const errorMessage =
      error instanceof Error
        ? error.message
        : "Internal server error";

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}
