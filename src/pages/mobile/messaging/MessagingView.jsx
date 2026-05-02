// ============================================================
// MessagingView — top-level mobile messaging surface.
//
// Two states: ConversationList (inbox) and ConversationView (single
// thread). Stack-style nav inside the messaging overlay; back arrow
// in the thread header returns to the inbox.
//
// Layout: this wrapper is position:fixed, anchored between the
// MobileApp TopBar (60px from page top) and either the bottom tab
// bar (72px + safe-area) OR the on-screen keyboard (whichever is
// taller). Going position:fixed takes the messaging area out of
// the document flow so iOS Safari has no page-level scrolling left
// to do when an input is focused — the chrome stays put and the
// input slides over the keyboard cleanly.
//
// Tab bar at the bottom is unchanged in normal-flow position so the
// rep can still swipe back to Pipeline / Clients / etc; messaging
// just overlays.
// ============================================================
import { useEffect, useState } from "react";
import { useConversations } from "../../../lib/messaging";
import { TOKENS, SURFACE, INK, ACCENT, TYPE } from "../mobileTokens";
import ConversationList   from "./ConversationList";
import ConversationView   from "./ConversationView";
import NewConversationView from "./NewConversationView";
import { useKeyboardHeight } from "./useKeyboardHeight";

const TOP_BAR_PX      = 60;
const TAB_BAR_RESERVE = "calc(72px + env(safe-area-inset-bottom))";

export default function MessagingView({ currentUser, team }) {
  const personId = currentUser?.id || null;
  const { conversations, loading, reload, setConversations } = useConversations(personId);
  const kbHeight = useKeyboardHeight();

  // null  = inbox view
  // <id>  = open conversation
  // "new" = pick someone to start a DM with
  const [active, setActive] = useState(null);

  // Lock the page itself from scrolling while messaging is open so
  // iOS Safari can't try to "scroll the input into view" by pushing
  // the TopBar off-screen. We're position:fixed anyway, but defense
  // in depth — body overflow hidden also stops accidental rubber-
  // band scrolling.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Fixed wrapper: anchors below TopBar, above bottom chrome /
  // keyboard. left/right=0 + max-width + margin auto centers the
  // wrapper within the 480px mobile shell.
  const wrapperStyle = {
    position: "fixed",
    top: TOP_BAR_PX,
    bottom: kbHeight > 0 ? `${kbHeight}px` : TAB_BAR_RESERVE,
    left: 0, right: 0,
    maxWidth: 480, margin: "0 auto",
    background: SURFACE.alt,
    display: "flex", flexDirection: "column",
    zIndex: 30,
  };

  if (!personId) {
    return <div style={wrapperStyle}><Empty hint="Sign in to use messaging." /></div>;
  }

  let content;
  if (active === "new") {
    content = (
      <NewConversationView
        currentPersonId={personId}
        team={team}
        onCancel={() => setActive(null)}
        onCreated={(convoId) => { reload(); setActive(convoId); }}
      />
    );
  } else if (active) {
    const convo = conversations.find(c => c.id === active);
    content = (
      <ConversationView
        conversation={convo}
        currentPersonId={personId}
        onBack={() => { setActive(null); reload(); }}
      />
    );
  } else {
    content = (
      <ConversationList
        conversations={conversations}
        loading={loading}
        currentPersonId={personId}
        onPick={(c) => setActive(c.id)}
        onNew={() => setActive("new")}
      />
    );
  }

  return <div style={wrapperStyle}>{content}</div>;
}

function Empty({ hint }) {
  return (
    <div style={{
      padding: "60px 24px", textAlign: "center",
      color: TOKENS.muted, ...TYPE.body,
    }}>{hint}</div>
  );
}
