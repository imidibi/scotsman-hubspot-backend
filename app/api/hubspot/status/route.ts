import { getPool } from "../../../../src/lib/db";
import { requireApiKey } from "../../../../src/lib/auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  // 🔐 API key auth
  const authResp = requireApiKey(req);
  if (authResp) return authResp;

  // ✅ Authorized — continue
  const pool = getPool();

  // Check whether we have at least one HubSpot token stored
  const result = await pool.query(
    `
    SELECT hub_id, updated_at
    FROM hubspot_tokens
    ORDER BY updated_at DESC
    LIMIT 1
    `
  );

  if (result.rows.length === 0) {
    return Response.json({
      ok: true,
      connected: false,
    });
  }

  return Response.json({
    ok: true,
    connected: true,
    hub_id: result.rows[0].hub_id,
    updated_at: result.rows[0].updated_at,
  });
}
