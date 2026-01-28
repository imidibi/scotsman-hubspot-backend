export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return Response.json(
      {
        ok: false,
        error,
        error_description: url.searchParams.get("error_description"),
      },
      { status: 400 }
    );
  }

  if (!code) {
    return Response.json({ ok: false, message: "Missing code" }, { status: 400 });
  }

  const clientId = process.env.HUBSPOT_CLIENT_ID!;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET!;
  const redirectUri = process.env.HUBSPOT_REDIRECT_URI!;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });

  const resp = await fetch("https://api.hubapi.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await resp.json();

  if (!resp.ok) {
    return Response.json({ ok: false, hubspot: data }, { status: 400 });
  }

  // Baby-step: return tokens to prove the flow works.
  // Next step: store refresh_token securely, do not return it.
  return Response.json({ ok: true, tokens: data });
}
