import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  const result = await pool.query("SELECT 1 as ok");
  return NextResponse.json({ db: result.rows[0] });
}
