const inrFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export const r2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;

// ₹1,23,456 (paise only when present). The symbol comes from Settings.
export function money(n, symbol = "₹") {
  const v = Number(n) || 0;
  const s = Math.round(v) !== v ? inr2.format(Math.abs(v)) : inrFmt.format(Math.abs(v));
  return (v < 0 ? "−" : "") + symbol + s;
}

const TZ = "Asia/Kolkata";

// "yyyy-MM-dd" in IST, offset by days
export function istDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// month names written out, so every device reads the same (browsers differ: "Sep" vs "Sept")
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/* ---------- salary months, written "yyyy-MM" ---------- */

export const thisMonth = () => istDate().slice(0, 7);

// the month `by` months away: shiftMonth("2026-01", -1) → "2025-12"
export function shiftMonth(ym, by) {
  const n = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + by;
  return Math.floor(n / 12) + "-" + String((n % 12) + 1).padStart(2, "0");
}

// slips are usually made on the 1st for the month just ended
export const lastMonth = () => shiftMonth(thisMonth(), -1);

export const validMonth = (ym) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(ym || ""));

// "2026-09" → "September 2026"
export function monthLabel(ym, short = false) {
  if (!validMonth(ym)) return "";
  return (short ? MONTHS : MONTHS_LONG)[Number(ym.slice(5, 7)) - 1] + " " + ym.slice(0, 4);
}

/* ---------- dates ---------- */

// day / month / year of an IST timestamp
function istParts(d) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t) => Number(p.find((x) => x.type === t).value);
  return { day: get("day"), month: get("month"), year: get("year") };
}

// server timestamps are IST "yyyy-MM-dd HH:mm:ss"
function parseIst(s) {
  if (!s) return null;
  const d = new Date(String(s).replace(" ", "T") + "+05:30");
  return isNaN(d) ? null : d;
}

export function fmtDateTime(s) {
  const d = parseIst(s);
  if (!d) return "";
  const { day, month } = istParts(d);
  const time = d.toLocaleTimeString("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  return `${day} ${MONTHS[month - 1]}, ${time}`;
}

// "2024-01-12" → "12 Jan 2024"
export function fmtDate(s) {
  const d = parseIst(String(s).length === 10 ? s + " 00:00:00" : s);
  if (!d) return "";
  const { day, month, year } = istParts(d);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

// "12 Jan" — for a birthday, where the year is not the point
export function fmtDayMonth(s) {
  const d = parseIst(String(s).slice(0, 10) + " 00:00:00");
  if (!d) return "";
  const { day, month } = istParts(d);
  return `${day} ${MONTHS[month - 1]}`;
}

// how long someone has been with the company, as of today: "2 yrs 8 mos", "5 mos", "New"
export function tenure(doj) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(doj || ""))) return "";
  const t = istDate();
  let months = (Number(t.slice(0, 4)) - Number(doj.slice(0, 4))) * 12 + Number(t.slice(5, 7)) - Number(doj.slice(5, 7));
  if (Number(t.slice(8, 10)) < Number(doj.slice(8, 10))) months--;
  if (months < 0) return "Joins " + fmtDate(doj);
  if (months === 0) return "New this month";
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y ? plural("yr", y) : "", m ? plural("mo", m) : ""].filter(Boolean).join(" ");
}

export function initials(name) {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// plural("slip", 1) → "1 slip", plural("slip", 3) → "3 slips"
export const plural = (word, n) => `${n} ${word}${Number(n) === 1 ? "" : "s"}`;

export const ROLE_LABEL = { owner: "Admin" };
