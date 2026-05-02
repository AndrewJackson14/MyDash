# Portable messaging package

Self-contained 1:1 + group messaging for Supabase + React. Extracted from
HALO Leadership on 2026-05-01. Drop into another React + Vite + Supabase
project, swap the user-table reference, and you have a working chat
backend with realtime, file attachments, read cursors, and disappearing
messages.

The UI components are NOT included — they're skinned and entangled with
HALO-specific surfaces (rank badges, alerts pane, member-code styling).
Build your own list/conversation views over the hooks documented below.

## What's in here

```
schema/
  0001_messaging_schema.sql      Tables, indexes, FKs, RLS-friendly
  0002_push_trigger.sql          On-INSERT trigger that http_posts to send-push
hooks/
  useConversations.js            Conversation list + unread counts
  useConvoMessages.js            One conversation's messages + realtime
lib/
  dm.js                          findDM / getOrCreateDM (1:1 lookup, lazy create)
edge-functions/send-push/
  index.ts                       Resends-equivalent for push delivery (optional)
```

## Required swap-outs

There is exactly one identifier you must change to make this work in your
host app: `members`. The hooks and the FK constraints reference a
`public.members` table as the user-record table. In the host app, replace
that with whatever your users live in (`profiles`, `users`, etc.).

### Schema swap

In `schema/0001_messaging_schema.sql`, search-and-replace:

- `REFERENCES public.members(id)` → `REFERENCES public.YOUR_USER_TABLE(id)`
- `members(id, member_code, rank, first_name)` (in the embedded selects)
  → whatever shape your user table exposes

The FK is on:
- `conversation_participants.member_id`
- `conversation_messages.sender_id`
- `conversations.created_by`
- `conversation_read_cursors.member_id`

### Hooks swap

The hooks project the same shape via PostgREST embeds. In
`useConvoMessages.js` and `useConversations.js`, search-and-replace:

```js
// HALO version
sender:members!conversation_messages_sender_id_fkey(id, member_code, rank, first_name)

// Generic version (example)
sender:profiles!conversation_messages_sender_id_fkey(id, display_name, avatar_url)
```

The hook itself doesn't care what fields you project — your UI will read
whatever you select.

### Push trigger swap

In `schema/0002_push_trigger.sql`, replace the hardcoded project URL
with your host project's edge-function URL, and replace the service
role JWT placeholder. The trigger fires `net.http_post` to a
`send-push` edge function — if you don't need push, skip this file
entirely; messaging works without it.

## What you DON'T need to keep from HALO

These pieces of HALO live alongside the messaging system but are NOT
part of it:

- `dm-permissions.js` — gates DMs by rank/training; replace or drop
- `MessagesCard.jsx`, `HaloComMessaging.jsx`, `HaloComConversation.jsx`,
  `HaloComAlerts.jsx` — UI; rewrite to your design system
- `notifications` table — separate notification system, unrelated
- `email_queue` and the drainer — separate email pipeline, unrelated
- `leader_messages` — old DM table, deprecated and absent in this extract
- `appointments`, `feedback` — HALO-specific application surfaces in HaloComAlerts

## Hook contracts

### `useConversations(memberId)`

```js
const { conversations, loading, reload, setConversations } = useConversations(currentUserId)
```

Returns conversations the user is a participant in, each with:
- `id`, `type` ('dm' | 'group' | 'room'), `name`, `description`,
  `disappearing_timer`, `created_at`, `updated_at`
- `participants` — array of joined user records (excluding caller)
- `lastMessage` — most recent `conversation_messages` row
- `unread` — count of messages from others after caller's read cursor
- `displayName` — name (for groups) or comma-joined participant
  `first_name` (for dms)

### `useConvoMessages(conversationId, memberId)`

```js
const { messages, loading, sendMessage, sendFileMessage, editMessage, setMessages } =
  useConvoMessages(conversationId, currentUserId)
```

- Loads up to 200 most-recent messages
- Realtime subscription on the conversation_id channel (INSERT, UPDATE, DELETE)
- Auto-updates the caller's `conversation_read_cursors` on load and on new
  incoming message
- Dispatches `window.CustomEvent('halo:dm-read', { detail: { count } })`
  when read state changes — wire this to your sidebar/badge count
  (rename the event in the hook if you want a non-HALO name)

### `getOrCreateDM(currentUserId, otherUserId)`

```js
import { getOrCreateDM, findDM } from './lib/dm'
const conversationId = await getOrCreateDM(currentUser.id, otherUser.id)
```

`findDM` returns null if no 1:1 conversation exists between the two users.
`getOrCreateDM` lazy-creates one (`type='dm'`) and inserts both
participants. Use `findDM` first if you don't want to mint empty
conversations from passive profile visits.

## Realtime

The hooks subscribe to Supabase realtime channels named
`convo-${conversation_id}`. Make sure realtime is enabled on
`conversation_messages` in your project (Database → Replication, or via
`alter publication supabase_realtime add table conversation_messages`).

## Storage

`conversation_messages` has columns for `file_url`, `file_name`,
`file_size`, `mime_type`. The hooks accept these — but uploading the
file to a storage bucket is the host app's responsibility. A simple
Supabase Storage bucket called `attachments` with RLS that lets a
participant read any file referenced by a message they can see, and
write only their own, works fine. Bucket creation is not in this
package.

## Disappearing messages (optional)

`conversations.disappearing_timer` is a text field with allowed values
`off | 1h | 1d | 7d | 30d`. The schema supports it but a sweeper job
to actually delete expired messages is NOT included. Add a pg_cron
entry calling something like:

```sql
DELETE FROM public.conversation_messages
WHERE expires_at IS NOT NULL AND expires_at < now();
```

if you want to enforce it server-side.

## What was learned the hard way

The original HALO build had two parallel chat tables (`leader_messages`
and `conversation_messages`) and the DM widget on a profile wrote to
the legacy table while every visible inbox surface read from the
new one — so messages silently vanished. This package contains only
the new system. Do not introduce a second chat table.
