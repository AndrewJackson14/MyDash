import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GCAL_BASE = "https://www.googleapis.com/calendar/v3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, x-action, x-calendar-id, x-event-id, x-time-min, x-time-max, x-max-results, x-page-token, x-query",
};

function getAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

async function getUserId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") || "");
  const { data: { user } } = await supabase.auth.getUser(token);
  return user?.id || null;
}

async function getAccessToken(userId: string): Promise<string> {
  const admin = getAdmin();
  const { data, error } = await admin.from("google_tokens").select("*").eq("user_id", userId).single();
  if (error || !data) throw new Error("Google account not connected");

  const expiry = new Date(data.token_expiry);
  if (expiry.getTime() - Date.now() > 300_000) {
    return data.access_token;
  }

  if (!data.refresh_token) throw new Error("No refresh token — reconnect Google account");

  const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: data.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const tokens = await refreshRes.json();
  if (!refreshRes.ok || !tokens.access_token) {
    await admin.from("google_tokens").delete().eq("user_id", userId);
    throw new Error("Token refresh failed — reconnect Google account");
  }

  const newExpiry = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString();
  await admin.from("google_tokens").update({
    access_token: tokens.access_token,
    token_expiry: newExpiry,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);

  return tokens.access_token;
}

async function gcalFetch(accessToken: string, path: string, options: RequestInit = {}) {
  const url = path.startsWith("http") ? path : `${GCAL_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Calendar API ${res.status}: ${err}`);
  }
  return res.json();
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const userId = await getUserId(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getAccessToken(userId);
    const action = req.headers.get("x-action") || "list-events";
    const calendarId = req.headers.get("x-calendar-id") || "primary";

    // ── LIST CALENDARS ──────────────────────────────────────
    if (action === "list-calendars") {
      const data = await gcalFetch(accessToken, "/users/me/calendarList");
      return new Response(JSON.stringify(data.items || []), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── LIST EVENTS ─────────────────────────────────────────
    if (action === "list-events") {
      const timeMin = req.headers.get("x-time-min") || new Date().toISOString();
      const timeMax = req.headers.get("x-time-max") || new Date(Date.now() + 30 * 86400000).toISOString();
      const maxResults = req.headers.get("x-max-results") || "250";
      const pageToken = req.headers.get("x-page-token") || "";
      const query = req.headers.get("x-query") || "";

      let url = `/calendars/${encodeURIComponent(calendarId)}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=${maxResults}&singleEvents=true&orderBy=startTime`;
      if (pageToken) url += `&pageToken=${pageToken}`;
      if (query) url += `&q=${encodeURIComponent(query)}`;

      const data = await gcalFetch(accessToken, url);
      return new Response(JSON.stringify({
        events: data.items || [],
        nextPageToken: data.nextPageToken || null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── GET EVENT ────────────────────────────────────────────
    if (action === "get-event") {
      const eventId = req.headers.get("x-event-id");
      if (!eventId) throw new Error("Missing x-event-id header");
      const data = await gcalFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CREATE EVENT ────────────────────────────────────────
    if (action === "create-event") {
      const body = await req.json();
      const data = await gcalFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── UPDATE EVENT ────────────────────────────────────────
    if (action === "update-event") {
      const eventId = req.headers.get("x-event-id");
      if (!eventId) throw new Error("Missing x-event-id header");
      const body = await req.json();
      const data = await gcalFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DELETE EVENT ─────────────────────────────────────────
    if (action === "delete-event") {
      const eventId = req.headers.get("x-event-id");
      if (!eventId) throw new Error("Missing x-event-id header");
      await fetch(`${GCAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── PUSH EVENT (create from MyDash data) ────────────────
    if (action === "push-event") {
      const body = await req.json();
      // Build Google Calendar event from MyDash event data
      const gcalEvent: any = {
        summary: body.title,
        description: body.notes || "",
        start: body.allDay
          ? { date: body.date }
          : { dateTime: `${body.date}T${body.time || "09:00"}:00`, timeZone: body.timeZone || "America/Los_Angeles" },
        end: body.allDay
          ? { date: body.endDate || body.date }
          : { dateTime: `${body.date}T${body.endTime || "10:00"}:00`, timeZone: body.timeZone || "America/Los_Angeles" },
      };
      if (body.location) gcalEvent.location = body.location;
      if (body.attendees) gcalEvent.attendees = body.attendees.map((e: string) => ({ email: e }));

      const data = await gcalFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: "POST",
        body: JSON.stringify(gcalEvent),
      });
      return new Response(JSON.stringify({ googleEventId: data.id, ...data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action: " + action }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
