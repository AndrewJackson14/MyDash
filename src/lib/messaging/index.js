// Public surface of the messaging package.
//
// Schema lives in supabase/migrations/190_messaging_core_schema.sql.
// Tables: conversations, conversation_participants, conversation_messages,
// conversation_read_cursors. RLS keys to people(id) via my_person_id().
//
// Coexists with team_notes (the per-context "ping a team member" system).
// This is the richer chat surface for mobile + general DM/group use.
export { useConversations }   from "./useConversations";
export { useConvoMessages }   from "./useConvoMessages";
export { findDM, getOrCreateDM } from "./dm";
