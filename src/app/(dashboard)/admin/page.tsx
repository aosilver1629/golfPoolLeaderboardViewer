import { createServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminPanel from "@/components/AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/");

  // Get pools created by this admin
  const { data: pools } = await supabase
    .from("pools")
    .select("*")
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Admin Panel</h1>
      <AdminPanel pools={pools || []} userId={user.id} />
    </div>
  );
}
