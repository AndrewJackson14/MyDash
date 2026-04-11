import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, team_member_id } = await req.json();
    if (!email) throw new Error("Email is required");

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if auth user already exists
    const { data: { users } } = await adminClient.auth.admin.listUsers();
    const existing = users?.find((u: any) => u.email === email);

    if (existing) {
      // Link auth_id to team member
      if (team_member_id) {
        await adminClient.from("team_members").update({ auth_id: existing.id }).eq("id", team_member_id);
      }
      return new Response(
        JSON.stringify({ success: true, message: `${email} already has an account — linked.` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Invite new user
    const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email);
    if (error) throw new Error(error.message);

    // Link auth_id
    if (team_member_id && data?.user?.id) {
      await adminClient.from("team_members").update({ auth_id: data.user.id }).eq("id", team_member_id);
    }

    return new Response(
      JSON.stringify({ success: true, message: `Invite sent to ${email}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Unknown error" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
