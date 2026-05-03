import { Component } from "react";
import { Z, COND, FS, DISPLAY, R } from "../../lib/theme";
import { Btn, Ic } from "../ui";

// Catches throws from TipTap, gallery node-view, extensions, or any
// child render path. Without this a malformed body HTML or a bad
// extension upgrade white-screens the whole editor route. With it we
// render a recovery panel that keeps the autosave intact and lets the
// user back out without losing the rest of the dashboard.
export default class StoryEditorErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[StoryEditor] uncaught:", error, errorInfo);
    this.setState({ errorInfo });
    if (this.props.onError) {
      try { this.props.onError(error, errorInfo); } catch (_) {}
    }
  }

  reset = () => this.setState({ error: null, errorInfo: null });

  render() {
    if (!this.state.error) return this.props.children;

    const onClose = this.props.onClose;
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100%", background: Z.bg, padding: 24,
      }}>
        <div style={{
          maxWidth: 520, textAlign: "center",
          background: Z.sf, border: "1px solid " + Z.da + "40", borderRadius: R,
          padding: 32, boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}>
          <div style={{ marginBottom: 12, color: Z.da, display: "flex", justifyContent: "center" }}><Ic.alert size={40} /></div>
          <h2 style={{
            margin: "0 0 8px", fontSize: FS.xl, fontWeight: 800,
            color: Z.tx, fontFamily: DISPLAY,
          }}>
            The editor hit an error
          </h2>
          <p style={{
            margin: "0 0 16px", fontSize: FS.sm, color: Z.tm,
            fontFamily: COND, lineHeight: 1.5,
          }}>
            We've logged it. Your last autosave is safe — close the editor and
            re-open the story to recover. If this keeps happening on the same
            story, the body HTML may be malformed.
          </p>
          <details style={{
            textAlign: "left", marginBottom: 16, padding: 10,
            background: Z.bg, borderRadius: 4, border: "1px solid " + Z.bd,
            fontSize: FS.micro, color: Z.tm, fontFamily: "monospace",
          }}>
            <summary style={{ cursor: "pointer", color: Z.tx }}>Error detail</summary>
            <pre style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {String(this.state.error?.message || this.state.error)}
              {this.state.errorInfo?.componentStack}
            </pre>
          </details>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <Btn sm v="secondary" onClick={this.reset}>Try Again</Btn>
            {onClose && <Btn sm onClick={onClose}>Back to Editorial</Btn>}
          </div>
        </div>
      </div>
    );
  }
}
