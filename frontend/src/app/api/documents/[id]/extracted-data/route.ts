
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

interface ExtractedField {
  id: string;
  field_path: string;
  value: string;
  status: string;
  document_type?: string | null;
  page?: number | null;
  source_text?: string | null;
  confidence?: number | null;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET: Retrieve saved extraction data.
export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { id } = await params;

    const document = await prisma.documents.findUnique({
      where: { id },
      select: {
        id: true,
        filename: true,
        extracted_data: true,
      },
    });

    if (!document) {
      return NextResponse.json(
        { success: false, error: "Document not found" },
        { status: 404 }
      );
    }

    const savedData = document.extracted_data as any;

    return NextResponse.json({
      success: true,
      document_id: document.id,
      filename: document.filename,
      fields: savedData?.fields ?? [],
      extraction_plan: savedData?.extraction_plan ?? null,
      missing_fields: savedData?.missing_fields ?? [],
      warnings: savedData?.warnings ?? [],
      updated_at: savedData?.updated_at ?? null,
    });
  } catch (error) {
    console.error("GET EXTRACTED DATA ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to retrieve extracted data",
      },
      { status: 500 }
    );
  }
}

// PUT: Save edited extraction data.
export async function PUT(
  request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!Array.isArray(body.fields)) {
      return NextResponse.json(
        { success: false, error: "fields must be an array" },
        { status: 400 }
      );
    }

    const document = await prisma.documents.findUnique({
      where: { id },
      select: {
        id: true,
        extracted_data: true,
      },
    });

    if (!document) {
      return NextResponse.json(
        { success: false, error: "Document not found" },
        { status: 404 }
      );
    }

    const previousData = document.extracted_data as any;

    const fields: ExtractedField[] = body.fields.map(
      (field: any, index: number) => {
        const fieldPath =
          typeof field.field_path === "string"
            ? field.field_path.trim()
            : "";

        if (!fieldPath) {
          throw new Error(
            `Field name is required at row ${index + 1}`
          );
        }

        return {
          id:
            typeof field.id === "string"
              ? field.id
              : `field-${index + 1}`,
          field_path: fieldPath,
          value:
            field.value === null || field.value === undefined
              ? ""
              : String(field.value),
          status:
            typeof field.status === "string"
              ? field.status
              : String(field.value ?? "").trim()
                ? "EXTRACTED"
                : "MISSING",
          document_type: field.document_type ?? null,
          page:
            typeof field.page === "number"
              ? field.page
              : null,
          source_text: field.source_text ?? null,
          confidence:
            typeof field.confidence === "number"
              ? field.confidence
              : null,
        };
      }
    );

    const updatedData = {
      ...(previousData ?? {}),
      fields,
      updated_at: new Date().toISOString(),
    };

    await prisma.documents.update({
      where: { id },
      data: {
        extracted_data: updatedData,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Extracted data saved successfully",
      document_id: id,
      fields,
      updated_at: updatedData.updated_at,
    });
  } catch (error) {
    console.error("SAVE EXTRACTED DATA ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to save extracted data",
      },
      { status: 500 }
    );
  }
}
