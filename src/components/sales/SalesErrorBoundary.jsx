import { Component } from "react";
import { Z, COND, FS, DISPLAY, R } from "../../lib/theme";
import { Btn, Ic } from "../ui";

// Catches throws from the Sales surfaces — bad client/sale row,
// embedded EntityThread/ProposalWizard issues, etc. Without this a
// single bad row can white-screen the whole CRM module. Reset
// re-renders; the underlying bug obviously still needs a real fix
// (the recovery panel surfaces the message + stack), but the user
// can keep working in other modules while we investigate.
export default class SalesErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, errorInfo) {
    console.error("[Sales] uncaught:", error, errorInfo);
    this.setState({ errorInfo });
  }
  reset = () => this.setState({ error: null, errorInfo: null });
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 32, background: Z.sf, border: "1px solid " + Z.da + "40", borderRadius: R }}>
        <div style={{ marginBottom: 8, color: Z.da }}><Ic.alert size={24} /></div>
        <h3 style={{ margin: "0 0 8px", fontSize: FS.lg, fontWeight: 800, color: Z.tx, fontFamily: DISPLAY }}>
          Sales hit an error
        </h3>
        <p style={{ margin: "0 0 12px", fontSize: FS.sm, color: Z.tm, fontFamily: COND }}>
          The page couldn't render. Your unsaved changes (if any) are likely safe — try again, or refresh.
        </p>
        <details style={{ marginBottom: 12, padding: 10, background: Z.bg, borderRadius: 4, border: "1px solid " + Z.bd, fontSize: FS.micro, color: Z.tm, fontFamily: "monospace" }}>
          <summary style={{ cursor: "pointer", color: Z.tx }}>Error detail</summary>
          <pre style={{ margin: "8px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {String(this.state.error?.message || this.state.error)}
            {this.state.errorInfo?.componentStack}
          </pre>
        </details>
        <Btn sm onClick={this.reset}>Try Again</Btn>
      </div>
    );
  }
}
