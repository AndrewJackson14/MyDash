import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify the caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");

    const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "");
    const { data: { user: caller } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!caller) throw new Error("Invalid session");

    // Verify caller is admin/publisher
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: callerMember } = await adminClient
      .from("team_members")
      .select("permissions, role")
      .eq("auth_id", caller.id)
      .single();

    const isAdmin = callerMember?.permissions?.includes("admin") ||
      ["Publisher", "Editor-in-Chief"].includes(callerMember?.role);
    if (!isAdmin) throw new Error("Only admins can invite users");

    // Get the request body
    const { email, team_member_id } = await req.json();
    if (!email) throw new Error("Email is required");

    // Check if user already exists in auth
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((u: any) => u.email === email);
    if (existing) {
      // User exists — just link auth_id to team member
      if (team_member_id) {
        await adminClient
          .from("team_members")
          .update({ auth_id: existing.id })
          .eq("id", team_member_id);
      }
      return new Response(
        JSON.stringify({ success: true, already_exists: true, message: "User already has an account — linked to team member" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Invite the user — Supabase sends a magic link email
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${SUPABASE_URL.replace('.supabase.co', '')}.supabase.co`,
      data: { team_member_id },
    });

    if (inviteError) throw new Error(inviteError.message);

    // Link the new auth user to the team member
    if (team_member_id && inviteData?.user?.id) {
      await adminClient
        .from("team_members")
        .update({ auth_id: inviteData.user.id })
        .eq("id", team_member_id);
    }

    return new Response(
      JSON.stringify({ success: true, message: `Invite sent to ${email}` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
