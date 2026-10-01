import { r2 } from "./format";

/**
 * The slip's figures as they are being typed — the same arithmetic as backend/slips.gs computeSlip_.
 * These only feed the screen: on save the server works everything out again from the base, the days
 * off and the lines, and never takes a total from the app.
 *
 * `leaveAmount` / `holidayAmount` are what the admin typed over the worked-out amounts ("" = not typed).
 */
export function slipFigures({ base, salaryDays, paidHolidays, daysOff, items, leaveAmount, holidayAmount }) {
  const b = Number(base) || 0;
  const off = Number(daysOff) || 0;
  const perDay = b / (Number(salaryDays) || 30);
  const unpaid = Math.max(0, r2(off - paidHolidays));
  const unused = Math.max(0, r2(paidHolidays - off));
  const leaveAuto = Math.round(perDay * unpaid);
  const holidayAuto = Math.round(perDay * unused);
  const typed = (v, auto) => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? auto : r2(Number(v)));
  const leave = unpaid > 0 ? typed(leaveAmount, leaveAuto) : 0;
  const holiday = unused > 0 ? typed(holidayAmount, holidayAuto) : 0;
  const sum = (kind) => items.filter((i) => i.kind === kind).reduce((a, i) => a + (Number(i.amount) || 0), 0);
  const earnings = r2(sum("earning") + holiday);
  const deductions = r2(sum("deduction") + leave);
  return { perDay: r2(perDay), unpaid, unused, leaveAuto, holidayAuto, leave, holiday, earnings, deductions, net: r2(b + earnings - deductions) };
}

export const daysLabel = (n) => (n === 0.5 ? "half day" : `${n} ${n === 1 ? "day" : "days"}`);

// whole or half days, 0 to 31 — the same rule the server applies
export function validDaysOff(v) {
  const n = Number(v);
  return v !== "" && !isNaN(n) && n >= 0 && n <= 31 && Math.abs(n * 2 - Math.round(n * 2)) < 1e-9;
}
