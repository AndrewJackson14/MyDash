// ============================================================
// Seed Data — initial data for offline/demo mode
// Ad sizes, publications, clients, stories, team, generators
// ============================================================
import { FREQ_MAP, STAGE_AUTO_ACTIONS } from "../constants";

// ─── Ad Size Rate Cards ─────────────────────────────────────

export const AD_SIZES_MAGAZINE = [
  { name: "Full Page", dims: "8.375×10.875", w: 8.375, h: 10.875, rate: 1800, rate6: 1530, rate12: 1350 },
  { name: "3/4 Page", dims: "8.375×8.15", w: 8.375, h: 8.15, rate: 1595, rate6: 1353, rate12: 1194 },
  { name: "9/16 Page", dims: "8.375×6.1", w: 8.375, h: 6.1, rate: 1238, rate6: 1051, rate12: 930 },
  { name: "1/2 Page", dims: "8.375×5.44", w: 8.375, h: 5.44, rate: 1111, rate6: 947, rate12: 831 },
  { name: "3/8 Page", dims: "8.375×4.08", w: 8.375, h: 4.08, rate: 864, rate6: 732, rate12: 649 },
  { name: "1/4 Page", dims: "4.19×5.44", w: 4.19, h: 5.44, rate: 616, rate6: 523, rate12: 463 },
  { name: "1/8 Page", dims: "4.19×2.72", w: 4.19, h: 2.72, rate: 369, rate6: 314, rate12: 275 },
];

export const AD_SIZES_NEWSPAPER_BS = [
  { name: "Full Page", dims: "11.125×20.75", w: 11.125, h: 20.75, rate: 1399, rate6: 1189, rate12: 979 },
  { name: "3/4 Page", dims: "11.125×15.5", w: 11.125, h: 15.5, rate: 999, rate6: 849, rate12: 699 },
  { name: "1/2 Page (H)", dims: "11.125×10.25", w: 11.125, h: 10.25, rate: 749, rate6: 637, rate12: 524 },
  { name: "1/2 Page (V)", dims: "5.5×20.75", w: 5.5, h: 20.75, rate: 749, rate6: 637, rate12: 524 },
  { name: "1/4 Page", dims: "5.5×10.25", w: 5.5, h: 10.25, rate: 399, rate6: 339, rate12: 279 },
  { name: "1/8 Page", dims: "5.5×5.125", w: 5.5, h: 5.125, rate: 249, rate6: 212, rate12: 174 },
];

export const AD_SIZES_MALIBU = [
  { name: "Full Page", dims: "12.5×20.5", w: 12.5, h: 20.5, rate: 3382, rate6: 2541, rate12: 2252 },
  { name: "Half Page (H)", dims: "12.5×10.44", w: 12.5, h: 10.44, rate: 2254, rate6: 1687, rate12: 1495 },
  { name: "Half Page (V)", dims: "6.19×20.5", w: 6.19, h: 20.5, rate: 2254, rate6: 1687, rate12: 1495 },
  { name: "Quarter Page (V)", dims: "6.19×10.44", w: 6.19, h: 10.44, rate: 1234, rate6: 878, rate12: 778 },
  { name: "Quarter Page (H)", dims: "12.5×5", w: 12.5, h: 5, rate: 1234, rate6: 878, rate12: 778 },
  { name: "Banner", dims: "12.5×7", w: 12.5, h: 7, rate: 1778, rate6: 1338, rate12: 1186 },
  { name: "Showcase", dims: "6.19×5", w: 6.19, h: 5, rate: 715, rate6: 537, rate12: 476 },
];

export const AD_SIZES_SYV = [
  { name: "Full Page", dims: "10.375×15.875", w: 10.375, h: 15.875, rate: 1398, rate6: 1150, rate12: 918 },
  { name: "1/2 Page (H)", dims: "10×7.69", w: 10, h: 7.69, rate: 851, rate6: 775, rate12: 702 },
  { name: "1/2 Page (V)", dims: "5.125×15.875", w: 5.125, h: 15.875, rate: 851, rate6: 775, rate12: 702 },
  { name: "1/4 Page (V)", dims: "4.94×7.69", w: 4.94, h: 7.69, rate: 432, rate6: 380, rate12: 325 },
  { name: "1/8 Page", dims: "4.94×3.75", w: 4.94, h: 3.75, rate: 255, rate6: 211, rate12: 175 },
  { name: "1/12 Page", dims: "4.94×2.75", w: 4.94, h: 2.75, rate: 162, rate6: 130, rate12: 110 },
];

