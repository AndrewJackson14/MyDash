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
import { useVisualViewport } from "./useVisualViewport";

const TOP_BAR_PX     = 60;
// Tab bar inner height + safe-area padding the bar carries on iOS.
// When the keyboard is open, the tab bar is hidden behind it so we
// don't need to reserve this — the wrapper can extend to the visual
// viewport bottom.
const TAB_BAR_PX     = 56;
// Threshold to decide "keyboard is open" — small visualViewport
// shrinks happen for the iOS URL bar collapsing too, so we don't
// want to think a 60px URL-bar shift is a keyboard.
const KB_THRESHOLD   = 120;

export default function MessagingView({ currentUser, team }) {
  const personId = currentUser?.id || null;
  const { conversations, loading, reload, setConversations } = useConversations(personId);
  const vv = useVisualViewport();

  // null  = inbox view
  // <id>  = open conversation
  // "new" = pick someone to start a DM with
  const [active, setActive] = useState(null);

  // Lock the document fully while messaging is open. iOS WebKit
  // (Safari + Chrome-on-iOS — Apple forces all iOS browsers onto
  // WebKit) tries to scroll the focused input into view by moving
  // the layout viewport. body { overflow: hidden } isn't enough
  // because WebKit also scrolls the documentElement and the visual
  // viewport. Locking body to position:fixed inset:0 takes the
  // whole document out of any scroll container so there's nothing
  // left for WebKit to scroll.
  //
  // We deliberately scroll to (0,0) BEFORE locking — and restore
  // the user's prior scrollY on unmount. The standard body-scroll-
  // lock pattern (body.top = -scrollY) preserves scroll inside the
  // lock, but that hides the MobileApp TopBar at body y=0 whenever
  // the user had scrolled the host tab before opening messaging.
  // For the messaging overlay we want the TopBar pinned at viewport
  // top regardless of where the host tab was.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevScrollY = window.scrollY;
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop:      body.style.top,
      bodyLeft:     body.style.left,
      bodyRight:    body.style.right,
      bodyBottom:   body.style.bottom,
      bodyWidth:    body.style.width,
    };
    // Reset scroll first so the TopBar sits at the visible top once
    // we anchor body to the viewport.
    if (prevScrollY !== 0) window.scrollTo(0, 0);
    html.style.overflow  = "hidden";
    body.style.overflow  = "hidden";
    body.style.position  = "fixed";
    body.style.top       = "0";
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
      window.scrollTo(0, prevScrollY);
    };
  }, []);

  // Fixed wrapper anchored to the VISUAL viewport (not the layout
  // viewport). On iOS WebKit, position:fixed alone anchors to the
  // layout, which moves out of view when the browser scrolls the
  // visual viewport on input focus. Tracking visualViewport.offsetTop
  // keeps the wrapper riding what the user actually sees.
  //
  // Top: vv.offsetTop + TopBar height — sits below the TopBar.
  //
  // Bottom math:
  //   keyboard open  → vv.height already excludes the keyboard, so
  //                    extending to vv.height puts the input flush
  //                    with the keyboard edge. No tab-bar reserve
  //                    because the tab bar is behind the keyboard.
  //   keyboard closed → reserve tab-bar height + safe-area inset so
  //                    the input doesn't sit behind the bottom tab
  //                    bar.
  const kbHeight = Math.max(0, (typeof window !== "undefined" ? window.innerHeight : 0) - vv.height - vv.offsetTop);
  const kbOpen   = kbHeight > KB_THRESHOLD;

  const wrapperWidth = Math.min(480, vv.width);
  const wrapperLeft  = vv.offsetLeft + (vv.width - wrapperWidth) / 2;
  const wrapperHeight = kbOpen
    ? Math.max(0, vv.height - TOP_BAR_PX)
    : `calc(${vv.height - TOP_BAR_PX}px - ${TAB_BAR_PX}px - env(safe-area-inset-bottom))`;
  const wrapperStyle = {
    position: "fixed",
    top:    vv.offsetTop + TOP_BAR_PX,
    left:   wrapperLeft,
    width:  wrapperWidth,
    height: wrapperHeight,
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
