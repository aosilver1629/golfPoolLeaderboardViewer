"use client";

import { useState, useRef, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  matchNamesToPlayers,
  type ApiPlayer,
  type NameMatch,
} from "@/lib/golfer-names";

interface SpreadsheetUploadProps {
  poolId: string;
  tournamentId: string | null;
}

interface ParsedEntry {
  entry_name: string;
  tiebreaker_score: number | null;
  picks: {
    golfer_name: string;
    pick_type: string;
  }[];
}

type Step = "upload" | "mapping" | "uploading" | "done";

export default function SpreadsheetUpload({
  poolId,
  tournamentId,
}: SpreadsheetUploadProps) {
  const [step, setStep] = useState<Step>("upload");
  const [rawEntries, setRawEntries] = useState<ParsedEntry[]>([]);
  const [apiPlayers, setApiPlayers] = useState<ApiPlayer[]>([]);
  const [nameMatches, setNameMatches] = useState<NameMatch[]>([]);
  // Admin overrides: rawName → playerId
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const router = useRouter();

  // ── Parse the Excel file ──────────────────────────────────

  function parseSpreadsheet(file: File): Promise<ParsedEntry[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);

          const entries: ParsedEntry[] = [];

          for (const row of json) {
            const keys = Object.keys(row);
            const entryName = String(row[keys[0]] || "").trim();
            if (!entryName) continue;

            const picks: { golfer_name: string; pick_type: string }[] = [];
            const pickTypes = [
              "group_a",
              "group_b",
              "group_c",
              "group_d",
            ];

            for (let i = 1; i <= 4 && i < keys.length; i++) {
              const golferName = String(row[keys[i]] || "").trim();
              if (golferName) {
                picks.push({ golfer_name: golferName, pick_type: pickTypes[i - 1] });
              }
            }

            for (let i = 5; i <= 7 && i < keys.length; i++) {
              const golferName = String(row[keys[i]] || "").trim();
              if (golferName) {
                picks.push({ golfer_name: golferName, pick_type: "wildcard" });
              }
            }

            const tiebreakerKey = keys[8] || keys[keys.length - 1];
            const tiebreaker = parseInt(String(row[tiebreakerKey]));

            entries.push({
              entry_name: entryName,
              tiebreaker_score: isNaN(tiebreaker) ? null : tiebreaker,
              picks,
            });
          }

          resolve(entries);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  // ── Fetch API players ─────────────────────────────────────

  const fetchApiPlayers = useCallback(async (): Promise<ApiPlayer[]> => {
    if (!tournamentId) return [];

    const [tournId, year] = tournamentId.split(":");
    if (!tournId || !year) return [];

    setLoadingPlayers(true);
    try {
      const res = await fetch(
        `/api/players?tournId=${tournId}&year=${year}`
      );
      if (!res.ok) {
        // Don't block the upload — just return empty
        console.warn("Could not fetch API players:", res.statusText);
        return [];
      }
      const data = await res.json();
      return data.players || [];
    } catch (err) {
      console.warn("Could not fetch API players:", err);
      return [];
    } finally {
      setLoadingPlayers(false);
    }
  }, [tournamentId]);

  // ── Handle file upload → go to mapping screen ─────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");

    try {
      const entries = await parseSpreadsheet(file);
      if (entries.length === 0) {
        setError("No entries found in the spreadsheet. Check the format.");
        return;
      }

      setRawEntries(entries);

      // Collect all golfer names
      const allNames = entries.flatMap((e) =>
        e.picks.map((p) => p.golfer_name)
      );

      // Fetch API players if we have a tournament ID
      let players: ApiPlayer[] = [];
      if (tournamentId) {
        players = await fetchApiPlayers();
        setApiPlayers(players);
      }

      // Run matching
      const matches = matchNamesToPlayers(allNames, players);
      setNameMatches(matches);
      setOverrides({});
      setStep("mapping");
    } catch {
      setError(
        "Failed to parse spreadsheet. Make sure it's a valid Excel file."
      );
    }
  }

  // ── Retry fetching players (if they weren't loaded initially) ──

  async function handleLoadPlayers() {
    const players = await fetchApiPlayers();
    if (players.length > 0) {
      setApiPlayers(players);
      // Re-run matching with the new player list
      const allNames = rawEntries.flatMap((e) =>
        e.picks.map((p) => p.golfer_name)
      );
      const matches = matchNamesToPlayers(allNames, players);
      setNameMatches(matches);
      setOverrides({});
    }
  }

  // ── Build the final raw→playerId mapping ──────────────────

  const finalMapping = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of nameMatches) {
      // Use override if admin set one, otherwise use auto-match
      const playerId = overrides[m.rawName] || m.match?.playerId || "";
      if (playerId) {
        map.set(m.rawName.toLowerCase(), playerId);
      }
    }
    return map;
  }, [nameMatches, overrides]);

  // ── Stats ─────────────────────────────────────────────────

  const stats = useMemo(() => {
    let matched = 0;
    let unmatched = 0;
    for (const m of nameMatches) {
      const hasOverride = !!overrides[m.rawName];
      const hasAutoMatch = !!m.match;
      if (hasOverride || hasAutoMatch) {
        matched++;
      } else {
        unmatched++;
      }
    }
    return { total: nameMatches.length, matched, unmatched };
  }, [nameMatches, overrides]);

  // ── Filtered matches for search ───────────────────────────

  const filteredMatches = useMemo(() => {
    if (!searchQuery) return nameMatches;
    const q = searchQuery.toLowerCase();
    return nameMatches.filter(
      (m) =>
        m.rawName.toLowerCase().includes(q) ||
        m.match?.displayName.toLowerCase().includes(q)
    );
  }, [nameMatches, searchQuery]);

  // ── Upload entries to database ────────────────────────────

  async function handleUpload() {
    setStep("uploading");
    setUploadProgress(0);
    setError("");

    const total = rawEntries.length;

    try {
      for (let idx = 0; idx < rawEntries.length; idx++) {
        const entry = rawEntries[idx];

        const { data: insertedEntry, error: entryError } = await supabase
          .from("entries")
          .insert({
            pool_id: poolId,
            entry_name: entry.entry_name,
            tiebreaker_score: entry.tiebreaker_score,
          })
          .select()
          .single();

        if (entryError || !insertedEntry) {
          throw new Error(
            `Failed to insert "${entry.entry_name}": ${entryError?.message}`
          );
        }

        const picksToInsert = entry.picks.map((pick) => ({
          entry_id: insertedEntry.id,
          golfer_name: pick.golfer_name,
          golfer_api_id:
            finalMapping.get(pick.golfer_name.toLowerCase()) || null,
          pick_type: pick.pick_type,
        }));

        const { error: picksError } = await supabase
          .from("entry_picks")
          .insert(picksToInsert);

        if (picksError) {
          throw new Error(
            `Failed to insert picks for "${entry.entry_name}": ${picksError.message}`
          );
        }

        setUploadProgress(Math.round(((idx + 1) / total) * 100));
      }

      setStep("done");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setStep("mapping");
    }
  }

  function handleReset() {
    setStep("upload");
    setRawEntries([]);
    setApiPlayers([]);
    setNameMatches([]);
    setOverrides({});
    setError("");
    setUploadProgress(0);
    setSearchQuery("");
    if (fileRef.current) fileRef.current.value = "";
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div>
      {error && (
        <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md mb-3 border border-red-200">
          {error}
        </div>
      )}

      {/* ─── Step 1: File Upload ─── */}
      {step === "upload" && (
        <div>
          <p className="text-xs text-slate-500 mb-2">
            Expected format: Col A = Team Name, B-E = Groups A-D, F-H =
            Wildcards, I = Tiebreaker
          </p>
          {!tournamentId && (
            <p className="text-xs text-amber-600 mb-2">
              Set a Tournament ID on this pool first so we can match golfer
              names to API players.
            </p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
            className="text-sm text-slate-500 file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
          />
        </div>
      )}

      {/* ─── Step 2: Mapping Screen ─── */}
      {step === "mapping" && (
        <div>
          {/* Header stats */}
          <div className="bg-slate-50 rounded-md p-3 mb-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">
                  {apiPlayers.length > 0
                    ? "Map Golfer Names to API Players"
                    : "Review Parsed Entries"}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {rawEntries.length} entries parsed &middot;{" "}
                  {stats.total} unique golfer names
                  {apiPlayers.length > 0 && (
                    <>
                      {" "}&middot;{" "}
                      <span className="text-green-600 font-medium">
                        {stats.matched} matched
                      </span>
                      {stats.unmatched > 0 && (
                        <>
                          {" "}&middot;{" "}
                          <span className="text-red-600 font-medium">
                            {stats.unmatched} unmatched
                          </span>
                        </>
                      )}
                    </>
                  )}
                </p>
              </div>
              {apiPlayers.length === 0 && tournamentId && (
                <button
                  onClick={handleLoadPlayers}
                  disabled={loadingPlayers}
                  className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-md hover:bg-blue-100 font-medium border border-blue-200 disabled:opacity-50 shrink-0"
                >
                  {loadingPlayers ? "Loading..." : "Retry Load Players"}
                </button>
              )}
            </div>
          </div>

          {/* Info banner when no API players loaded */}
          {apiPlayers.length === 0 && (
            <div className="text-amber-700 text-xs bg-amber-50 p-3 rounded-md mb-3 border border-amber-200">
              <strong>API players not loaded.</strong>{" "}
              {!tournamentId
                ? "Set a Tournament ID on this pool to enable player matching."
                : "The RAPIDAPI_KEY may not be configured yet, or the tournament data isn't available."}{" "}
              You can still upload entries now and map golfers to API players later
              when you run a sync.
            </div>
          )}

          {/* Search */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search names..."
            className="w-full px-3 py-1.5 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-2"
          />

          {/* Mapping list */}
          <div className="max-h-[420px] overflow-y-auto border border-slate-200 rounded-md divide-y divide-slate-100">
            {filteredMatches.map((m) => (
              <MappingRow
                key={m.rawName}
                match={m}
                apiPlayers={apiPlayers}
                override={overrides[m.rawName] || null}
                onOverride={(playerId) =>
                  setOverrides((prev) => ({
                    ...prev,
                    [m.rawName]: playerId,
                  }))
                }
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex justify-between mt-4">
            <button
              onClick={handleReset}
              className="text-sm text-slate-500 hover:text-slate-700 px-3 py-1"
            >
              Start Over
            </button>
            <button
              onClick={handleUpload}
              className="text-sm bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 font-medium disabled:opacity-50"
            >
              Upload {rawEntries.length} Entries
            </button>
          </div>
        </div>
      )}

      {/* ─── Uploading Progress ─── */}
      {step === "uploading" && (
        <div className="text-center py-6">
          <div className="w-full bg-slate-200 rounded-full h-3 mb-3">
            <div
              className="bg-green-600 h-3 rounded-full transition-all duration-200"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-sm text-slate-600">
            Uploading entries... {uploadProgress}%
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {Math.round((uploadProgress / 100) * rawEntries.length)} of{" "}
            {rawEntries.length} entries
          </p>
        </div>
      )}

      {/* ─── Done ─── */}
      {step === "done" && (
        <div className="text-center py-6">
          <div className="text-3xl mb-2">&#10003;</div>
          <p className="text-sm font-semibold text-green-700 mb-1">
            Upload Complete!
          </p>
          <p className="text-xs text-slate-500 mb-3">
            {rawEntries.length} entries uploaded with golfer API mappings.
          </p>
          <button
            onClick={handleReset}
            className="text-sm text-slate-500 hover:text-slate-700 underline"
          >
            Upload another file
          </button>
        </div>
      )}
    </div>
  );
}

// ── Individual Mapping Row ──────────────────────────────────

function MappingRow({
  match,
  apiPlayers,
  override,
  onOverride,
}: {
  match: NameMatch;
  apiPlayers: ApiPlayer[];
  override: string | null;
  onOverride: (playerId: string) => void;
}) {
  // Determine what's currently selected
  const selectedId = override || match.match?.playerId || "";
  const selectedPlayer = apiPlayers.find((p) => p.playerId === selectedId);
  const displayConfidence = override
    ? "high" // manual override = confident
    : match.confidence;

  const confColor =
    displayConfidence === "high"
      ? "bg-green-500"
      : displayConfidence === "medium"
      ? "bg-yellow-400"
      : "bg-red-400";

  const confLabel =
    displayConfidence === "high"
      ? "Matched"
      : displayConfidence === "medium"
      ? "Review"
      : "No match";

  return (
    <div className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50">
      {/* Confidence dot */}
      <div className="shrink-0 flex items-center gap-1.5" title={confLabel}>
        <div className={`w-2 h-2 rounded-full ${confColor}`} />
      </div>

      {/* Raw name + count */}
      <div className="flex-1 min-w-0">
        <span className="text-sm text-slate-800 font-medium truncate block">
          {match.rawName}
        </span>
        <span className="text-[10px] text-slate-400">
          {match.count} {match.count === 1 ? "pick" : "picks"}
        </span>
      </div>

      {/* Arrow */}
      <span className="text-slate-300 shrink-0">&rarr;</span>

      {/* API player selector */}
      <div className="shrink-0 w-56">
        {apiPlayers.length > 0 ? (
          <select
            value={selectedId}
            onChange={(e) => onOverride(e.target.value)}
            className={`w-full text-xs border rounded px-2 py-1.5 ${
              displayConfidence === "none"
                ? "border-red-300 bg-red-50"
                : displayConfidence === "medium"
                ? "border-yellow-300 bg-yellow-50"
                : "border-slate-300"
            }`}
          >
            <option value="">-- No match --</option>
            {apiPlayers
              .sort((a, b) => a.displayName.localeCompare(b.displayName))
              .map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {p.displayName}
                </option>
              ))}
          </select>
        ) : (
          <span className="text-xs text-slate-400 italic">
            {selectedPlayer
              ? selectedPlayer.displayName
              : "Load players first"}
          </span>
        )}
      </div>
    </div>
  );
}
