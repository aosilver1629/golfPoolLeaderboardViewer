"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { DEFAULT_POINTS_TABLE } from "@/lib/points";
import SpreadsheetUpload from "./SpreadsheetUpload";

interface Pool {
  id: string;
  name: string;
  status: string;
  invite_code: string;
  tournament_id: string | null;
  created_at: string;
}

interface AdminPanelProps {
  pools: Pool[];
  userId: string;
}

export default function AdminPanel({ pools, userId }: AdminPanelProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [poolName, setPoolName] = useState("");
  const [tournamentId, setTournamentId] = useState("");
  const [creating, setCreating] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  function generateInviteCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  async function handleCreatePool(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);

    const inviteCode = generateInviteCode();

    const { data: pool, error } = await supabase
      .from("pools")
      .insert({
        name: poolName,
        tournament_id: tournamentId || null,
        invite_code: inviteCode,
        created_by: userId,
      })
      .select()
      .single();

    if (error) {
      alert("Failed to create pool: " + error.message);
      setCreating(false);
      return;
    }

    // Seed the default points table
    const pointsRows = DEFAULT_POINTS_TABLE.map((row) => ({
      pool_id: pool.id,
      position_start: row.position_start,
      position_end: row.position_end,
      points: row.points,
    }));

    await supabase.from("points_table").insert(pointsRows);

    // Also add admin as a pool member
    await supabase
      .from("pool_members")
      .insert({ pool_id: pool.id, user_id: userId });

    // Seed the default groups
    const groupNames = ["A", "B", "C", "D"];
    const groupGolfers: Record<string, string[]> = {
      A: ["Scheffler", "McIlroy", "Fleetwood", "Rose", "Morikawa", "Gotterup"],
      B: ["Henley", "MacIntyre", "Spaun", "Schauffele", "Griffin", "Matsuyama"],
      C: ["Straka", "Thomas", "English", "Noren", "Hovland", "Bridgeman"],
      D: ["Bradley", "Young", "Fitzpatrick", "Aberg", "McNealy", "Gerard"],
    };

    for (let i = 0; i < groupNames.length; i++) {
      const { data: group } = await supabase
        .from("groups")
        .insert({
          pool_id: pool.id,
          name: groupNames[i],
          sort_order: i,
        })
        .select()
        .single();

      if (group) {
        const golfers = groupGolfers[groupNames[i]].map((name) => ({
          group_id: group.id,
          golfer_name: name,
        }));
        await supabase.from("group_golfers").insert(golfers);
      }
    }

    setShowCreate(false);
    setPoolName("");
    setTournamentId("");
    setCreating(false);
    router.refresh();
  }

  async function handleStatusChange(poolId: string, status: string) {
    await supabase.from("pools").update({ status }).eq("id", poolId);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Create Pool */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">Pools</h2>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 text-sm font-medium"
          >
            {showCreate ? "Cancel" : "Create Pool"}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={handleCreatePool} className="space-y-3 mb-6 p-4 bg-slate-50 rounded-md">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Pool Name
              </label>
              <input
                type="text"
                value={poolName}
                onChange={(e) => setPoolName(e.target.value)}
                required
                placeholder="e.g., 2026 Players Championship Pool"
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Tournament ID (Slash Golf)
              </label>
              <input
                type="text"
                value={tournamentId}
                onChange={(e) => setTournamentId(e.target.value)}
                placeholder="e.g., R2026011"
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <p className="text-xs text-slate-400 mt-1">
                Optional. Set this when you have your Slash Golf API key.
              </p>
            </div>
            <button
              type="submit"
              disabled={creating}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
            >
              {creating ? "Creating..." : "Create Pool"}
            </button>
          </form>
        )}

        {/* Pool list */}
        <div className="space-y-4">
          {pools.map((pool) => (
            <PoolCard
              key={pool.id}
              pool={pool}
              onStatusChange={handleStatusChange}
            />
          ))}

          {pools.length === 0 && (
            <p className="text-slate-500 text-sm">
              No pools yet. Create one to get started.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Pool Card with Tabs ─────────────────────────────────────

type PoolTab = "entries" | "sync";

function PoolCard({
  pool,
  onStatusChange,
}: {
  pool: Pool;
  onStatusChange: (poolId: string, status: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<PoolTab>("entries");
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);

    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pool_id: pool.id }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Sync failed");
      }

      setSyncResult(
        `Synced ${data.golfers_updated} golfers, ${data.entries_updated} entries at ${new Date(data.synced_at).toLocaleTimeString()}`
      );
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const tabs: { key: PoolTab; label: string }[] = [
    { key: "entries", label: "Upload Entries" },
    { key: "sync", label: "Sync & Refresh" },
  ];

  return (
    <div className="border border-slate-200 rounded-md p-4">
      {/* Pool header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
        <div>
          <h3 className="font-semibold text-slate-900">{pool.name}</h3>
          <p className="text-xs text-slate-500">
            Invite Code:{" "}
            <span className="font-mono font-bold text-green-700">
              {pool.invite_code}
            </span>
          </p>
          {pool.tournament_id && (
            <p className="text-xs text-slate-400">
              Tournament: {pool.tournament_id}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={pool.status}
            onChange={(e) => onStatusChange(pool.id, e.target.value)}
            className="text-sm border border-slate-300 rounded-md px-2 py-1"
          >
            <option value="upcoming">Upcoming</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 mb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`text-xs px-3 py-2 font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-green-600 text-green-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "entries" && (
        <SpreadsheetUpload poolId={pool.id} tournamentId={pool.tournament_id} />
      )}

      {activeTab === "sync" && (
        <div className="space-y-3">
          <div className="bg-slate-50 rounded-md p-3">
            <h4 className="text-sm font-semibold text-slate-800 mb-1">
              Leaderboard Sync
            </h4>
            <p className="text-xs text-slate-600">
              Fetch the latest tournament data from the Slash Golf API, calculate
              points, and update the leaderboard.
            </p>
            {!pool.tournament_id && (
              <p className="text-xs text-amber-600 mt-1">
                Set a Tournament ID first (format: tournId:year, e.g. 011:2026).
              </p>
            )}
          </div>

          <button
            onClick={handleSync}
            disabled={syncing || !pool.tournament_id}
            className="text-sm bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 font-medium"
          >
            {syncing ? "Syncing..." : "Sync Now"}
          </button>

          {syncResult && (
            <div className="text-green-600 text-sm bg-green-50 p-2 rounded-md border border-green-200">
              {syncResult}
            </div>
          )}

          {syncError && (
            <div className="text-red-600 text-sm bg-red-50 p-2 rounded-md border border-red-200">
              {syncError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
