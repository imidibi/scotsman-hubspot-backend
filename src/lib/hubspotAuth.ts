import { getPool } from "./db";

type TokenRow = {
  hub_id: number;
  access_token: string | null;
  refresh_token: string;
  expires_at: string | null;
};

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  // refresh 60s early to avoid edge timing issues
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

  if (!resp.ok) {
    return { ok: false as const, data };
  }

  const accessToken = String(data.access_token);
  const expiresInSec = Number(data.expires_in || 0);
  const expiresAt = expiresInSec
    ? new Date(Date.now() + expiresInSec * 1000).toISOString()
    : null;

  return { ok: true as const, accessToken, expiresAt };
}

export async function getValidAccessToken(hubId: number): Promise<string> {
  const pool = getPool();

  const r = await pool.query<TokenRow>(
    `select hub_id, access_token, refresh_token, expires_at
     from hubspot_tokens
     where hub_id = $1`,
    [hubId]
  );

  if (r.rowCount === 0) {
    throw new Error("Unknown hub_id");
  }

  const row = r.rows[0];

  if (row.access_token && !isExpired(row.expires_at)) {
    return row.access_token;
  }

  const refreshed = await refreshAccessToken(row.refresh_token);
  if (!refreshed.ok) {
    throw new Error("Token refresh failed");
  }

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
