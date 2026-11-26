
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
  "Extract all critical mortgage values from the uploaded document.";

const fastApiDispatcher = new Agent({
  headersTimeout: 600000,
  bodyTimeout: 600000,
  connectTimeout: 30000,
});

// --------------------------------------------------
// FastAPI helper
// --------------------------------------------------

async function callFastAPI(
  agentName: string,
  message: string,
  fileName: string,
  pdfBuffer: Buffer,
  extractionPlan?: unknown
) {
  const formData = new FormData();

  formData.append("msg", message);
  formData.append("agent", agentName);

  if (extractionPlan !== undefined) {
    const planString =
      typeof extractionPlan === "string"
        ? extractionPlan
        : JSON.stringify(extractionPlan);

    formData.append("extraction_plan", planString);
    formData.append("plan", planString);
  }

  formData.append(
    "file",
    new Blob([new Uint8Array(pdfBuffer)], {
      type: "application/pdf",
    }),
    fileName
  );

  const response = await fetch(`${FASTAPI_URL}/api/v1/chat`, {
    method: "POST",
    body: formData,
    dispatcher: fastApiDispatcher,
    signal: AbortSignal.timeout(600000),
  } as RequestInit);

  const responseText = await response.text();

  let data: any;

  try {
    data = JSON.parse(responseText);
  } catch {
    data = { response: responseText };
  }

  if (!response.ok) {
    console.error(`${agentName} FastAPI error:`, data);

    throw new Error(
      data?.detail ??
        data?.error ??
        `FastAPI ${agentName} request failed with status ${response.status}`
    );
  }

  return data;
}

// --------------------------------------------------
// Response parsing helpers
// --------------------------------------------------

function getAgentOutput(data: any) {
  return data?.agent_output ?? data?.output ?? data;
}

function getExtractionPlan(data: any) {
  const output = getAgentOutput(data);

  if (output?.extraction_plan) {
    return output.extraction_plan;
  }

  if (data?.extraction_plan) {
    return data.extraction_plan;
  }

  return output;
}

function getExtractionResult(data: any) {
  const output = getAgentOutput(data);

  if (output?.extraction_result) {
    return output.extraction_result;
  }

  if (data?.extraction_result) {
    return data.extraction_result;
  }

  return output;
}

function isMissingValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }

  const normalized = String(value).trim().toLowerCase();

  return (
    normalized === "" ||
    normalized === "not supplied" ||
    normalized === "not provided" ||
    normalized === "not found" ||
    normalized === "unavailable" ||
    normalized === "n/a" ||
    normalized === "null"
  );
}

// --------------------------------------------------
// POST
// --------------------------------------------------

