// ============================================================
// Per-entity message thread helpers.
//
// `message_threads` carries a polymorphic (ref_type, ref_id) pair so
// any entity (ad_project, story, sale, client, legal_notice, …) can
// own its own thread without a dedicated FK column on each table.
// Use these helpers to look up / lazily create a thread for a given
// (refType, refId) — <EntityThread /> builds on top of this.
// ============================================================
import { supabase } from "./supabase";

export async function getThread(refType, refId) {
  if (!refType || !refId) return null;
  const { data, error } = await supabase
    .from("message_threads")
    .select("*")
    .eq("ref_type", refType)
    .eq("ref_id", refId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function getOrCreateThread({ refType, refId, title, participants }) {
  const existing = await getThread(refType, refId);
  if (existing) return existing;
  const { data, error } = await supabase
    .from("message_threads")
    .insert({
      // `type` is the legacy column; keep it populated so anything
      // reading the old field still works until that path is retired.
      type: refType,
      ref_type: refType,
      ref_id: refId,
      title: title || null,
      participants: Array.isArray(participants) ? participants.filter(Boolean) : [],
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function postSystemMessage(threadId, body) {
  if (!threadId || !body) return null;
  const { data, error } = await supabase
    .from("messages")
    .insert({ thread_id: threadId, sender_name: "System", body, is_system: true })
    .select()
    .single();
  if (error) throw error;
  return data;
}
