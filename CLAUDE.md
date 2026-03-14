# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Live leaderboard for an offline golf pool (Players Championship). Entries were submitted via Excel spreadsheet; admin uploads them. Users join via invite code and track standings in real time.

---

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build (runs type-check + Next.js build)
npm run lint     # ESLint (next lint)
npm run start    # Start production server (after build)
```

No test suite is configured. Type-check via `npm run build` or `npx tsc --noEmit`.

**After building any new feature — deploy to production:**
```bash
npm run build          # verify no type errors before committing
git add .
git commit -m "describe what changed"
git push
```
Pushing to `main` triggers an automatic Vercel redeploy.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Auth + DB | Supabase (email/password auth, PostgreSQL) |
| Golf Data | Slash Golf API via RapidAPI (`live-golf-data.p.rapidapi.com`) |
| Scheduled Sync | Vercel Cron → `/api/cron/sync` |
| Hosting | Vercel |
| Node | 22 (see `.nvmrc`) |

---

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SLASH_GOLF_API_KEY=        # RapidAPI key for live-golf-data
CRON_SECRET=               # Shared secret for cron auth header
```

`golf-api.ts` reads `process.env.RAPIDAPI_KEY || process.env.SLASH_GOLF_API_KEY` — use either name.

---

## Key Files

```
src/
  app/
    (auth)/
      login/page.tsx        Email/password login
      signup/page.tsx       Registration
    (dashboard)/
      page.tsx              Main leaderboard (home)
      admin/page.tsx        Admin-only page
      join/page.tsx         Join pool via invite code
      my-entries/page.tsx   View + claim your entries
    api/
      players/route.ts      GET /api/players?tournId=011&year=2026
                            Fetches player list from /field or /leaderboard
      sync/route.ts         POST /api/sync { pool_id }
                            Admin-triggered leaderboard sync + points calc
      cron/sync/route.ts    Vercel Cron-triggered sync (calls same logic)
  components/
    AdminPanel.tsx          Admin UI: create pool, upload entries, sync
    SpreadsheetUpload.tsx   Excel upload → golfer name mapping → DB insert
    GolferMapping.tsx       Step 2 of upload: name mapping review + override UI
    LeaderboardTable.tsx    Main standings table UI
    ClaimEntry.tsx          UI for users to claim their entry
    Navbar.tsx
  lib/
    golf-api.ts             Slash Golf API client (fetchLeaderboard, fetchField)
    golfer-names.ts         Name matching engine (Levenshtein + aliases)
    points.ts               Points calculation with tie averaging
    types/database.ts       Supabase DB types (untyped client used at runtime to avoid build issues)
    supabase/
      client.ts             Browser Supabase client
      server.ts             Server Supabase client + service role client
      middleware.ts         Auth session refresh
  middleware.ts             Route protection

supabase/schema.sql         Full DB schema + RLS policies (run in Supabase SQL editor)
vercel.json                 Cron config: hourly Thu-Sat, every 10min Sunday, 9AM-6PM UTC
```

---

## Slash Golf API — Critical Details

**Base URL:** `https://live-golf-data.p.rapidapi.com`

**Headers required:**
```
x-rapidapi-key: <SLASH_GOLF_API_KEY>
x-rapidapi-host: live-golf-data.p.rapidapi.com
```

**Leaderboard endpoint:**
```
GET /leaderboard?orgId=1&tournId=011&year=2026
```
- `orgId=1` is **required** for PGA Tour — omitting it returns no data
- `tournId` for The Players Championship is `011`
- Response: players are in `data.leaderboardRows` (not `data.leaderboard`)

**Field endpoint (pre-tournament):**
```
GET /field?orgId=1&tournId=011&year=2026
```

**`LeaderboardPlayer` interface** (actual API shapes):
```typescript
{
  playerId: string;
  firstName: string;
  lastName: string;
  position: string;     // "1", "T3", "CUT", "WD", "DQ"
  total: string;        // score to par: "-12", "+3", "E", "-"
  currentRound: number;
  thru: string;         // "F", "12", "-"
  status: string;       // "complete" | "cut" | "wd"
}
```

**MongoDB Extended JSON:** The API is backed by MongoDB and leaks its internal number serialization via RapidAPI. Numeric fields like `currentRound` and `playerId` may arrive as `{"$numberInt":"2"}` instead of `2`. The sync route has `unwrapMongoNumber()` and `unwrapMongoString()` helpers in `sync/route.ts` to handle this — always use them when reading API fields into DB columns.

**Parsing helpers in `sync/route.ts`:**
- `parsePosition("T3")` → `3`, `"CUT"/"WD"` → `null`
- `parseScoreToPar("-12")` → `-12`, `"E"` → `0`, `"-"` → `0`
- `isEliminated`: `status === "cut" || "wd" || "dq"` (NOT `status === "active"`)

**`/api/players` route** tries `/field` first (pre-tournament), falls back to `/leaderboard`. Returns `{ players: [{playerId, firstName, lastName, displayName}], source }`.

---

## Database Schema (key tables)