const BACKEND_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const documentId = body.document_id;
    const conversationId = body.conversation_id ?? null;

    const selectedAgent = String(
      body.agent ?? "orchestrator"
    )
      .trim()
      .toLowerCase()
      .replace(/-/g, "_");

    const userMessage =
      typeof body.message === "string" && body.message.trim()
        ? body.message.trim()
        : EXTRACTION_TASK;

    if (!documentId) {
      return NextResponse.json(
        {
          success: false,
          error: "document_id is required",
        },
        { status: 400 }
      );
    }

    const supportedAgents = [
      "orchestrator",
      "data_extractor",
      "auditor",
    ];

    if (!supportedAgents.includes(selectedAgent)) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported agent: ${selectedAgent}`,
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 1. Retrieve document
    // --------------------------------------------------

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

    if (!document.storage_path) {
      return NextResponse.json(
        {
          success: false,
          error: "Document storage path is missing",
        },
        { status: 404 }
      );
    }

    // --------------------------------------------------
    // 2. Validate document storage path
    // --------------------------------------------------

    const uploadsDirectory = path.resolve(
      process.cwd(),
      "..",
      "uploads"
    );

    const absoluteFilePath = path.resolve(
      document.storage_path
    );

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
        {
          success: false,
          error: "Invalid document storage path",
        },
        { status: 403 }
      );
    }

    await fs.access(absoluteFilePath);

    const pdfBuffer = await fs.readFile(absoluteFilePath);

    if (pdfBuffer.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Uploaded PDF file is empty",
        },
        { status: 400 }
      );
    }

    console.log(
      `Selected agent: ${selectedAgent}`,
      document.filename
    );

    // --------------------------------------------------
    // 3. ORCHESTRATOR
    // --------------------------------------------------

    if (selectedAgent === "orchestrator") {
      console.log("Running Orchestrator Agent...");

      const orchestratorResponse = await callFastAPI(
        "orchestrator",
        userMessage,
        document.filename,
        pdfBuffer
      );

      const orchestratorOutput = getAgentOutput(
        orchestratorResponse
      );

      const extractionPlan = getExtractionPlan(
        orchestratorResponse
      );

      return NextResponse.json({
        success: true,
        answer:
          orchestratorResponse.answer ??
          JSON.stringify(orchestratorOutput, null, 2),
        agent_name:
          orchestratorResponse.agent_name ??
          "Orchestrator Agent",
        agent_output: orchestratorOutput,
        extraction_plan: extractionPlan,
        model: orchestratorResponse.model ?? null,
        file_name:
          orchestratorResponse.file_name ??
          document.filename,
        status: orchestratorResponse.status ?? "success",
        document_id: documentId,
        conversation_id: conversationId,
        selected_agent: "orchestrator",
      });
    }

    // --------------------------------------------------
    // 4. DATA EXTRACTOR
    // --------------------------------------------------

    if (selectedAgent === "data_extractor") {
      let extractionPlan: any = null;

      // 1. Check if userMessage or request body already provides an extraction plan JSON
      if (
        body.extraction_plan &&
        Array.isArray(body.extraction_plan.fields_to_extract)
      ) {
        extractionPlan = body.extraction_plan;
      } else if (
        body.plan &&
        Array.isArray(body.plan.fields_to_extract)
      ) {
        extractionPlan = body.plan;
      } else if (typeof userMessage === "string" && userMessage.trim()) {
        try {
          const parsed = JSON.parse(userMessage.trim());
          if (
            parsed &&
            typeof parsed === "object" &&
            Array.isArray(parsed.fields_to_extract)
          ) {
            extractionPlan = parsed;
          } else if (
            parsed?.extraction_plan &&
            Array.isArray(parsed.extraction_plan.fields_to_extract)
          ) {
            extractionPlan = parsed.extraction_plan;
          }
        } catch {
          // userMessage is not JSON, might be a text guideline
        }
      }

      // 2. If no valid plan was provided directly, ask Orchestrator to generate one as fallback
      if (
        !extractionPlan ||
        !Array.isArray(extractionPlan.fields_to_extract)
      ) {
        console.log("No explicit extraction plan provided. Running Orchestrator Agent...");

        const orchestratorResponse = await callFastAPI(
          "orchestrator",
          userMessage,
          document.filename,
          pdfBuffer
        );

        extractionPlan = getExtractionPlan(orchestratorResponse);
      }

      if (
        !extractionPlan ||
        !Array.isArray(extractionPlan.fields_to_extract)
      ) {
        console.error(
          "Invalid extraction plan:",
          extractionPlan
        );

        return NextResponse.json(
          {
            success: false,
            error:
              "Did not return a valid extraction plan with fields_to_extract.",
            details: extractionPlan,
          },
          { status: 400 }
        );
      }

      console.log("Running Data Extractor Agent with plan:", extractionPlan);

      const extractorResponse = await callFastAPI(
        "data_extractor",
        typeof userMessage === "string" && userMessage.trim().startsWith("{")
          ? userMessage
          : EXTRACTION_TASK,
        document.filename,
        pdfBuffer,
        extractionPlan
      );

      const extractionResult = getExtractionResult(
        extractorResponse
      );

      const rawExtractedFields = Array.isArray(
        extractionResult?.extracted_fields
      )
        ? extractionResult.extracted_fields
        : [];

      const warnings = Array.isArray(
        extractionResult?.warnings
      )
        ? extractionResult.warnings
        : [];

      // --------------------------------------------------
      // Normalize fields for frontend
      // --------------------------------------------------

      const fieldsToExtract: string[] =
        extractionPlan.fields_to_extract;

      const normalizedFields = fieldsToExtract.map(
        (fieldName: string, index: number) => {
          const extracted = rawExtractedFields.find(
            (item: any) =>
              String(item?.field_path ?? "")
                .trim()
                .toLowerCase() ===
              fieldName.trim().toLowerCase()
          );

          const value = extracted?.value ?? null;

          const fieldStatus = isMissingValue(value)
            ? "MISSING"
            : "EXTRACTED";

          return {
            id: `field-${index + 1}`,
            field_path: fieldName,
            value,
            status: fieldStatus,
            document_type:
              extracted?.document_type ?? null,
            page: extracted?.page ?? null,
            source_text:
              extracted?.source_text ?? null,
            confidence:
              extracted?.confidence ?? null,
          };
        }
      );

      // --------------------------------------------------
      // Calculate missing fields consistently
      // --------------------------------------------------

      const normalizedMissingFields =
        normalizedFields
          .filter((field) => field.status === "MISSING")
          .map((field) => field.field_path);

      // --------------------------------------------------
      // Create consistent extraction result
      // --------------------------------------------------

      const normalizedExtractionResult = {
        documents: extractionResult?.documents ?? [],
        extracted_fields: normalizedFields,
        missing_fields: normalizedMissingFields,
        warnings,
      };

      // --------------------------------------------------
      // Save to PostgreSQL
      // --------------------------------------------------

      const savedExtractionData = {
        extraction_plan: extractionPlan,
        extraction_result: normalizedExtractionResult,
        fields: normalizedFields,
        missing_fields: normalizedMissingFields,
        warnings,
        updated_at: new Date().toISOString(),
      };

      await prisma.documents.update({
        where: {
          id: String(documentId),
        },
        data: {
          extracted_data: savedExtractionData,
        },
      });

      console.log(
        "Extraction data saved:",
        documentId
      );

      // --------------------------------------------------
      // Response
      // --------------------------------------------------

      return NextResponse.json({
        success: true,

        answer: JSON.stringify(
          normalizedExtractionResult,
          null,
          2
        ),

        model:
          extractorResponse.model ??
          null,

        agent_name:
          extractorResponse.agent_name ??
          "Data Extractor Agent",

        // Consistent normalized data
        agent_output: normalizedExtractionResult,

        extraction_plan: extractionPlan,

        extraction_result: normalizedExtractionResult,

        extracted_fields: normalizedFields,

        fields: normalizedFields,

        missing_fields: normalizedMissingFields,

        warnings,

        file_name:
          extractorResponse.file_name ??
          document.filename,

        status:
          extractorResponse.status ??
          "success",

        document_id: documentId,

        conversation_id: conversationId,

        selected_agent: "data_extractor",
      });
    }

    // --------------------------------------------------
    // 5. AUDITOR
    // --------------------------------------------------

    if (selectedAgent === "auditor") {
      console.log("Running Auditor Agent...");

      const auditorResponse = await callFastAPI(
        "auditor",
        userMessage,
        document.filename,
        pdfBuffer
      );

      const auditorOutput = getAgentOutput(
        auditorResponse
      );

      return NextResponse.json({
        success: true,
        answer:
          auditorResponse.answer ??
          JSON.stringify(auditorOutput, null, 2),
        agent_name:
          auditorResponse.agent_name ??
          "Auditor Agent",
        agent_output: auditorOutput,
        model: auditorResponse.model ?? null,
        file_name:
          auditorResponse.file_name ??
          document.filename,
        status:
          auditorResponse.status ??
          "success",
        download_url: auditorResponse.download_url ?? null,
        download_format: auditorResponse.download_format ?? auditorResponse.file_format ?? null,
        available_downloads: auditorResponse.available_downloads ?? {},
        document_id: documentId,
        conversation_id: conversationId,
        selected_agent: "auditor",
      });
    }

    // --------------------------------------------------
    // Fallback
    // --------------------------------------------------

    return NextResponse.json(
      {
        success: false,
        error: "Agent processing could not be completed.",
      },
      { status: 500 }
    );
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
