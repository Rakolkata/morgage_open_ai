import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { getUploadDir } from "@/lib/paths";

export const runtime = "nodejs";

const uploadDir = getUploadDir();

function estimatePdfPageCount(buffer: Buffer): number {
  try {
    const text = buffer.toString("latin1");
    const matches = text.match(/\/Type\s*\/Page\b/g);
    if (matches && matches.length > 0) {
      return matches.length;
    }
  } catch {
    // fallback
  }
  return 1;
}

export async function POST(request: NextRequest) {
  let savedFilePath: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const rawInstruction =
      formData.get("instruction") ||
      formData.get("msg") ||
      formData.get("message") ||
      "";
    const instruction =
      typeof rawInstruction === "string" ? rawInstruction.trim() : "";

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Please upload a valid PDF file." },
        { status: 400 }
      );
    }

    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      return NextResponse.json(
        { success: false, error: "Only PDF files are allowed." },
        { status: 400 }
      );
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "PDF size must not exceed 50 MB." },
        { status: 400 }
      );
    }

    // Ensure uploads directory exists
    await fs.mkdir(uploadDir, { recursive: true });

    const documentId = randomUUID();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storedFilename = `${Date.now()}_${sanitizedName}`;
    savedFilePath = path.join(uploadDir, storedFilename);

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(savedFilePath, fileBuffer);

    const pageCount = estimatePdfPageCount(fileBuffer);

    // Save document metadata, storage_path, and instruction to PostgreSQL via Prisma
    const savedDoc = await prisma.documents.create({
      data: {
        id: documentId,
        filename: file.name,
        storage_path: savedFilePath,
        instruction: instruction || null,
        page_count: pageCount,
        file_size: BigInt(file.size),
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "PDF saved to uploads folder and database successfully.",
        document_id: savedDoc.id,
        id: savedDoc.id,
        filename: savedDoc.filename,
        storage_path: savedDoc.storage_path,
        instruction: savedDoc.instruction,
        page_count: savedDoc.page_count,
        file_size: Number(savedDoc.file_size || file.size),
        document: {
          id: savedDoc.id,
          filename: savedDoc.filename,
          storage_path: savedDoc.storage_path,
          instruction: savedDoc.instruction,
          page_count: savedDoc.page_count,
          file_size: Number(savedDoc.file_size || file.size),
          created_at: savedDoc.created_at,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (savedFilePath) {
      try {
        await fs.unlink(savedFilePath);
      } catch {
        // file cleanup
      }
    }

    console.error("Upload API error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to upload PDF and save to database.",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const docs = await prisma.documents.findMany({
      orderBy: { created_at: "desc" },
      take: 50,
    });

    const serialized = docs.map((doc: { file_size: any; }) => ({
      ...doc,
      file_size: doc.file_size ? Number(doc.file_size) : null,
    }));

    return NextResponse.json({ success: true, documents: serialized });
  } catch (error) {
    console.error("Get documents error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch documents." },
      { status: 500 }
    );
  }
}