export const AD_SIZES_MBL = [
  { name: "Full Page", dims: "10.375×15.875", w: 10.375, h: 15.875, rate: 1200, rate6: 1020, rate12: 900 },
  { name: "1/2 Page (H)", dims: "10×7.69", w: 10, h: 7.69, rate: 750, rate6: 637, rate12: 562 },
  { name: "1/2 Page (V)", dims: "5.125×15.875", w: 5.125, h: 15.875, rate: 750, rate6: 637, rate12: 562 },
  { name: "1/4 Page", dims: "4.94×7.69", w: 4.94, h: 7.69, rate: 400, rate6: 340, rate12: 300 },
  { name: "1/8 Page", dims: "4.94×3.75", w: 4.94, h: 3.75, rate: 225, rate6: 191, rate12: 168 },
];

// ─── Publications ───────────────────────────────────────────

export const INIT_PUBS = [
  { id: "pub-prm", name: "Paso Robles Magazine", color: "#111318", type: "Magazine", pageCount: 64, width: 8.375, height: 10.875, frequency: "Monthly", circ: 25000, adSizes: AD_SIZES_MAGAZINE.map(a => ({ ...a, rate: Math.round(a.rate * 1.0) })) },
  { id: "pub-anm", name: "Atascadero News Magazine", color: "#2D3142", type: "Magazine", pageCount: 48, width: 8.375, height: 10.875, frequency: "Monthly", circ: 13000, adSizes: AD_SIZES_MAGAZINE },
  { id: "pub-prp", name: "The Paso Robles Press", color: "#4A5066", type: "Newspaper", pageCount: 24, width: 11.125, height: 20.75, frequency: "Weekly", circ: 2085, adSizes: AD_SIZES_NEWSPAPER_BS },
  { id: "pub-atn", name: "The Atascadero News", color: "#6B7280", type: "Newspaper", pageCount: 24, width: 11.125, height: 20.75, frequency: "Weekly", circ: 2415, adSizes: AD_SIZES_NEWSPAPER_BS },
  { id: "pub-mbl", name: "Morro Bay Life", color: "#8A95A8", type: "Magazine", pageCount: 32, width: 10.375, height: 15.875, frequency: "Monthly", circ: 8500, adSizes: AD_SIZES_MBL },
  { id: "pub-syv", name: "Santa Ynez Valley Star", color: "#9CA3AF", type: "Newspaper", pageCount: 24, width: 10.375, height: 15.875, frequency: "Bi-Monthly", circ: 8500, adSizes: AD_SIZES_SYV },
  { id: "pub-mt", name: "The Malibu Times", color: "#B0B8C4", type: "Newspaper", pageCount: 16, width: 12.5, height: 20.5, frequency: "Weekly", circ: 8500, adSizes: AD_SIZES_MALIBU },
];

// ─── Clients ────────────────────────────────────────────────

