// DriverLogin — PIN entry screen, hit at /driver/auth/{magic_token}.
//
// Six 48×48 input boxes; auto-advance between them; auto-submit on
// the 6th digit. Shake animation on wrong PIN; lockout after 5 wrong.
// On success, the parent (DriverApp) routes to /driver/home.
import { useEffect, useRef, useState } from "react";
import { useDriverAuth } from "../../hooks/useDriverAuth";

const TEXT = "#E8EAED";
const MUTED = "#94A3B8";
const GOLD = "#B8893A";
const RED  = "#C53030";
const GREEN = "#2F855A";
const BOX_BG = "#1A1F2E";
const BOX_BD = "#2D3548";

export default function DriverLogin({ magicToken, onAuthed }) {
  const { verify } = useDriverAuth();
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [locked, setLocked] = useState(false);
  const [shake, setShake] = useState(0);
  const inputs = useRef([]);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  const handleChange = (i, val) => {
    if (locked || submitting) return;
    const clean = val.replace(/\D/g, "").slice(0, 1);
    setDigits(prev => {
      const next = [...prev];
      next[i] = clean;
      return next;
    });
    setError(null);
    if (clean && i < 5) {
      inputs.current[i + 1]?.focus();
    }
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const text = (e.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < text.length; i++) next[i] = text[i];
    setDigits(next);
    inputs.current[Math.min(text.length, 5)]?.focus();
  };

  // Auto-submit when all 6 digits filled.
  useEffect(() => {
    const pin = digits.join("");
    if (pin.length === 6 && !submitting && !locked) {
      doSubmit(pin);
    }
  }, [digits.join("")]); // eslint-disable-line react-hooks/exhaustive-deps

  const doSubmit = async (pin) => {
    setSubmitting(true);
    setError(null);
    const res = await verify(magicToken, pin);
    setSubmitting(false);
    if (res.ok) {
      onAuthed?.();
      return;
    }
    setShake(s => s + 1);
    setDigits(["", "", "", "", "", ""]);
    setTimeout(() => inputs.current[0]?.focus(), 50);
    if (res.error === "locked") {
      setLocked(true);
      setError(res.message || "Session locked. Call Cami.");
    } else if (res.error === "wrong_pin") {
      setError(`Wrong PIN. ${res.attempts_remaining ?? 0} attempt${res.attempts_remaining === 1 ? "" : "s"} remaining.`);
    } else if (res.error === "expired") {
      setError("This magic link expired. Ask Cami to send a new one.");
    } else if (res.error === "already_used") {
      setError("This magic link was already used. Ask Cami to send a new one.");
    } else if (res.error === "invalid_token") {
      setError("This magic link isn't valid. Ask Cami to send a fresh one.");
    } else {
      setError(res.error || "Verification failed. Try again.");
    }
  };

  return <div style={{
    padding: "48px 24px 24px",
    maxWidth: 420, margin: "0 auto",
    minHeight: "100vh",
    display: "flex", flexDirection: "column",
  }}>
    <div style={{ textAlign: "center", marginBottom: 28 }}>
      <div style={{ fontSize: 24, fontWeight: 900, color: TEXT, letterSpacing: -0.5 }}>13 Stars Delivery</div>
      <div style={{ fontSize: 14, color: MUTED, marginTop: 8 }}>
        Enter the 6-digit PIN we just texted you
      </div>
    </div>

    <div
      style={{
        display: "flex", justifyContent: "center", gap: 8,
        animation: shake ? "shake 0.4s" : undefined,
      }}
      key={shake}
      onPaste={handlePaste}
    >
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => (inputs.current[i] = el)}
          value={d}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          autoComplete={i === 0 ? "one-time-code" : "off"}
          disabled={locked || submitting}
          style={{
            width: 48, height: 60,
            fontSize: 24, fontWeight: 800, textAlign: "center",
            background: BOX_BG, color: TEXT,
            border: `2px solid ${error ? RED : d ? GOLD : BOX_BD}`,
            borderRadius: 10,
            outline: "none",
            transition: "border-color 0.15s",
          }}
        />
      ))}
    </div>

    {error && <div style={{
      marginTop: 18, padding: "10px 14px",
      background: locked ? RED + "22" : RED + "18",
      color: locked ? "#FCA5A5" : "#F87171",
      borderRadius: 10, fontSize: 14, textAlign: "center",
      lineHeight: 1.5,
    }}>{error}</div>}

    {submitting && <div style={{ marginTop: 18, color: MUTED, fontSize: 13, textAlign: "center" }}>Verifying…</div>}

    {!locked && !submitting && !error && <div style={{
      marginTop: 18, color: MUTED, fontSize: 12, textAlign: "center",
    }}>The PIN auto-submits when you finish typing</div>}

    <div style={{ flex: 1 }} />
    <div style={{ textAlign: "center", color: MUTED, fontSize: 11, marginTop: 24 }}>
      Trouble signing in? Call Cami at the office.
    </div>
  </div>;
}
