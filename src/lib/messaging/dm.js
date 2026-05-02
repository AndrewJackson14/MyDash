// findDM / getOrCreateDM — 1:1 conversation lookup with lazy creation.
// Ported from /messaging/lib/dm.js with one important change: the
// portable package's getOrCreateDM did a two-step client INSERT
// (conversations + participants) which hit RLS chicken-and-egg
// problems with the SELECT policy on conversations (RETURNING ran
// the SELECT-USING predicate before participants existed). The
// MyDash side calls a SECURITY DEFINER RPC start_dm(p_other) that
// performs both inserts atomically with privileges bypass-style.
//
// Both ids are people.id; caller resolves auth.uid() → people.id
// upstream (typically currentUser.id from useAuth's teamMember).

import { supabase } from "../supabase";

export async function findDM(currentPersonId, otherPersonId) {
  if (!currentPersonId || !otherPersonId || currentPersonId === otherPersonId) return null;
  const { data: mine } = await supabase
    .from("conversation_participants")
    .select("conversation_id, conversation:conversations!inner(type)")
    .eq("member_id", currentPersonId);
  const dmIds = (mine || []).filter(p => p.conversation?.type === "dm").map(p => p.conversation_id);
  if (dmIds.length === 0) return null;
  const { data: theirs } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("member_id", otherPersonId)
    .in("conversation_id", dmIds);
  return theirs?.[0]?.conversation_id || null;
}

export async function getOrCreateDM(currentPersonId, otherPersonId) {
  if (!currentPersonId || !otherPersonId || currentPersonId === otherPersonId) {
    throw new Error("Invalid participants");
  }
  const { data, error } = await supabase.rpc("start_dm", { p_other: otherPersonId });
  if (error) throw new Error(error.message || "Failed to start conversation");
  if (!data) throw new Error("start_dm returned no id");
  return data;
}
