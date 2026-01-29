import { getPool } from "../../../../src/lib/db";

function getCookie(req: Request, name: string): string | null {
  const cookie = req.headers.get("cookie") || "";
  const parts = cookie.split(";").map((s) => s.trim());
  const found = parts.find((p) => p.startsWith(name + "="));
  return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : null;
}

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const returnedState = url.searchParams.get("state");
  const expectedState = getCookie(req, "hs_oauth_state");

  if (error) {
    return Response.json(
      { ok: false, error, error_description: url.searchParams.get("error_description") },
      { status: 400 }
    );
  }

  if (!code) return Response.json({ ok: false, message: "Missing code" }, { status: 400 });

  // CSRF protection
  if (!returnedState || !expectedState || returnedState !== expectedState) {
    return Response.json({ ok: false, message: "Invalid OAuth state" }, { status: 400 });
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: process.env.HUBSPOT_CLIENT_ID!,
    client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
    redirect_uri: process.env.HUBSPOT_REDIRECT_URI!,
    code,
  });

  const resp = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await resp.json();
  if (!resp.ok) return Response.json({ ok: false, hubspot: data }, { status: 400 });

  const hubId = Number(data.hub_id);
  const refreshToken = String(data.refresh_token);
  const accessToken = String(data.access_token);
  const expiresInSec = Number(data.expires_in || 0);
  const scopes: string[] = Array.isArray(data.scopes) ? data.scopes : [];
  const expiresAt = expiresInSec ? new Date(Date.now() + expiresInSec * 1000).toISOString() : null;

  const pool = getPool();
  await pool.query(
    `insert into hubspot_tokens (hub_id, refresh_token, access_token, expires_at, scopes, updated_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (hub_id)
     do update set refresh_token = excluded.refresh_token,
                   access_token = excluded.access_token,
                   expires_at = excluded.expires_at,
                   scopes = excluded.scopes,
                   updated_at = now()`,
    [hubId, refreshToken, accessToken, expiresAt, scopes]
  );

  // Clear the state cookie and redirect to a friendly page
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/connected",
      "Set-Cookie": "hs_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    },
  });
}
