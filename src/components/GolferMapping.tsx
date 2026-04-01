"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface GolferMappingProps {
  poolId: string;
}

interface UnmappedGolfer {
  golfer_name: string;
  count: number; // how many entry_picks use this name
}

interface ApiPlayer {
  playerId: string;
  firstName: string;
  lastName: string;
  displayName: string;
}

export default function GolferMapping({ poolId }: GolferMappingProps) {
  const [unmapped, setUnmapped] = useState<UnmappedGolfer[]>([]);
  const [apiPlayers, setApiPlayers] = useState<ApiPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingApi, setFetchingApi] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [showMapped, ] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  // Load unmapped golfers
  useEffect(() => {
    async function load() {
      setLoading(true);

      // Get all unique golfer names from entry_picks for this pool
      const { data: picks } = await supabase
        .from("entry_picks")
        .select("golfer_name, golfer_api_id, entry_id")
        .in(
          "entry_id",
          (
            await supabase
              .from("entries")
              .select("id")
              .eq("pool_id", poolId)
          ).data?.map((e: { id: string }) => e.id) || []
        );

      if (!picks) {
        setLoading(false);
        return;
      }

      // Count occurrences and group by name
      const nameMap = new Map<string, { count: number; hasApiId: boolean }>();
      for (const pick of picks) {
        const existing = nameMap.get(pick.golfer_name) || {
          count: 0,
          hasApiId: false,
        };
        existing.count++;
        if (pick.golfer_api_id) existing.hasApiId = true;
        nameMap.set(pick.golfer_name, existing);
      }

      const unmappedList: UnmappedGolfer[] = [];
      for (const [name, info] of nameMap) {
        if (!info.hasApiId) {
          unmappedList.push({ golfer_name: name, count: info.count });
        }
      }

      // Sort by count desc so most-picked golfers are at top
      unmappedList.sort((a, b) => b.count - a.count);
      setUnmapped(unmappedList);

      // Also load any existing tournament leaderboard data for auto-suggestions
      const { data: leaderboard } = await supabase
        .from("tournament_leaderboard")
        .select("golfer_name, golfer_api_id")
        .eq("pool_id", poolId);

      if (leaderboard && leaderboard.length > 0) {
        setApiPlayers(
          leaderboard.map((g: { golfer_name: string; golfer_api_id: string }) => ({
            playerId: g.golfer_api_id,
            firstName: g.golfer_name.split(" ")[0] || "",
            lastName: g.golfer_name.split(" ").slice(1).join(" ") || "",
            displayName: g.golfer_name,
          }))
        );
      }

      setLoading(false);
    }

    load();
  }, [poolId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-suggest: for each unmapped golfer, find the closest API player
  const suggestions = useMemo(() => {
    if (apiPlayers.length === 0) return {};
    const result: Record<string, ApiPlayer | null> = {};

    for (const golfer of unmapped) {
      const name = golfer.golfer_name.toLowerCase();
      const nameParts = name.split(/\s+/);
      const lastName = nameParts[nameParts.length - 1];

      // Try exact last name match first
      let match = apiPlayers.find((p) =>
        p.lastName.toLowerCase() === lastName ||
        p.displayName.toLowerCase() === name
      );

      // Try partial match
      if (!match) {
        match = apiPlayers.find((p) =>
          p.displayName.toLowerCase().includes(lastName) ||
          lastName.includes(p.lastName.toLowerCase())
        );
      }

      result[golfer.golfer_name] = match || null;
    }

    return result;
  }, [unmapped, apiPlayers]);

  // Fetch leaderboard from API to get player IDs
  async function handleFetchApi() {
    setFetchingApi(true);
    setError("");

    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pool_id: poolId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to sync leaderboard");
      }

      // Reload the leaderboard data
      const { data: leaderboard } = await supabase
        .from("tournament_leaderboard")
        .select("golfer_name, golfer_api_id")
        .eq("pool_id", poolId);

      if (leaderboard && leaderboard.length > 0) {
        setApiPlayers(
          leaderboard.map((g: { golfer_name: string; golfer_api_id: string }) => ({
            playerId: g.golfer_api_id,
            firstName: g.golfer_name.split(" ")[0] || "",
            lastName: g.golfer_name.split(" ").slice(1).join(" ") || "",
            displayName: g.golfer_name,
          }))
        );
        setSuccess(`Loaded ${leaderboard.length} players from the API.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch API data");
    } finally {
      setFetchingApi(false);
    }
  }

  // Apply a suggestion
  function handleApplySuggestion(golferName: string, player: ApiPlayer) {
    setMappings((prev) => ({
      ...prev,
      [golferName]: player.playerId,
    }));
  }

  // Apply all suggestions at once
  function handleApplyAllSuggestions() {
    const newMappings: Record<string, string> = { ...mappings };
    for (const [golferName, player] of Object.entries(suggestions)) {
      if (player && !newMappings[golferName]) {
        newMappings[golferName] = player.playerId;
      }
    }
    setMappings(newMappings);
  }

  // Save mappings to the database
  async function handleSave() {
    setSaving(true);
    setError("");

    try {
      // Get all entry IDs for this pool
      const { data: entries } = await supabase
        .from("entries")
        .select("id")
        .eq("pool_id", poolId);

      if (!entries) throw new Error("Failed to load entries");

      const entryIds = entries.map((e: { id: string }) => e.id);

      // For each mapping, update all matching entry_picks
      for (const [golferName, apiId] of Object.entries(mappings)) {
        if (!apiId) continue;

        const { error: updateError } = await supabase
          .from("entry_picks")
          .update({ golfer_api_id: apiId })
          .eq("golfer_name", golferName)
          .in("entry_id", entryIds);

        if (updateError) {
          throw new Error(
            `Failed to update mapping for ${golferName}: ${updateError.message}`
          );
        }
      }

      setSuccess(
        `Saved ${Object.keys(mappings).length} mappings. Run a sync to calculate points.`
      );
      setMappings({});
      router.refresh();

      // Reload unmapped list
      const remaining = unmapped.filter(
        (g) => !mappings[g.golfer_name]
      );
      setUnmapped(remaining);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // Filtered unmapped list
  const filteredUnmapped = useMemo(() => {
    if (!searchQuery) return unmapped;
    const q = searchQuery.toLowerCase();
    return unmapped.filter((g) => g.golfer_name.toLowerCase().includes(q));
  }, [unmapped, searchQuery]);

  const mappedCount = Object.keys(mappings).length;
  const suggestedCount = Object.values(suggestions).filter(Boolean).length;

  if (loading) {
    return (
      <div className="text-sm text-slate-500 py-2">
        Loading golfer data...
      </div>
    );
  }

  if (unmapped.length === 0 && !showMapped) {
    return (
      <div className="text-sm text-green-600 py-2">
        All golfers have been mapped to API player IDs.
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="bg-slate-50 rounded-md p-3">
        <h3 className="text-sm font-semibold text-slate-800 mb-1">
          Golfer API Mapping
        </h3>
        <p className="text-xs text-slate-600">
          {unmapped.length} golfers need API player IDs.
          {apiPlayers.length > 0 && (
            <>
              {" "}
              {suggestedCount} auto-suggestions available from the tournament
              leaderboard.
            </>
          )}
        </p>
      </div>

      {error && (
        <div className="text-red-600 text-sm bg-red-50 p-2 rounded-md border border-red-200">
          {error}
        </div>
      )}

      {success && (
        <div className="text-green-600 text-sm bg-green-50 p-2 rounded-md border border-green-200">
          {success}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleFetchApi}
          disabled={fetchingApi}
          className="text-xs bg-blue-50 text-blue-700 px-3 py-1.5 rounded-md hover:bg-blue-100 font-medium border border-blue-200 disabled:opacity-50"
        >
          {fetchingApi
            ? "Syncing..."
            : apiPlayers.length > 0
            ? "Refresh from API"
            : "Fetch Players from API"}
        </button>

        {suggestedCount > 0 && (
          <button
            onClick={handleApplyAllSuggestions}
            className="text-xs bg-green-50 text-green-700 px-3 py-1.5 rounded-md hover:bg-green-100 font-medium border border-green-200"
          >
            Apply All Suggestions ({suggestedCount})
          </button>
        )}

        {mappedCount > 0 && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs bg-green-600 text-white px-3 py-1.5 rounded-md hover:bg-green-700 font-medium disabled:opacity-50"
          >
            {saving ? "Saving..." : `Save ${mappedCount} Mappings`}
          </button>
        )}
      </div>

      {/* Search */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search golfer names..."
        className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
      />

      {/* Mapping list */}
      <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-md divide-y divide-slate-100">
        {filteredUnmapped.map((golfer) => {
          const suggestion = suggestions[golfer.golfer_name];
          const currentMapping = mappings[golfer.golfer_name];

          return (
            <div
              key={golfer.golfer_name}
              className={`p-2 ${
                currentMapping ? "bg-green-50" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-slate-800">
                    {golfer.golfer_name}
                  </span>
                  <span className="text-[10px] text-slate-400 ml-1">
                    ({golfer.count} picks)
                  </span>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {currentMapping ? (
                    <span className="text-xs text-green-600 font-mono">
                      ID: {currentMapping}
                    </span>
                  ) : suggestion ? (
                    <button
                      onClick={() =>
                        handleApplySuggestion(golfer.golfer_name, suggestion)
                      }
                      className="text-xs bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded border border-yellow-200 hover:bg-yellow-100"
                    >
                      Map to: {suggestion.displayName} (
                      {suggestion.playerId})
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-400 italic">
                      No match found
                    </span>
                  )}

                  {/* Manual API ID input */}
                  {apiPlayers.length > 0 && (
                    <select
                      value={currentMapping || ""}
                      onChange={(e) => {
                        if (e.target.value) {
                          setMappings((prev) => ({
                            ...prev,
                            [golfer.golfer_name]: e.target.value,
                          }));
                        }
                      }}
                      className="text-xs border border-slate-300 rounded px-1 py-0.5 max-w-[180px]"
                    >
                      <option value="">Select player...</option>
                      {apiPlayers
                        .sort((a, b) =>
                          a.displayName.localeCompare(b.displayName)
                        )
                        .map((p) => (
                          <option key={p.playerId} value={p.playerId}>
                            {p.displayName} ({p.playerId})
                          </option>
                        ))}
                    </select>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredUnmapped.length === 0 && searchQuery && (
        <p className="text-xs text-slate-400 text-center py-2">
          No golfers match &quot;{searchQuery}&quot;
        </p>
      )}
    </div>
  );
}
