// ============================================================
// useDialog — Global replacement for alert(), confirm(), prompt()
// Usage: const { alert, confirm, prompt, DialogHost } = useDialog();
// Place <DialogHost /> once in App shell. Then call alert/confirm/prompt
// anywhere — they return Promises that resolve when user responds.
// ============================================================
import { useState, useCallback, useRef, createContext, useContext } from "react";
import { Z, COND, DISPLAY, R, Ri, FS, FW, ZI } from "../lib/theme";

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolveRef = useRef(null);

  const close = useCallback((value) => {
    if (resolveRef.current) resolveRef.current(value);
    resolveRef.current = null;
    setDialog(null);
  }, []);

  const showAlert = useCallback((message) => {
    return new Promise(resolve => {
      resolveRef.current = resolve;
      setDialog({ type: "alert", message });
    });
  }, []);

  const showConfirm = useCallback((message) => {
    return new Promise(resolve => {
      resolveRef.current = resolve;
      setDialog({ type: "confirm", message });
    });
  }, []);

  const showPrompt = useCallback((message, defaultValue = "") => {
    return new Promise(resolve => {
      resolveRef.current = resolve;
      setDialog({ type: "prompt", message, defaultValue });
    });
  }, []);

  return (
    <DialogContext.Provider value={{ alert: showAlert, confirm: showConfirm, prompt: showPrompt }}>
      {children}
      {dialog && <DialogHost dialog={dialog} close={close} />}
    </DialogContext.Provider>
  );
}

function DialogHost({ dialog, close }) {
  const [inputVal, setInputVal] = useState(dialog.defaultValue || "");

  return <>
    <div onClick={() => close(dialog.type === "confirm" ? false : dialog.type === "prompt" ? null : undefined)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 10000 }} />
    <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 400, maxWidth: "90vw", background: Z.sf, borderRadius: R, boxShadow: "0 16px 48px rgba(0,0,0,0.3)", zIndex: 10001, overflow: "hidden" }}>
      <div style={{ padding: "20px 24px 12px" }}>
        <div style={{ fontSize: FS.md, fontWeight: FW.bold, color: Z.tx, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{dialog.message}</div>
      </div>
      {dialog.type === "prompt" && (
        <div style={{ padding: "0 24px 12px" }}>
          <input autoFocus value={inputVal} onChange={e => setInputVal(e.target.value)} onKeyDown={e => { if (e.key === "Enter") close(inputVal); if (e.key === "Escape") close(null); }} style={{ width: "100%", padding: "10px 14px", borderRadius: Ri, border: `1px solid ${Z.bd}`, background: Z.sa, color: Z.tx, fontSize: FS.base, fontWeight: FW.semi, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "12px 24px 20px" }}>
        {dialog.type === "confirm" && (
          <button onClick={() => close(false)} style={{ padding: "8px 20px", borderRadius: Ri, border: "1px solid rgba(224,80,80,0.3)", background: "rgba(224,80,80,0.12)", color: Z.da, fontSize: FS.sm, fontWeight: FW.bold, cursor: "pointer", fontFamily: COND }}>Cancel</button>
        )}
        {dialog.type === "prompt" && (
          <button onClick={() => close(null)} style={{ padding: "8px 20px", borderRadius: Ri, border: "1px solid rgba(224,80,80,0.3)", background: "rgba(224,80,80,0.12)", color: Z.da, fontSize: FS.sm, fontWeight: FW.bold, cursor: "pointer", fontFamily: COND }}>Cancel</button>
        )}
        <button autoFocus={dialog.type !== "prompt"} onClick={() => close(dialog.type === "alert" ? undefined : dialog.type === "confirm" ? true : inputVal)} style={{ padding: "8px 20px", borderRadius: Ri, border: "none", background: "var(--action)", color: "#fff", fontSize: FS.sm, fontWeight: FW.bold, cursor: "pointer", fontFamily: COND }}>OK</button>
      </div>
    </div>
  </>;
}

export const useDialog = () => {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used within DialogProvider");
  return ctx;
};
