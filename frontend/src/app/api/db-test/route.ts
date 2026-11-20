import { NextResponse } from "next/server";
import pool from "../../../../lib/db";

export async function GET() {
  try {
    const result = await pool.query(
      "SELECT NOW() AS current_time, current_database() AS database_name"
    );

    return NextResponse.json({
      success: true,
      message: "PostgreSQL connected successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Database connection error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Database connection failed",
      },
      { status: 500 }
    );
  }
}
