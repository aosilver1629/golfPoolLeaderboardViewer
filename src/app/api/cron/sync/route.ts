import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Cron endpoint for automated leaderboard syncing.
 * Schedule:
 *   Thu-Sat: Every 60 minutes, 9 AM - 6 PM EST
 *   Sunday:  Every 10 minutes, 9 AM - 6 PM EST
 *
 * Vercel cron config (in vercel.json):
 *   "0 14-23 * * 4-6" (hourly Thu-Sat, UTC = EST+5)
 *   "* /10 14-23 * * 0" (every 10 min Sunday, UTC = EST+5)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if we're within tournament hours (9 AM - 6 PM EST)
  const now = new Date();
  const estHour = new Date(
    now.toLocaleString("en-US", { timeZone: "America/New_York" })
  ).getHours();

  if (estHour < 9 || estHour >= 18) {
    return NextResponse.json({ skipped: true, reason: "Outside tournament hours" });
  }

  const supabase = createServiceRoleClient();

  // Find all active pools
  const { data: pools } = await supabase
    .from("pools")
    .select("id")
    .eq("status", "active");

  if (!pools || pools.length === 0) {
    return NextResponse.json({ skipped: true, reason: "No active pools" });
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
  const results = [];

  for (const pool of pools) {
    try {
      const res = await fetch(`${baseUrl}/api/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
        body: JSON.stringify({ pool_id: pool.id }),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        results.push({ pool_id: pool.id, http_status: res.status, error: `Non-JSON response: ${text.slice(0, 500)}` });
        continue;
      }
      results.push({ pool_id: pool.id, http_status: res.status, ...data });
    } catch (error) {
      results.push({
        pool_id: pool.id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ results, synced_at: new Date().toISOString(), base_url: baseUrl });
}