export const INIT_CLIENTS = [
  {id:"c1",name:"Conejo Hardwoods",status:"Active",totalSpend:204000,contacts:[{name:"Dan Conejo",email:"dan@conejo.com",phone:"(805) 555-0001",role:"Business Owner"}],comms:[]},
  {id:"c2",name:"UCLA Health",status:"Active",totalSpend:111000,contacts:[{name:"Sarah Mitchell",email:"sarah.m@uclahealth.org",phone:"(310) 555-0102",role:"Marketing Manager"}],comms:[]},
  {id:"c3",name:"Solarponics",status:"Active",totalSpend:89000,contacts:[{name:"Jim Althouse",email:"jim@solarponics.com",phone:"(805) 555-0203",role:"Business Owner"}],comms:[]},
  {id:"c4",name:"Malik Real Estate",status:"Lead",totalSpend:42000,contacts:[{name:"Sam Malik",email:"sam@malik.com",phone:"(805) 555-0304",role:"Business Owner"}],comms:[]},
  {id:"c5",name:"Five Star Gutters",status:"Active",totalSpend:67000,contacts:[{name:"Mike Ferrara",email:"mike@fivestargutters.com",phone:"(805) 555-0405",role:"Business Owner"}],comms:[]},
  {id:"c6",name:"J. Lohr Vineyards",status:"Active",totalSpend:156000,contacts:[{name:"Karen Webb",email:"karen@jlohr.com",phone:"(805) 555-0506",role:"Marketing Manager"}],comms:[]},
  {id:"c7",name:"SLO Brew",status:"Active",totalSpend:48000,contacts:[{name:"Todd Anderson",email:"todd@slobrew.com",phone:"(805) 555-0607",role:"Business Owner"}],comms:[]},
  {id:"c8",name:"Coast National Bank",status:"Active",totalSpend:132000,contacts:[{name:"Patricia Reyes",email:"preyes@coastnational.com",phone:"(805) 555-0708",role:"Marketing Manager"}],comms:[]},
  {id:"c9",name:"Vina Robles",status:"Active",totalSpend:95000,contacts:[{name:"Elena Torres",email:"elena@vinarobles.com",phone:"(805) 555-0809",role:"Marketing Manager"}],comms:[]},
  {id:"c10",name:"Paso Robles Ford",status:"Active",totalSpend:78000,contacts:[{name:"Greg Holden",email:"greg@prford.com",phone:"(805) 555-0910",role:"Business Owner"}],comms:[]},
  {id:"c11",name:"Central Coast Auto Group",status:"Lead",totalSpend:0,contacts:[{name:"David Park",email:"dpark@ccautogroup.com",phone:"(805) 555-1011",role:"Marketing Manager"}],comms:[]},
  {id:"c12",name:"The Malibu Inn",status:"Active",totalSpend:64000,contacts:[{name:"Lisa Chu",email:"lisa@malibuinn.com",phone:"(310) 555-1112",role:"Business Owner"}],comms:[]},
  {id:"c13",name:"Wild Horse Winery",status:"Active",totalSpend:87000,contacts:[{name:"Matt Collins",email:"matt@wildhorsewinery.com",phone:"(805) 555-1213",role:"Business Owner"}],comms:[]},
  {id:"c14",name:"Atascadero Mutual Water",status:"Active",totalSpend:34000,contacts:[{name:"Bob Henderson",email:"bhenderson@amwc.org",phone:"(805) 555-1314",role:"Other"}],comms:[]},
  {id:"c15",name:"SLO County Health Dept",status:"Active",totalSpend:52000,contacts:[{name:"Maria Gonzalez",email:"mgonzalez@slocounty.gov",phone:"(805) 555-1415",role:"Other"}],comms:[]},
  {id:"c16",name:"Santa Ynez Valley Realty",status:"Lead",totalSpend:18000,contacts:[{name:"Jordan Blake",email:"jordan@syvrealty.com",phone:"(805) 555-1516",role:"Business Owner"}],comms:[]},
  {id:"c17",name:"Firestone Walker Brewing",status:"Active",totalSpend:143000,contacts:[{name:"Amy Nguyen",email:"amy@firestonewalker.com",phone:"(805) 555-1617",role:"Marketing Manager"}],comms:[]},
  {id:"c18",name:"Thomas Hill Organics",status:"Active",totalSpend:28000,contacts:[{name:"Joe Thomas",email:"joe@thomashillorganics.com",phone:"(805) 555-1718",role:"Business Owner"}],comms:[]},
  {id:"c19",name:"Pismo Beach Athletic Club",status:"Lead",totalSpend:0,contacts:[{name:"Ryan O'Brien",email:"ryan@pismoac.com",phone:"(805) 555-1819",role:"Business Owner"}],comms:[]},
  {id:"c20",name:"Heritage Oaks Bank",status:"Active",totalSpend:98000,contacts:[{name:"Nancy Kim",email:"nkim@heritageoaksbank.com",phone:"(805) 555-1920",role:"Marketing Manager"}],comms:[]},
  {id:"c21",name:"Morro Bay Oyster Co",status:"Active",totalSpend:22000,contacts:[{name:"Tom Briggs",email:"tom@morrobayoyster.com",phone:"(805) 555-2021",role:"Business Owner"}],comms:[]},
  {id:"c22",name:"Templeton Veterinary",status:"Lead",totalSpend:12000,contacts:[{name:"Dr. Sarah Lin",email:"slin@templetonvet.com",phone:"(805) 555-2122",role:"Business Owner"}],comms:[]},
  {id:"c23",name:"Allegretto Vineyard Resort",status:"Active",totalSpend:176000,contacts:[{name:"Claire Dubois",email:"cdubois@allegretto.com",phone:"(805) 555-2223",role:"Marketing Manager"}],comms:[]},
  {id:"c24",name:"Central Coast Orthodontics",status:"Active",totalSpend:56000,contacts:[{name:"Dr. James Park",email:"drpark@ccobraces.com",phone:"(805) 555-2324",role:"Business Owner"}],comms:[]},
  {id:"c25",name:"Ravine Waterpark",status:"Lead",totalSpend:0,contacts:[{name:"Steve Watkins",email:"steve@ravinewaterpark.com",phone:"(805) 555-2425",role:"Business Owner"}],comms:[]},
];

