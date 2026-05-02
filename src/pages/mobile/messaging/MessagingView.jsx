// ============================================================
// MessagingView — top-level mobile messaging surface.
//
// Two states: ConversationList (inbox) and ConversationView (single
// thread). Stack-style nav inside the messaging overlay; back arrow
// in the thread header returns to the inbox.
//
// Mounts inside MobileApp's AuthedShell when the messaging icon in
// the top bar is toggled on. Fills the same content area normally
// occupied by the active tab. Tab bar at the bottom is unchanged
// so the rep can swipe back to Pipeline / Clients / etc.
// ============================================================
import { useState } from "react";
import { useConversations } from "../../../lib/messaging";
import { TOKENS, SURFACE, INK, ACCENT, TYPE } from "../mobileTokens";
import { Ic } from "../../../components/ui";
import ConversationList   from "./ConversationList";
import ConversationView   from "./ConversationView";
import NewConversationView from "./NewConversationView";

export default function MessagingView({ currentUser, team }) {
  const personId = currentUser?.id || null;
  const { conversations, loading, reload, setConversations } = useConversations(personId);

  // null  = inbox view
  // <id>  = open conversation
  // "new" = pick someone to start a DM with
  const [active, setActive] = useState(null);

  if (!personId) {
    return <Empty hint="Sign in to use messaging." />;
  }

  if (active === "new") {
    return (
      <NewConversationView
        currentPersonId={personId}
        team={team}
        onCancel={() => setActive(null)}
        onCreated={(convoId) => { reload(); setActive(convoId); }}
      />
    );
  }

  if (active) {
    const convo = conversations.find(c => c.id === active);
    return (
      <ConversationView
        conversation={convo}
        currentPersonId={personId}
        onBack={() => { setActive(null); reload(); }}
      />
    );
  }

  return (
    <ConversationList
      conversations={conversations}
      loading={loading}
      currentPersonId={personId}
      onPick={(c) => setActive(c.id)}
      onNew={() => setActive("new")}
    />
  );
}

function Empty({ hint }) {
  return (
    <div style={{
      padding: "60px 24px", textAlign: "center",
      color: TOKENS.muted, ...TYPE.body,
    }}>{hint}</div>
  );
}
