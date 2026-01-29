import { requireApiKey } from "../../../../src/lib/auth";
import { getValidAccessToken } from "../../../../src/lib/hubspotAuth";
import { getPool } from "../../../../src/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const hubId = Number(body.hub_id);

  if (!hubId) {
    return Response.json({ ok: false, message: "Missing hub_id" }, { status: 400 });
  }

  // Get token (auto-refreshes if needed)
  const accessToken = await getValidAccessToken(hubId);

  // Return expiry info too (optional but handy)
  const pool = getPool();
  const r = await pool.query(
    `select expires_at from hubspot_tokens where hub_id = $1`,
    [hubId]
  );

  return Response.json({
    ok: true,
    hub_id: hubId,
    access_token: accessToken,
    expires_at: r.rows[0]?.expires_at ?? null,
  });
}
