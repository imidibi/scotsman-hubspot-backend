import { getPool } from "../../../../src/lib/db";
import { requireApiKey } from "../../../../src/lib/auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const auth = requireApiKey(req);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const pool = getPool();

  // Connected if we have at least one token row. (Later: filter by user/tenant.)
  const result = await pool.query(
    `SELECT hub_id, updated_at
     FROM hubspot_tokens
     ORDER BY updated_at DESC
     LIMIT 1`
  );

  if (result.rowCount === 0) {
    return Response.json({ ok: true, connected: false, hub_id: null });
  }

  return Response.json({
    ok: true,
    connected: true,
    hub_id: String(result.rows[0].hub_id),
    updated_at: result.rows[0].updated_at,
  });
}
