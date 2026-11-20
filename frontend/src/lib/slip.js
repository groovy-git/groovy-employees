import { r2 } from "./format";

/**
 * The slip's figures as they are being typed — the same arithmetic as backend/slips.gs computeSlip_.
 * These only feed the screen: on save the server works everything out again from the base, the days
 * off, the event days and the lines, and never takes a total from the app.
 *
 * The days off come in four kinds, as counts: paidOff / paidHalf / unpaidOff / unpaidHalf (a half day
 * counts as one half day). `leaveAmount` / `holidayAmount` / `eventAmount` are what the admin typed
 * over the worked-out amounts ("" = not typed). Someone paid per event day (`eventPaid`) has no base
 * and no days off.
 */
export function slipFigures({ base, salaryDays, paidHolidays, paidOff, paidHalf, unpaidOff, unpaidHalf, items, leaveAmount, holidayAmount, eventPaid, eventDays, eventRate, eventAmount }) {
  const n = (v) => (eventPaid ? 0 : Number(v) || 0);
  const b = n(base);
  const paid = n(paidHolidays);
  const perDay = eventPaid ? 0 : b / (Number(salaryDays) || 30);
  const paidUsed = r2(n(paidOff) + n(paidHalf) / 2);
  const unpaid = r2(n(unpaidOff) + n(unpaidHalf) / 2);
  const unused = Math.max(0, r2(paid - paidUsed));
  const leaveAuto = Math.round(perDay * unpaid);
  const holidayAuto = Math.round(perDay * unused);
  const days = Number(eventDays) || 0;
  const rate = Number(eventRate) || 0;
  const eventAuto = r2(days * rate);
  const typed = (v, auto) => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? auto : r2(Number(v)));
  const leave = unpaid > 0 ? typed(leaveAmount, leaveAuto) : 0;
  const holiday = unused > 0 ? typed(holidayAmount, holidayAuto) : 0;
  const event = days > 0 ? typed(eventAmount, eventAuto) : 0;
  const sum = (kind) => items.filter((i) => i.kind === kind).reduce((a, i) => a + (Number(i.amount) || 0), 0);
  const earnings = r2(sum("earning") + holiday + event);
  const deductions = r2(sum("deduction") + leave);
  return {
    perDay: r2(perDay), paidUsed, daysOff: r2(paidUsed + unpaid), unpaid, unused, leaveAuto, holidayAuto, leave, holiday,
    eventDays: days, eventRate: rate, eventAuto, event,
    earnings, deductions, net: r2(b + earnings - deductions),
  };
}

export const daysLabel = (n) => (n === 0.5 ? "half day" : `${n} ${n === 1 ? "day" : "days"}`);

// event days are always written as a number: "0.5 days × ₹800" reads as a sum, "half day × ₹800" doesn't
export const eventDaysLabel = (n) => `${n} ${n === 1 ? "day" : "days"}`;

// whole or half days, 0 to 31 — the rule the server applies to event days
export function validDaysOff(v) {
  const n = Number(v);
  return v !== "" && !isNaN(n) && n >= 0 && n <= 31 && Math.abs(n * 2 - Math.round(n * 2)) < 1e-9;
}

/**
 * What is wrong with these days off, in the server's words (backend/slips.gs checkOff_), or null.
 * Paid days off can't be more than the paid holidays, and the paid holidays are used first: a whole
 * day can't be unpaid while a whole paid holiday is left, nor a half day while half of one is left.
 */
export function offProblem({ paidOff, paidHalf, unpaidOff, unpaidHalf }, paidHolidays) {
  const v = [paidOff, paidHalf, unpaidOff, unpaidHalf].map((x) => (x === "" || x === undefined ? 0 : Number(x)));
  if (v.some((x) => isNaN(x) || x < 0 || x > 31 || Math.floor(x) !== x)) return "Days off are counted in whole days and half days, 0 to 31";
  const [po, ph, uo, uh] = v;
  const paid = Number(paidHolidays) || 0;
  const used = r2(po + ph / 2);
  if (r2(used + uo + uh / 2) > 31) return "Days off can't be more than 31";
  if (used > paid) return paid ? `Paid days off can't be more than the ${paid} paid holiday${paid === 1 ? "" : "s"}` : "There are no paid holidays this month, so days off are unpaid";
  const left = r2(paid - used);
  if ((uo > 0 && left >= 1) || (uh > 0 && left >= 0.5)) return `Use the paid holidays first: ${daysLabel(left)} left`;
  return null;
}

/* ---------- dates marked on the calendar ---------- */

// what a date can be marked as, in the order they are offered and printed (backend/slipdoc.gs MARK_LABELS_)
export const MARKS = [
  { key: "paid", count: "paidOff", label: "Paid day off", list: "Paid off", short: "P", tone: "paid" },
  { key: "paid_half", count: "paidHalf", label: "Paid half day", list: "Paid ½ off", short: "½P", tone: "paid half" },
  { key: "unpaid", count: "unpaidOff", label: "Unpaid day off", list: "Unpaid off", short: "U", tone: "unpaid" },
  { key: "unpaid_half", count: "unpaidHalf", label: "Unpaid half day", list: "Unpaid ½ off", short: "½U", tone: "unpaid half" },
  { key: "event", count: "event", label: "Event day", list: "Event days", short: "E", tone: "event" },
];
export const markOf = (key) => MARKS.find((m) => m.key === key);

/** What the marked dates come to: { paidOff, paidHalf, unpaidOff, unpaidHalf, event, off } (off = how many dates are days off). */
export function marksToCounts(marks) {
  const c = { paidOff: 0, paidHalf: 0, unpaidOff: 0, unpaidHalf: 0, event: 0 };
  Object.values(marks || {}).forEach((k) => {
    const m = markOf(k);
    if (m) c[m.count]++;
  });
  c.off = c.paidOff + c.paidHalf + c.unpaidOff + c.unpaidHalf;
  return c;
}

// 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd"
export function ordinal(n) {
  const t = n % 100;
  return n + (t >= 11 && t <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
}

/** The marked dates by kind: [{ key, list: "Paid off", days: "2nd, 24th" }] for each kind that has any. */
export function markList(marks, keys) {
  const days = Object.keys(marks || {}).map(Number).sort((a, b) => a - b);
  return MARKS.filter((m) => !keys || keys.includes(m.key))
    .map((m) => ({ key: m.key, list: m.list, days: days.filter((d) => marks[d] === m.key).map(ordinal).join(", ") }))
    .filter((m) => m.days);
}

export const OFF_MARK_KEYS = ["paid", "paid_half", "unpaid", "unpaid_half"];
