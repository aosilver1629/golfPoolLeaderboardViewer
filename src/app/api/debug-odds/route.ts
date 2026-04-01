import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ODDS_API_KEY not set" });
  }

  const url = `https://api.the-odds-api.com/v4/sports?apiKey=${apiKey}&all=true`;

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (err) {
    return NextResponse.json({ error: "fetch threw", detail: String(err) });
  }

  const text = await res.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = text; }

  const golfKeys = Array.isArray(body)
    ? body.filter((s: { group?: string }) => s.group === "Golf")
    : body;

  return NextResponse.json({
    status: res.status,
    ok: res.ok,
    golf_sports: golfKeys,
  });
}