| Table | Purpose |
|-------|---------|
| `profiles` | Extends `auth.users` — `is_admin` boolean |
| `pools` | Each pool has `tournament_id` (format: `"011:2026"`), `invite_code`, `status` |
| `entries` | One row per team submission — `entry_name`, `tiebreaker_score`, `total_points`, `rank` |
| `entry_picks` | 7 picks per entry — `golfer_name`, `golfer_api_id`, `pick_type`, `current_points` |
| `tournament_leaderboard` | Cached API data — `position` (int\|null), `position_display` (string), `score_to_par` |
| `points_table` | Per-pool points mapping: `position_start`, `position_end`, `points` |
| `pool_members` | Users who joined a pool via invite code — `pool_id`, `user_id` |
| `groups` | Groups A/B/C/D per pool |
| `group_golfers` | Golfers assigned to each group |

**`tournament_id` format:** `"tournId:year"` e.g. `"011:2026"` — split on `:` in sync route.

---

## Pool Rules

- **7 golfers per entry**: 1 from each group A/B/C/D + 3 wildcards
- **Groups (Players Championship 2026):**
  - A: Scheffler, McIlroy, Fleetwood, Rose, Morikawa, Gotterup
  - B: Henley, MacIntyre, Spaun, Schauffele, Griffin, Matsuyama
  - C: Straka, Thomas, English, Noren, Hovland, Bridgeman
  - D: Bradley, Young, Fitzpatrick, Aberg, McNealy, Gerard
- **Points:** 1st=320, 2nd=270, 3rd=230 … 70-74=11, 75+=10, CUT=0
- **Ties:** Points averaged across tied positions (e.g. T3 with 2 golfers → avg of 3rd + 4th place points)
- **Tiebreaker:** Predicted total score of champion (closest wins)
- **Prizes:** 1 award per 17 entries

---

## Sync Flow

```
POST /api/sync { pool_id }
  1. Auth check: cron Bearer token OR authenticated admin user
  2. Parse pool.tournament_id → tournId + year
  3. fetchLeaderboard(tournId, year)  ← hits Slash Golf API
  4. Bulk upsert all players into tournament_leaderboard (single call)
  5. calculateGolferPoints(leaderboard, pointsTable)  ← handles ties
  6. For each entry_pick: look up points by golfer_api_id (in memory)
  7. Bulk upsert all entry_picks.current_points (single call)
  8. Update entries.total_points via Promise.all (parallel, not sequential)
  9. Recalculate ranks in memory, update via Promise.all
```

**Performance:** All DB writes are batched or parallelized — do not revert to sequential `await` loops. With 190 entries × 7 picks the sequential approach causes Vercel timeouts and local hangs.

**Supabase upsert gotcha:** `upsert` validates NOT NULL constraints for the INSERT path even when the row already exists. Either include all NOT NULL columns in the payload, or use `.update().eq("id", id)` instead (which only patches specified columns).

---

## Spreadsheet Upload Flow (SpreadsheetUpload.tsx)

```
Step 1 — File drop:
  - Parse Excel with xlsx library
  - Extract: entry_name, golfer columns (A/B/C/D + 3 wildcards), tiebreaker
  - Simultaneously fetch /api/players to get API player list

Step 2 — Name mapping screen:
  - matchNamesToPlayers(rawNames, apiPlayers) auto-matches with confidence:
      "high"   = alias match / exact last name / fuzzy dist ≤ 2
      "medium" = fuzzy match dist > 2
      "none"   = no match found
  - Color-coded dots (green/yellow/red)
  - Dropdown to override any auto-match
  - Shows count of entries using each name

Upload — inserts entries + entry_picks with golfer_api_id resolved inline
```

---

## Golfer Name Matching (golfer-names.ts)

Matching priority for each raw spreadsheet name:
1. `FULL_NAME_OVERRIDES` lookup (e.g. `"SW Kim"` → `"Si Woo Kim"`)
2. Exact normalized full-name match against API players
3. Last-name match with `LAST_NAME_ALIASES` (e.g. `"schauffle"` → `"schauffele"`)
4. If multiple players share last name → try first initial
5. Fuzzy Levenshtein on last name (threshold: max 2 or 30% of name length)
6. Fuzzy Levenshtein on full normalized name

---

## Cron Schedule (vercel.json)

```json
"0 14-23 * * 4-6"    → hourly Thu–Sat 9AM–6PM EST (UTC-5)
"*/10 14-23 * * 0"   → every 10 min Sunday 9AM–6PM EST
```

The cron route at `/api/cron/sync` calls all active pools' sync in sequence.
Auth: `Authorization: Bearer <CRON_SECRET>` header.

---

## Admin Panel Tabs (per pool)

1. **Upload Entries** — `SpreadsheetUpload` component
2. **Sync & Refresh** — manual trigger for `/api/sync`

Admin can also change pool status (upcoming → active → completed) and sees the invite code.

---

## Known Limitations

- `total_score` (total strokes) is stored as `null` — API doesn't return it cleanly
- Tiebreaker in rank calculation compares `total_points` only (`tiebreaker_score` not yet used in rank sort)
- Groups seeded with hardcoded Players Championship 2026 names on pool creation
