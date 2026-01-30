export function requireApiKey(req: Request): Response | null {
  const expectedRaw = process.env.SCOTSMAN_API_KEY;
  const expected = expectedRaw?.trim(); // IMPORTANT: trims whitespace/newlines

  if (!expected) {
    return Response.json({ ok: false, message: "Server not configured" }, { status: 500 });
  }

  const h = req.headers;

  // Accept multiple header conventions + trim
  const direct = (h.get("x-scotsman-key") || h.get("x-api-key") || "").trim();

  const authz = (h.get("authorization") || h.get("Authorization") || "").trim();
  const bearer = authz.toLowerCase().startsWith("bearer ")
    ? authz.slice(7).trim()
    : "";

  const provided = direct || bearer;

  if (!provided || provided !== expected) {
    return Response.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  return null; // authorized
}
