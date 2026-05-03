// ============================================================
// Icons — lightweight SVG icon components
// ============================================================

const Iv = ({ d, size = 18, color = "currentColor", ...p }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d={d} /></svg>;

const Ic = {
  dash:   p => <Iv d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10" {...p} />,
  pub:    p => <Iv d="M4 19.5A2.5 2.5 0 016.5 17H20 M4 19.5A2.5 2.5 0 004 17V5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H6.5" {...p} />,
  story:  p => <Iv d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8" {...p} />,
  sale:   p => <Iv d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" {...p} />,
  flat:   p => <Iv d="M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z" {...p} />,
  edit:   p => <Iv d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z" {...p} />,
  chart:  p => <Iv d="M18 20V10 M12 20V4 M6 20v-6" {...p} />,
  plus:   p => <Iv d="M12 5v14M5 12h14" {...p} />,
  close:  p => <Iv d="M18 6L6 18M6 6l12 12" {...p} />,
  check:  p => <Iv d="M20 6L9 17l-5-5" {...p} />,
  search: p => <Iv d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" {...p} />,
  send:   p => <Iv d="M22 2L11 13M22 2l-7 20-4-9-9-4z" {...p} />,
  up:     p => <Iv d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" {...p} />,
  mail:   p => <Iv d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6" {...p} />,
  phone:  p => <Iv d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.13.81.36 1.6.65 2.36a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.72-1.22a2 2 0 012.11-.45c.76.29 1.55.52 2.36.65a2 2 0 011.72 2.03z" {...p} />,
  clock:  p => <Iv d="M12 2a10 10 0 100 20 10 10 0 000-20zM12 6v6l4 2" {...p} />,
  user:   p => <Iv d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z" {...p} />,
  sign:   p => <Iv d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5zM2 22h20" {...p} />,
  cal:    p => <Iv d="M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18" {...p} />,
  // New icons
  list:   p => <Iv d="M3 6h18M3 12h18M3 18h18" {...p} />,
  chat:   p => <Iv d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" {...p} />,
  gavel:  p => <Iv d="M14.5 2l5 5-9.5 9.5-5-5zM2 22l3-3M7 17l-5 5M10.5 7.5l5 5" {...p} />,
  handshake: p => <Iv d="M2 14l6-6 4 4 6-6M17 8h5v5M7 22l3-3M10 19l3-3M13 16l3-3" {...p} />,
  lineGraph: p => <Iv d="M3 20h18M3 20l5-12 4 6 4-10 5 8" {...p} />,
  paintbrush: p => <Iv d="M18.37 2.63a2.12 2.12 0 013 3L14 13l-4 1 1-4zM12.13 8.87l3 3M2 21c0-2.76 2.24-5 5-5h.09c.91-1.21 1.91-2 3.91-2s3 .79 3.91 2H15c2.76 0 5 2.24 5 5" {...p} />,
  barChart: p => <Iv d="M12 20V10M18 20V4M6 20v-4" {...p} />,
  invoice: p => <Iv d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M9 15h6M9 11h6M9 19h3" {...p} />,
  puzzle: p => <Iv d="M12 2a3 3 0 00-3 3H5v4a3 3 0 000 6v4h4a3 3 0 006 0h4v-4a3 3 0 000-6V5h-4a3 3 0 00-3-3z" {...p} />,
  logout: p => <Iv d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" {...p} />,
  back:   p => <Iv d="M19 12H5M12 19l-7-7 7-7" {...p} />,
  lock:   p => <Iv d="M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4" {...p} />,
  globe:  p => <Iv d="M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z" {...p} />,
  star:   p => <Iv d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" {...p} />,
  tag:    p => <Iv d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01" {...p} />,
  trash:  p => <Iv d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" {...p} />,
  folder: p => <Iv d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" {...p} />,
  bell:   p => <Iv d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" {...p} />,
  checkAll: p => <Iv d="M18 6L9 17l-5-5M22 10l-8 8" {...p} />,
  file:   p => <Iv d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9zM13 2v7h7" {...p} />,
  attach: p => <Iv d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" {...p} />,
  download: p => <Iv d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" {...p} />,
  image: p => <Iv d="M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zM8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM21 15l-5-5L5 21" {...p} />,
  alert: p => <Iv d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" {...p} />,
  pin:    p => <Iv d="M12 17v5M5 17h14l-1.5-3.5L19 10V4H5v6l1.5 3.5z" {...p} />,
  // Story Editor toolbar — flat line style
  link:      p => <Iv d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.72M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.72-1.72" {...p} />,
  undo:      p => <Iv d="M3 7v6h6M3 13a9 9 0 1112-8.5" {...p} />,
  redo:      p => <Iv d="M21 7v6h-6M21 13a9 9 0 10-12-8.5" {...p} />,
  quote:     p => <Iv d="M7 6H3v7h5l-3 5V6zM19 6h-4v7h5l-3 5V6z" {...p} />,
  listBul:   p => <Iv d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" {...p} />,
  listOl:    p => <Iv d="M10 6h11M10 12h11M10 18h11M4 4v4M3 6h2M3 14h3l-3 4h3" {...p} />,
  divider:   p => <Iv d="M3 12h18" {...p} />,
  // Sidebar redesign — flat line, single stroke, 24x24
  news:      p => <Iv d="M4 4h14a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zM20 8h2v10a2 2 0 01-2 2M8 8h8M8 12h8M8 16h5" {...p} />,
  book:      p => <Iv d="M4 4a2 2 0 012-2h6v18H6a2 2 0 00-2 2V4zM20 4a2 2 0 00-2-2h-6v18h6a2 2 0 012 2V4z" {...p} />,
  brief:     p => <Iv d="M3 8h18v11a2 2 0 01-2 2H5a2 2 0 01-2-2V8zM8 8V5a2 2 0 012-2h4a2 2 0 012 2v3M3 13h18" {...p} />,
  megaphone: p => <Iv d="M3 11a2 2 0 012-2h2l11-5v16l-11-5H5a2 2 0 01-2-2zM7 9v6M11 19a3 3 0 006 0" {...p} />,
  bag:       p => <Iv d="M6 2L4 6v14a2 2 0 002 2h12a2 2 0 002-2V6l-2-4zM4 6h16M16 10a4 4 0 01-8 0" {...p} />,
  truck:     p => <Iv d="M1 4h14v12H1zM15 8h4l4 4v4h-8zM6 20a2 2 0 100-4 2 2 0 000 4zM19 20a2 2 0 100-4 2 2 0 000 4z" {...p} />,
  activity:  p => <Iv d="M22 12h-4l-3 9L9 3l-3 9H2" {...p} />,
  template:  p => <Iv d="M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z" {...p} />,
  palette:   p => <Iv d="M12 2a10 10 0 00-10 10c0 4 3 7 7 7 1 0 2-.5 2-2v-1a1.5 1.5 0 011.5-1.5H15a6 6 0 006-6c0-3.87-3.13-7-9-7zM7.5 10.5h.01M11 7h.01M15.5 7.5h.01M17 11h.01" {...p} />,
  scroll:    p => <Iv d="M6 3h12a2 2 0 012 2 2 2 0 01-2 2H6a2 2 0 01-2-2 2 2 0 012-2zM6 17h12a2 2 0 012 2 2 2 0 01-2 2H6a2 2 0 01-2-2 2 2 0 012-2zM6 7v10M18 7v10M9 11h6M9 14h5" {...p} />,
  // Mobile UI icon swap (2026-04-25): six new flat-line glyphs to
  // replace the emoji/Unicode icons mobile shipped with. Same stroke
  // weight + 24x24 viewBox as the rest of the set so they sit cleanly
  // alongside Ic.phone / Ic.mail / Ic.cal etc.
  users:     p => <Iv d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" {...p} />,
  card:      p => <Iv d="M2 6h20v12H2zM2 10h20" {...p} />,
  mapPin:    p => <Iv d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0zM12 13a3 3 0 100-6 3 3 0 000 6z" {...p} />,
  external:  p => <Iv d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" {...p} />,
  camera:    p => <Iv d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8z" {...p} />,
  refresh:   p => <Iv d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" {...p} />,
  eye:       p => <Iv d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 100-6 3 3 0 000 6z" {...p} />,
  chevronRight:  p => <Iv d="M9 18l6-6-6-6" {...p} />,
  chevronLeft:   p => <Iv d="M15 18l-6-6 6-6" {...p} />,
  chevronUp:     p => <Iv d="M18 15l-6-6-6 6" {...p} />,
  chevronDown:   p => <Iv d="M6 9l6 6 6-6" {...p} />,
  // Six-dot grip — strokeLinecap="round" turns each "h.01" into a dot.
  gripVertical:  p => <Iv d="M9 12.01h.01M9 5.01h.01M9 19.01h.01M15 12.01h.01M15 5.01h.01M15 19.01h.01" {...p} />,
  // ↩-style "jump back" indicator. Wraps from the right, drops, points
  // left — same shape lucide uses for corner-down-left.
  cornerDownLeft: p => <Iv d="M9 10l-5 5 5 5M20 4v7a4 4 0 01-4 4H4" {...p} />,
  // Wave 4 — added for the activity-rail "→" prefix and the snooze
  // affordance on pipeline cards (was 💤 emoji).
  arrowRight:    p => <Iv d="M5 12h14M12 5l7 7-7 7" {...p} />,
  moon:          p => <Iv d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" {...p} />,
};

export { Iv, Ic };
export default Ic;
