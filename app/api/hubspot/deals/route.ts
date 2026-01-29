import { requireApiKey } from "../../../../src/lib/auth";
import { getValidAccessToken } from "../../../../src/lib/hubspotAuth";

export const runtime = "nodejs";

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
