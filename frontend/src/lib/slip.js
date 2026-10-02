import { r2 } from "./format";

/**
 * The slip's figures as they are being typed — the same arithmetic as backend/slips.gs computeSlip_.
 * These only feed the screen: on save the server works everything out again from the base, the days
 * off, the event days and the lines, and never takes a total from the app.
 *
 * `leaveAmount` / `holidayAmount` / `eventAmount` are what the admin typed over the worked-out amounts
 * ("" = not typed). Someone paid per event day (`eventPaid`) has no base and no days off.
 */
export function slipFigures({ base, salaryDays, paidHolidays, daysOff, items, leaveAmount, holidayAmount, eventPaid, eventDays, eventRate, eventAmount }) {
  const b = eventPaid ? 0 : Number(base) || 0;
  const off = eventPaid ? 0 : Number(daysOff) || 0;
  const paid = eventPaid ? 0 : Number(paidHolidays) || 0;
  const perDay = eventPaid ? 0 : b / (Number(salaryDays) || 30);
  const unpaid = Math.max(0, r2(off - paid));
  const unused = Math.max(0, r2(paid - off));
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
    perDay: r2(perDay), unpaid, unused, leaveAuto, holidayAuto, leave, holiday,
    eventDays: days, eventRate: rate, eventAuto, event,
    earnings, deductions, net: r2(b + earnings - deductions),
  };
}

export const daysLabel = (n) => (n === 0.5 ? "half day" : `${n} ${n === 1 ? "day" : "days"}`);

// event days are always written as a number: "0.5 days × ₹800" reads as a sum, "half day × ₹800" doesn't
export const eventDaysLabel = (n) => `${n} ${n === 1 ? "day" : "days"}`;

// whole or half days, 0 to 31 — the same rule the server applies to days off and to event days
export function validDaysOff(v) {
  const n = Number(v);
  return v !== "" && !isNaN(n) && n >= 0 && n <= 31 && Math.abs(n * 2 - Math.round(n * 2)) < 1e-9;
}
