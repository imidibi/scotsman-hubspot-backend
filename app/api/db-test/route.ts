import { pool } from "../../../src/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const result = await pool.query("SELECT 1 as ok");
  return Response.json({ db: result.rows[0] });
}
