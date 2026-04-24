// ============================================================
// invite-user — admin-only wrapper around Supabase auth admin.
//
// Hardened (audit 2026-04-23):
//   - Requires the caller's JWT to belong to a team_member with
//     'admin' permission. Previously open to anyone — meaning anyone
//     could spam invites OR pass team_member_id to rebind any
//     existing team_member.auth_id to an attacker-controlled user
//     (account takeover for that role).
//   - Locks CORS to the production origin.
// ============================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "https://mydash.media,http://localhost:5173,http://localhost:4173").split(",");

function corsFor(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
    "Vary": "Origin",
  };
}
function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

serve(async (req: Request) => {
  const cors = corsFor(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, cors);

  // Auth: caller's JWT must resolve to a team_members row with admin perm.
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Not authenticated" }, 401, cors);
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: u } = await userClient.auth.getUser();
  if (!u?.user?.id) return json({ error: "Not authenticated" }, 401, cors);
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: tm } = await adminClient
    .from("team_members").select("permissions").eq("auth_id", u.user.id).single();
  const isAdmin = Array.isArray(tm?.permissions) && tm.permissions.includes("admin");
  if (!isAdmin) return json({ error: "Admin permission required" }, 403, cors);

  try {
    const { email, team_member_id } = await req.json();
    if (!email) throw new Error("Email is required");

    const { data: { users } } = await adminClient.auth.admin.listUsers();
    const existing = users?.find((x: any) => x.email === email);
    if (existing) {
      if (team_member_id) {
        await adminClient.from("team_members").update({ auth_id: existing.id }).eq("id", team_member_id);
      }
      return json({ success: true, message: `${email} already has an account — linked.` }, 200, cors);
    }

    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email);
    if (error) throw new Error(error.message);
    if (team_member_id && data?.user?.id) {
      await adminClient.from("team_members").update({ auth_id: data.user.id }).eq("id", team_member_id);
    }
    return json({ success: true, message: `Invite sent to ${email}` }, 200, cors);
  } catch (err: any) {
    return json({ success: false, error: err?.message || "Unknown error" }, 400, cors);
  }
});