// ─── Stories ────────────────────────────────────────────────

export const INIT_STORIES = [
  { id: "s1", title: "Spring Wine Guide", author: "Sarah Chen", status: "Approved", publication: "pub-prm", assignedTo: "Hayley Mattson", dueDate: "2026-03-15", images: 12, wordCount: 3000, category: "Wine" },
  { id: "s2", title: "Downtown Revitalization", author: "Marcus Rivera", status: "Edited", publication: "pub-prm", assignedTo: "Nicholas Mattson", dueDate: "2026-03-20", images: 8, wordCount: 2400, category: "Business" },
  { id: "s3", title: "Chef Profiles: Farm to Table", author: "Lisa Nguyen", status: "Needs Editing", publication: "pub-prm", assignedTo: "Hayley Mattson", dueDate: "2026-03-28", images: 6, wordCount: 1800, category: "Food" },
  { id: "s4", title: "SLO County Art Walk", author: "Jennifer Park", status: "Draft", publication: "pub-prm", assignedTo: "Nicholas Mattson", dueDate: "2026-04-01", images: 10, wordCount: 2000, category: "Culture" },
  { id: "s5", title: "Colony Days Preview", author: "Staff Writer", status: "Edited", publication: "pub-anm", assignedTo: "Hayley Mattson", dueDate: "2026-04-01", images: 10, wordCount: 1800, category: "Community" },
  { id: "s6", title: "New Brewery Spotlight", author: "Tom Bradley", status: "Needs Editing", publication: "pub-anm", assignedTo: "Nicholas Mattson", dueDate: "2026-03-25", images: 5, wordCount: 1200, category: "Food" },
  { id: "s7", title: "Chalk Hill Trail Guide", author: "Marcus Rivera", status: "Draft", publication: "pub-anm", assignedTo: "Hayley Mattson", dueDate: "2026-04-05", images: 8, wordCount: 1600, category: "Outdoors" },
  { id: "s8", title: "Pioneer Day Preview", author: "Staff Writer", status: "Edited", publication: "pub-prp", assignedTo: "Hayley Mattson", dueDate: "2026-03-25", images: 5, wordCount: 1400, category: "Events" },
  { id: "s9", title: "City Council Recap", author: "Marcus Rivera", status: "On Page", publication: "pub-prp", assignedTo: "Nicholas Mattson", dueDate: "2026-03-18", images: 2, wordCount: 900, category: "News" },
  { id: "s10", title: "High School Sports Roundup", author: "Tom Bradley", status: "Needs Editing", publication: "pub-prp", assignedTo: "Nicholas Mattson", dueDate: "2026-03-26", images: 6, wordCount: 1100, category: "Sports" },
  { id: "s11", title: "Water District Update", author: "Sarah Chen", status: "Draft", publication: "pub-prp", assignedTo: "Hayley Mattson", dueDate: "2026-03-29", images: 1, wordCount: 800, category: "News" },
  { id: "s12", title: "Zoo Expansion Plans", author: "Jennifer Park", status: "Edited", publication: "pub-atn", assignedTo: "Nicholas Mattson", dueDate: "2026-03-24", images: 7, wordCount: 1500, category: "Community" },
];

