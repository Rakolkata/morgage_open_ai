import { NextRequest, NextResponse } from "next/server";
import pool from "../../../../lib/db";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";

const uploadDir = path.join(process.cwd(), "..", "uploads");

export async function POST(request: NextRequest) {
  let savedFilePath: string | null = null;
  const client = await pool.connect();

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: "Please upload a PDF file." },
        { status: 400 }
      );
    }

    if (
      file.type !== "application/pdf" ||
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      return NextResponse.json(
        { success: false, error: "Only PDF files are allowed." },
        { status: 400 }
      );
    }

    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, error: "PDF size must not exceed 25 MB." },
        { status: 400 }
      );
    }

    await fs.mkdir(uploadDir, { recursive: true });

    const documentId = randomUUID();
    const loanCaseId = randomUUID();
    const storedFilename = `${documentId}.pdf`;

    savedFilePath = path.join(uploadDir, storedFilename);

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    await fs.writeFile(savedFilePath, fileBuffer);

    await client.query("BEGIN");

    // 1. Create loan case
    await client.query(
      `INSERT INTO loan_cases
        (id, loan_number, borrower_name, loan_type, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [
        loanCaseId,
        null,
        null,
        null,
        "document_uploaded",
      ]
    );

    // 2. Save uploaded document and link it to the loan case
    const result = await client.query(
      `INSERT INTO uploaded_documents
        (id, loan_case_id, original_filename, stored_filename,
         storage_path, mime_type, file_size, uploaded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING id, loan_case_id, original_filename, stored_filename,
                 storage_path, mime_type, file_size, uploaded_at`,
      [
        documentId,
        loanCaseId,
        file.name,
        storedFilename,
        savedFilePath,
        file.type,
        file.size,
      ]
    );

    await client.query("COMMIT");

    return NextResponse.json(
      {
        success: true,
        message: "PDF uploaded and loan case created successfully.",
        loan_case_id: loanCaseId,
        document: result.rows[0],
      },
      { status: 201 }
    );
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Transaction may not have started.
    }

    if (savedFilePath) {
      try {
        await fs.unlink(savedFilePath);
      } catch {
        // File may not exist.
      }
    }

    console.error("Upload API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to upload PDF and create loan case.",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}