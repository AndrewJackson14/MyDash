import { useState, useRef } from "react";
import { Z, SC, COND, DISPLAY, FS, FW, Ri } from "../lib/theme";
import { Ic, Badge, Btn, Inp, Sel, TA, Card, SB, TB, Stat, Modal, Bar, FilterBar, SortHeader, BackBtn, ThemeToggle , GlassCard, PageHeader, SolidTabs, GlassStat, SectionTitle, TabRow, TabPipe, DataTable, ListCard, ListDivider, ListGrid } from "../components/ui";

const IssueSchedule = ({ pubs, issues, setIssues, sales }) => {
  const [selPub, setSelPub] = useState("all");
  const [showPast, setShowPast] = useState(false);
  const today = "2026-03-19";
  const filtered = issues.filter(i => (selPub === "all" || i.pubId === selPub) && (showPast || i.date >= today)).sort((a, b) => a.date.localeCompare(b.date) || a.pubId.localeCompare(b.pubId)).slice(0, 60);
  const pn = id => pubs.find(p => p.id === id)?.name || "";
  const markPublished = (issId) => {
    setIssues(prev => prev.map(i => i.id === issId ? { ...i, status: i.status === "Published" ? "Scheduled" : "Published" } : i));
  };

  return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
    <PageHeader title="Issue Schedule" count={filtered.length}>
      <Sel value={selPub} onChange={e => setSelPub(e.target.value)} options={[{ value: "all", label: "All Publications" }, ...pubs.map(p => ({ value: p.id, label: p.name }))]} />
      <Btn sm v={showPast ? "primary" : "secondary"} onClick={() => setShowPast(x => !x)}>Show Past</Btn>
    </PageHeader>
    <DataTable>
        <thead><tr>{["Publication", "Issue", "Date", "Ad Deadline", "Ed Deadline", "Pages", "Ads Sold", "Revenue", "Status"].map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{filtered.map(iss => {
          const issSales = sales.filter(s => s.issueId === iss.id);
          const rev = issSales.filter(s => s.status === "Closed").reduce((s, x) => s + x.amount, 0);
          const isPast = iss.date < today;
          const isPublished = iss.status === "Published" || iss.status === "Packaged for Publishing";
          return <tr key={iss.id} style={{ opacity: isPast && !isPublished ? 0.5 : 1 }}>
            <td style={{ fontWeight: FW.bold, color: Z.tx }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: Ri, background: pubs.find(p => p.id === iss.pubId)?.color || Z.tm, marginRight: 6 }} />{pn(iss.pubId)}</td>
            <td style={{ fontWeight: FW.bold, color: Z.tx }}>{iss.label}</td>
            <td style={{ color: Z.tm }}>{iss.date}</td>
            <td style={{ color: iss.adDeadline < "2026-03-22" ? Z.da : Z.wa, fontWeight: FW.semi }}>{iss.adDeadline || "—"}</td>
            <td style={{ color: iss.edDeadline < "2026-03-22" ? Z.da : Z.tm, fontWeight: FW.semi }}>{iss.edDeadline || "—"}</td>
            <td style={{ color: Z.tm }}>{iss.pageCount}</td>
            <td style={{ fontWeight: FW.bold }}>{issSales.length}</td>
            <td style={{ color: Z.tx, fontWeight: FW.bold }}>{rev > 0 ? `$${rev.toLocaleString()}` : "—"}</td>
            <td>
              {isPublished
                ? <Badge status="Published" small />
                : <Btn sm v="secondary" onClick={e => { e.stopPropagation(); markPublished(iss.id); }}>Publish</Btn>
              }
            </td>
          </tr>;
        })}</tbody>
    </DataTable>
  </div>;
};


export default IssueSchedule;
