import { NextRequest } from "next/server";
import { requireApiKey } from "../../../../../../src/lib/auth";
import { getPool } from "../../../../../../src/lib/db";

export const runtime = "nodejs";

type HubSpotTokenRow = {
  hub_id: string | number;
  refresh_token: string;
  access_token: string | null;
  expires_at: string | null;
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
  if (!row) throw new Error("No HubSpot connection found");

  const expiresAtMs = toMs(row.expires_at);
  if (row.access_token && expiresAtMs > Date.now() + 60_000) return row.access_token;

  const refreshed = await refreshAccessToken(row.refresh_token);
  await saveAccessToken(String(row.hub_id), refreshed.accessToken, refreshed.expiresAt);
  return refreshed.accessToken;
}

async function hubspotGET(path: string, accessToken: string) {
  const resp = await fetch(`https://api.hubapi.com${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HubSpot GET ${path} failed: ${resp.status} ${text}`);
  }
  return resp.json();
}

async function batchRead(objectType: "companies" | "contacts", ids: string[], accessToken: string) {
  if (ids.length === 0) return [];
  const resp = await fetch(`https://api.hubapi.com/crm/v3/objects/${objectType}/batch/read`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      properties: objectType === "companies"
        ? ["name", "domain"]
        : ["firstname", "lastname", "email"],
      inputs: ids.map((id) => ({ id })),
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`HubSpot batch read ${objectType} failed: ${resp.status} ${text}`);
  }

  const json = await resp.json();
  return json.results ?? [];
}

export async function GET(req: NextRequest, context: { params: Promise<{ dealId: string }> }) {
  const authResp = requireApiKey(req);
  if (authResp) return authResp;

const { dealId } = await context.params;
  if (!dealId) return Response.json({ ok: false, message: "Missing dealId" }, { status: 400 });

  try {
    const accessToken = await getValidAccessToken();

    // 1) Fetch deal
    const deal = await hubspotGET(
      `/crm/v3/objects/deals/${encodeURIComponent(dealId)}?properties=dealname,amount,dealstage,closedate`,
      accessToken
    );

    // 2) Fetch association IDs (v4 associations endpoints)
    const companiesAssoc = await hubspotGET(
      `/crm/v4/objects/deals/${encodeURIComponent(dealId)}/associations/companies?limit=50`,
      accessToken
    );
    const contactsAssoc = await hubspotGET(
      `/crm/v4/objects/deals/${encodeURIComponent(dealId)}/associations/contacts?limit=200`,
      accessToken
    );

    const companyIds: string[] = (companiesAssoc.results ?? []).map((r: any) => String(r.toObjectId));
    const contactIds: string[] = (contactsAssoc.results ?? []).map((r: any) => String(r.toObjectId));

    // 3) Fetch full objects (batch)
    const companies = await batchRead("companies", companyIds.slice(0, 1), accessToken); // 0 or 1 company
    const contacts = await batchRead("contacts", contactIds, accessToken);

    const company = companies[0]
      ? {
          id: String(companies[0].id),
          name: companies[0].properties?.name ?? "",
          domain: companies[0].properties?.domain ?? null,
        }
      : null;

    const contactsOut = (contacts ?? []).map((c: any) => ({
      id: String(c.id),
      firstname: c.properties?.firstname ?? "",
      lastname: c.properties?.lastname ?? "",
      email: c.properties?.email ?? null,
    }));

    return Response.json({
      ok: true,
      deal: {
        id: String(deal.id),
        dealname: deal.properties?.dealname ?? "",
        amount: deal.properties?.amount ?? null,
        dealstage: deal.properties?.dealstage ?? null,
        closedate: deal.properties?.closedate ?? null,
      },
      company,
      contacts: contactsOut,
    });
  } catch (e: any) {
    return Response.json({ ok: false, message: e?.message ?? "Error" }, { status: 500 });
  }
}
