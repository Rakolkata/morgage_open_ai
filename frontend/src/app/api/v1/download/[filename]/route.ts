import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const FASTAPI_URL = (
  process.env.FASTAPI_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

interface RouteContext {
  params: Promise<{ filename: string }>;
}

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { filename } = await params;
    const safeName = decodeURIComponent(filename);

    const fastApiUrl = `${FASTAPI_URL}/api/v1/download/${encodeURIComponent(safeName)}`;

    const response = await fetch(fastApiUrl, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Download failed: ${response.statusText}` },
        { status: response.status }
      );
    }

    const contentType =
      response.headers.get("content-type") || "application/octet-stream";
    const contentDisposition =
      response.headers.get("content-disposition") ||
      `attachment; filename="${safeName}"`;

    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Content-Disposition", contentDisposition);

    const contentLength = response.headers.get("content-length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    return new Response(response.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("DOWNLOAD PROXY ERROR:", error);
    return NextResponse.json(
      { error: "Failed to download requested export file." },
      { status: 500 }
    );
  }
}
