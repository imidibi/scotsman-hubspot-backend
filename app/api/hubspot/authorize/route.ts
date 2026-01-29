export const runtime = "nodejs";

export function GET() {
  const clientId = process.env.HUBSPOT_CLIENT_ID!;
  const redirectUri = process.env.HUBSPOT_REDIRECT_URI!;
  const scope = process.env.HUBSPOT_SCOPES ?? "oauth";
  const state = crypto.randomUUID();

  const url = new URL("https://app.hubspot.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: url.toString(),
      "Set-Cookie": `hs_oauth_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}
