"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function JoinPoolPage() {
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError("You must be logged in.");
      setLoading(false);
      return;
    }

    // Find pool by invite code
    const { data: pool, error: poolError } = await supabase
      .from("pools")
      .select("id, name")
      .eq("invite_code", inviteCode.trim())
      .single();

    if (poolError || !pool) {
      setError("Invalid invite code. Please check and try again.");
      setLoading(false);
      return;
    }

    // Check if already a member
    const { data: existing } = await supabase
      .from("pool_members")
      .select("id")
      .eq("pool_id", pool.id)
      .eq("user_id", user.id)
      .single();

    if (existing) {
      setError("You're already a member of this pool.");
      setLoading(false);
      return;
    }

    // Join the pool
    const { error: joinError } = await supabase
      .from("pool_members")
      .insert({ pool_id: pool.id, user_id: user.id });

    if (joinError) {
      setError("Failed to join pool. Please try again.");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Join a Pool</h1>

      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-slate-500 text-sm mb-4">
          Enter the invite code shared by your pool administrator.
        </p>

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label
              htmlFor="code"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Invite Code
            </label>
            <input
              id="code"
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg tracking-widest text-center uppercase"
              placeholder="ENTER CODE"
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50 font-medium"
          >
            {loading ? "Joining..." : "Join Pool"}
          </button>
        </form>
      </div>
    </div>
  );
}
