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

  // Lock the document fully while messaging is open. iOS WebKit
  // (Safari and Chrome-on-iOS, since Apple forces all iOS browsers
  // onto WebKit) tries to scroll the focused input into view by
  // moving the layout viewport — body { overflow: hidden } alone
  // isn't enough because WebKit also scrolls the documentElement
  // and the visual viewport. Locking body to position:fixed inset:0
  // takes the whole document out of any scroll container so there's
  // nothing left for WebKit to scroll. On Android/Chrome the
  // interactive-widget=resizes-content viewport directive handles
  // it differently — both layers are belt-and-suspenders.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop:      body.style.top,
      bodyLeft:     body.style.left,
      bodyRight:    body.style.right,
      bodyBottom:   body.style.bottom,
      bodyWidth:    body.style.width,
      // Capture current scroll so we can restore it on unmount.
      scrollY:      window.scrollY,
    };
    html.style.overflow  = "hidden";
    body.style.overflow  = "hidden";
    body.style.position  = "fixed";
    body.style.top       = `-${prev.scrollY}px`;
    body.style.left      = "0";
    body.style.right     = "0";
    body.style.bottom    = "0";
    body.style.width     = "100%";
    return () => {
      html.style.overflow = prev.htmlOverflow;
      body.style.overflow = prev.bodyOverflow;
      body.style.position = prev.bodyPosition;
      body.style.top      = prev.bodyTop;
      body.style.left     = prev.bodyLeft;
      body.style.right    = prev.bodyRight;
      body.style.bottom   = prev.bodyBottom;
      body.style.width    = prev.bodyWidth;
      window.scrollTo(0, prev.scrollY);
    };
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
