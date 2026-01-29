import { getPool } from "../../../../src/lib/db";
import { requireApiKey } from "../../../../src/lib/auth";

export const runtime = "nodejs";

type TokenRow = {
  hub_id: number;
  access_token: string | null;
  refresh_token: string;
  expires_at: string | null;
};

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  const expiryMs = new Date(expiresAt).getTime() - 60_000;
  return Date.now() >= expiryMs;
}

async function refreshAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: process.env.HUBSPOT_CLIENT_ID!,
    client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
    refresh_token: refreshToken,
  });

  const resp = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await resp.json();
  if (!resp.ok) return { ok: false as const, data };

  const accessToken = String(data.access_token);
  const expiresInSec = Number(data.expires_in || 0);
  const expiresAt = expiresInSec
    ? new Date(Date.now() + expiresInSec * 1000).toISOString()
    : null;

  return { ok: true as const, accessToken, expiresAt };
}

async function getValidAccessToken(hubId: number): Promise<string> {
  const pool = getPool();

  const r = await pool.query<TokenRow>(
    `select hub_id, access_token, refresh_token, expires_at
     from hubspot_tokens
     where hub_id = $1`,
    [hubId]
  );

  if (r.rowCount === 0) throw new Error("Unknown hub_id");

  const row = r.rows[0];

  if (row.access_token && !isExpired(row.expires_at)) {
    return row.access_token;
  }

  const refreshed = await refreshAccessToken(row.refresh_token);
  if (!refreshed.ok) throw new Error("Token refresh failed");

  await pool.query(
    `update hubspot_tokens
     set access_token = $1,
         expires_at = $2,
         updated_at = now()
     where hub_id = $3`,
    [refreshed.accessToken, refreshed.expiresAt, hubId]
  );

  return refreshed.accessToken;
}

export async function POST(req: Request) {
  const denied = requireApiKey(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const hubId = Number(body.hub_id);
  const limit = Math.min(Number(body.limit ?? 20), 100);

  if (!hubId) {
    return Response.json({ ok: false, message: "Missing hub_id" }, { status: 400 });
  }

  try {
    const accessToken = await getValidAccessToken(hubId);

    const url = new URL("https://api.hubapi.com/crm/v3/objects/deals");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("properties", "dealname,amount,dealstage,closedate,createdate");

    const resp = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await resp.json();
    if (!resp.ok) {
      return Response.json({ ok: false, hubspot: data }, { status: resp.status });
    }

    return Response.json({
      ok: true,
      hub_id: hubId,
      results: data.results ?? [],
      paging: data.paging ?? null,
    });
  } catch (e: any) {
    return Response.json(
      { ok: false, message: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