// ─── Team ───────────────────────────────────────────────────

export const INIT_TEAM = [
  { id: "tm1", name: "Hayley Mattson", role: "Publisher", email: "hayley@13stars.media", phone: "(805) 466-2585", alerts: ["Story status change", "Sale confirmed", "Proposal signed", "Issue published"], assignedPubs: ["all"], permissions: ["admin"] },
  { id: "tm2", name: "Nicholas Mattson", role: "Editor", email: "nicholas@13stars.media", phone: "", alerts: ["Story status change", "Issue published", "New comment"], assignedPubs: ["all"], permissions: ["editorial", "stories"] },
  { id: "tm3", name: "Dana McGraw", role: "Salesperson", email: "dana@13stars.media", phone: "(805) 423-6740", alerts: ["Sale confirmed", "Proposal signed"], assignedPubs: ["pub-prm", "pub-anm", "pub-prp", "pub-atn"], permissions: ["sales", "clients"] },
  { id: "tm4", name: "Creative Director", role: "Graphic Designer", email: "creative@13stars.media", phone: "", alerts: ["Flatplan updated", "Issue published"], assignedPubs: ["all"], permissions: ["flatplan", "stories"] },
  { id: "tm5", name: "Copy Editor", role: "Copy Editor", email: "copy@13stars.media", phone: "", alerts: ["Story status change"], assignedPubs: ["all"], permissions: ["editorial", "stories"] },
  { id: "tm6", name: "Office Manager", role: "Office Manager", email: "office@13stars.media", phone: "(805) 466-2585", alerts: ["Sale confirmed"], assignedPubs: ["all"], permissions: ["clients"] },
];

// ─── Issue Generator ────────────────────────────────────────

export function generateIssues(pub, startDate, months) {
  const issues = [];
  const start = new Date(startDate);
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);
  const freq = pub.frequency;
  if (freq === "Daily" || !FREQ_MAP[freq]) return issues;
  const intervalDays = FREQ_MAP[freq];
  let cursor = new Date(start);
  let issueNum = 1;
  while (cursor < end) {
    const d = new Date(cursor);
    const mo = d.toLocaleString("en-US", { month: "short" });
    const yr = d.getFullYear();
    let label;
    if (freq === "Weekly") { label = `${mo} ${d.getDate()}, ${yr}`; }
    else if (freq === "Bi-Weekly") { const half = d.getDate() <= 15 ? "A" : "B"; label = `${mo} ${half}, ${yr}`; }
    else if (freq === "Bi-Monthly") { const half = d.getDate() <= 15 ? "A" : "B"; label = `${mo} ${half}, ${yr}`; }
    else if (freq === "Monthly") { label = `${mo} ${yr}`; }
    else if (freq === "Quarterly") { const q = Math.ceil((d.getMonth() + 1) / 3); label = `Q${q} ${yr}`; }
    else if (freq === "Semi-Annual") { const h = d.getMonth() < 6 ? "H1" : "H2"; label = `${h} ${yr}`; }
    else { label = `${yr}`; }
    const pubDate = d.toISOString().slice(0, 10);
    const adDeadDays = pub.type === "Magazine" ? 15 : 2;
    const edDeadDays = pub.type === "Magazine" ? 21 : 3;
    const adDead = new Date(d); adDead.setDate(adDead.getDate() - adDeadDays);
    const edDead = new Date(d); edDead.setDate(edDead.getDate() - edDeadDays);
    issues.push({
      id: `${pub.id}-iss-${issueNum}`, pubId: pub.id, label, date: pubDate,
      pageCount: pub.pageCount,
      adDeadline: adDead.toISOString().slice(0, 10),
      edDeadline: edDead.toISOString().slice(0, 10),
      status: d < new Date() ? (d > new Date(Date.now() - 14 * 86400000) ? "In Progress" : "Packaged for Publishing") : "Scheduled",
    });
    issueNum++;
    cursor.setDate(cursor.getDate() + Math.round(intervalDays));
  }
  return issues;
}

