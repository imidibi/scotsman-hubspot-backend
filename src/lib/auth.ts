export function requireApiKey(req: Request): Response | null {
  const expected = process.env.SCOTSMAN_API_KEY;
  if (!expected) {
    // Fail closed in production; but this makes misconfig obvious
    return Response.json({ ok: false, message: "Server not configured" }, { status: 500 });
  }

  const got = req.headers.get("x-scotsman-key");
  if (!got || got !== expected) {
    return Response.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  return null;
}
