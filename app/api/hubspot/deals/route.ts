import { NextRequest } from "next/server";
import { requireApiKey } from "../../../../src/lib/auth";
import { getPool } from "../../../../src/lib/db";

export const runtime = "nodejs";

type HubSpotTokenRow = {
  hub_id: string | number;
  refresh_token: string;
  access_token: string | null;
  expires_at: string | null; // timestamptz
  updated_at: string | null;
};

function toMs(ts: string | null) {
  if (!ts) return 0;
  const ms = Date.parse(ts);
  return Number.isFinite(ms) ? ms : 0;
}

async function getLatestTokenRow(): Promise<HubSpotTokenRow | null> {
  const pool = getPool();
  const res = await pool.query(
    `SELECT hub_id, refresh_token, access_token, expires_at, updated_at
     FROM hubspot_tokens
     ORDER BY updated_at DESC
     LIMIT 1`
  );
  return res.rows[0] ?? null;
}

async function saveAccessToken(hubId: string, accessToken: string, expiresAtIso: string) {
  const pool = getPool();
  await pool.query(
    `UPDATE hubspot_tokens
     SET access_token = $2, expires_at = $3, updated_at = now()
     WHERE hub_id = $1`,
    [hubId, accessToken, expiresAtIso]
  );
}

async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("HUBSPOT_CLIENT_ID / HUBSPOT_CLIENT_SECRET not set");
  }

  const body = new URLSearchParams();
  body.set("grant_type", "refresh_token");
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("refresh_token", refreshToken);

  const resp = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HubSpot refresh failed: ${resp.status} ${text}`);
  }

  const json = (await resp.json()) as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + json.expires_in * 1000).toISOString();
  return { accessToken: json.access_token, expiresAt };
}

async function getValidAccessToken(): Promise<string> {
  const row = await getLatestTokenRow();
  if (!row) throw new Error("No HubSpot connection found in hubspot_tokens");

  const expiresAtMs = toMs(row.expires_at);

  if (row.access_token && expiresAtMs > Date.now() + 60_000) {
    return row.access_token;
  }

  const refreshed = await refreshAccessToken(row.refresh_token);
  await saveAccessToken(String(row.hub_id), refreshed.accessToken, refreshed.expiresAt);
  return refreshed.accessToken;
}

export async function GET(req: NextRequest) {
  const authResp = requireApiKey(req);
  if (authResp) return authResp;

  const url = new URL(req.url);
  const search = (url.searchParams.get("search") ?? "").trim();
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 50);

  try {
    const accessToken = await getValidAccessToken();

    // Use HubSpot Search API so we can filter by dealname
    const body = {
      filterGroups: search
        ? [
            {
              filters: [
                {
                  propertyName: "dealname",
                  operator: "CONTAINS_TOKEN",
                  value: search,
                },
              ],
            },
          ]
        : [],
      sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      properties: ["dealname", "amount", "dealstage", "closedate"],
      limit,
    };

    const resp = await fetch("https://api.hubapi.com/crm/v3/objects/deals/search", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return Response.json({ ok: false, message: "HubSpot error", detail: text }, { status: resp.status });
    }

    const json = await resp.json();

    const results = (json.results ?? []).map((d: any) => ({
      id: String(d.id),
      dealname: d.properties?.dealname ?? "",
      amount: d.properties?.amount ?? null,
      dealstage: d.properties?.dealstage ?? null,
      closedate: d.properties?.closedate ?? null,
    }));

    return Response.json({ ok: true, results });
  } catch (e: any) {
    return Response.json({ ok: false, message: e?.message ?? "Error" }, { status: 500 });
  }
}