export function buildAllIssues(pubs) {
  let all = [];
  for (const p of pubs) { all = all.concat(generateIssues(p, "2026-01-01", 24)); }
  return all;
}

// ─── Sample Data Generators ─────────────────────────────────

export function generateSampleSales(pubs, issues, clients) {
  const sales = []; const today = new Date("2026-03-21");
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const todayStr = today.toISOString().slice(0,10);
  const tomorrowStr = tomorrow.toISOString().slice(0,10);
  for (let sid = 0; sid < pubs.length; sid++) {
    const pub = pubs[sid];
    const pubIssues = issues.filter(i => i.pubId === pub.id && i.date >= todayStr).slice(0, 6);
    for (let a = 0; a < Math.min(3, pubIssues.length); a++) {
      const ci = (sid * 7 + a * 13) % clients.length;
      const adIdx = a % pub.adSizes.length;
      const ad = pub.adSizes[adIdx];
      const stages = ["Discovery","Presentation","Proposal","Negotiation","Closed","Follow-up"];
      const st = stages[(sid + a) % stages.length];
      sales.push({
        id: `sl-${pub.id}-${a}`, clientId: clients[ci].id, publication: pub.id,
        issueId: pubIssues[a].id, type: ad.name, size: ad.dims, adW: ad.w, adH: ad.h,
        amount: ad.rate, status: st, date: todayStr, closedAt: st === "Closed" ? todayStr : null,
        page: st === "Closed" ? (a + 1) * 2 : null, pagePos: null, proposalId: null,
        nextAction: STAGE_AUTO_ACTIONS[st], nextActionDate: tomorrowStr, oppNotes: [],
      });
    }
  }
  for (let i = 0; i < 3; i++) {
    const ci = (i * 5 + 3) % clients.length;
    sales.push({
      id: `sl-fup-${i}`, clientId: clients[ci].id, publication: pubs[i % pubs.length].id,
      issueId: null, type: "TBD", size: "", adW: 0, adH: 0,
      amount: 0, status: "Follow-up", date: todayStr, closedAt: null,
      page: null, pagePos: null, proposalId: null,
      nextAction: STAGE_AUTO_ACTIONS["Follow-up"], nextActionDate: tomorrowStr, oppNotes: [],
    });
  }
  return sales;
}

export function generateSampleProposals(pubs, issues, clients) {
  const proposals = []; const todayStr = new Date("2026-03-21").toISOString().slice(0,10);
  for (let i = 0; i < 3; i++) {
    const pub = pubs[i % pubs.length];
    const ad = pub.adSizes[0];
    const pubIssues = issues.filter(is => is.pubId === pub.id && is.date >= todayStr).slice(0, 6);
    const lines = pubIssues.map(is => ({
      pubId: pub.id, pubName: pub.name, adSize: ad.name, dims: ad.dims, adW: ad.w, adH: ad.h,
      issueId: is.id, issueLabel: is.label, price: ad.rate6,
    }));
    proposals.push({
      id: `prop-${i}`, clientId: clients[i].id, name: `${clients[i].name} ${pub.name} Campaign`,
      term: "6-month", termMonths: 6, total: lines.reduce((s, l) => s + l.price, 0), payPlan: false, monthly: 0,
      status: i === 0 ? "Sent" : i === 1 ? "Draft" : "Approved/Signed", date: todayStr,
      renewalDate: null, closedAt: i === 2 ? todayStr : null, sentTo: i === 0 ? [clients[i].contacts?.[0]?.email] : [],
      lines,
    });
  }
  return proposals;
}

export const INIT_NOTIFICATIONS = [
  { id: "n1", text: "Conejo Hardwoods Full Page confirmed for PRM April", time: "9:15 AM", read: false },
  { id: "n2", text: "Story 'Pioneer Day Preview' moved to Edited", time: "8:42 AM", read: false },
  { id: "n3", text: "New proposal submitted for UCLA Health", time: "Yesterday", read: true },
];
