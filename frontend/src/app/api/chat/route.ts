
import { NextRequest, NextResponse } from "next/server";
import { Agent } from "undici";
import { prisma } from "@/lib/prisma";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 600;

const FASTAPI_URL = (
  process.env.FASTAPI_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const EXTRACTION_TASK =
  "Extract the document and prepare the necessary fields for the mortgage loan application.";

const fastApiDispatcher = new Agent({
  headersTimeout: 600000,
  bodyTimeout: 600000,
  connectTimeout: 30000,
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const documentId = body.document_id;
    const conversationId = body.conversation_id ?? null;

    const userMessage =
      typeof body.message === "string" && body.message.trim()
        ? body.message.trim()
        : "Extract data from the uploaded mortgage document.";

    if (!documentId) {
      return NextResponse.json(
        { success: false, error: "document_id is required" },
        { status: 400 }
      );
    }

    // Find document in PostgreSQL.
    const document = await prisma.documents.findUnique({
      where: { id: String(documentId) },
    });

    if (!document) {
      return NextResponse.json(
        { success: false, error: "Document not found" },
        { status: 404 }
      );
    }

    if (!document.storage_path) {
      return NextResponse.json(
        { success: false, error: "Document storage path is missing" },
        { status: 404 }
      );
    }

    // Validate uploaded PDF location.
    const uploadsDirectory = path.resolve(
      process.cwd(),
      "..",
      "uploads"
    );

    const absoluteFilePath = path.resolve(document.storage_path);

    const relativePath = path.relative(
      uploadsDirectory,
      absoluteFilePath
    );

    if (
      relativePath === ".." ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid document storage path" },
        { status: 403 }
      );
    }

    await fs.access(absoluteFilePath);

    const pdfBuffer = await fs.readFile(absoluteFilePath);

    if (pdfBuffer.length === 0) {
      return NextResponse.json(
        { success: false, error: "Uploaded PDF file is empty" },
        { status: 400 }
      );
    }

    // Prepare FastAPI request.
    const formData = new FormData();

    formData.append("msg", userMessage);
    formData.append("agent", "workflow");
    formData.append("task", EXTRACTION_TASK);

    formData.append(
      "file",
      new Blob([new Uint8Array(pdfBuffer)], {
        type: "application/pdf",
      }),
      document.filename
    );

    console.log("Sending PDF to FastAPI:", document.filename);

    const fastApiResponse = await fetch(
      `${FASTAPI_URL}/api/v1/chat`,
      {
        method: "POST",
        body: formData,
        dispatcher: fastApiDispatcher,
        signal: AbortSignal.timeout(600000),
      } as RequestInit
    );

    const responseText = await fastApiResponse.text();

    let fastApiData: any;

    try {
      fastApiData = JSON.parse(responseText);
    } catch {
      fastApiData = { response: responseText };
    }

    if (!fastApiResponse.ok) {
      console.error("FASTAPI ERROR:", fastApiData);

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

    // Extract workflow output.
    const workflowOutput = fastApiData.agent_output ?? null;

    const extractionPlan =
      workflowOutput?.extraction_plan ?? null;

    const extractionResult =
      workflowOutput?.extraction_result ?? null;

    const extractedFields =
      Array.isArray(extractionResult?.extracted_fields)
        ? extractionResult.extracted_fields
        : [];

    const missingFields =
      Array.isArray(extractionResult?.missing_fields)
        ? extractionResult.missing_fields
        : [];

    const warnings =
      Array.isArray(extractionResult?.warnings)
        ? extractionResult.warnings
        : [];

    // Build the complete editable field list.
    const fieldsToExtract = Array.isArray(
      extractionPlan?.fields_to_extract
    )
      ? extractionPlan.fields_to_extract
      : [];

    const normalizedFields = fieldsToExtract.map(
      (fieldName: string, index: number) => {
        const extracted = extractedFields.find(
          (item: any) =>
            item.field_path?.toLowerCase() ===
            fieldName.toLowerCase()
        );

        return {
          id: `field-${index + 1}`,
          field_path: fieldName,
          value: extracted?.value ?? "",
          status: extracted ? "EXTRACTED" : "MISSING",
          document_type: extracted?.document_type ?? null,
          page: extracted?.page ?? null,
          source_text: extracted?.source_text ?? null,
          confidence: extracted?.confidence ?? null,
        };
      }
    );

    // Save extraction results permanently.
    const savedExtractionData = {
      extraction_plan: extractionPlan,
      extraction_result: extractionResult,
      fields: normalizedFields,
      missing_fields: missingFields,
      warnings,
      updated_at: new Date().toISOString(),
    };

    await prisma.documents.update({
      where: { id: String(documentId) },
      data: {
        extracted_data: savedExtractionData,
      },
    });

    console.log(
      "Extraction results saved to PostgreSQL:",
      documentId
    );

    return NextResponse.json({
      success: true,
      answer: fastApiData.answer ?? "",
      agent_name: fastApiData.agent_name ?? null,
      agent_output: workflowOutput,
      extraction_plan: extractionPlan,
      extraction_result: extractionResult,
      extracted_fields: extractedFields,
      missing_fields: missingFields,
      warnings,
      fields: normalizedFields,
      model: fastApiData.model ?? null,
      file_name: fastApiData.file_name ?? document.filename,
      status: fastApiData.status ?? "success",
      conversation_id: conversationId,
      document_id: documentId,
    });
  } catch (error: unknown) {
    console.error("CHAT API ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Internal server error",
      },
      { status: 500 }
    );
  }
}
