import { pool } from "@/lib/db";

export const runtime = "nodejs"; // IMPORTANT: pg requires Node runtime

export async function GET() {
  const result = await pool.query("SELECT 1 as ok");
  return Response.json({ db: result.rows[0] });
}
