import { useEffect, useState } from "react";
import { Sheet } from "./ui";
import { MARKS, daysLabel, markOf, marksToCounts, offProblem, ordinal } from "../lib/slip";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The slip's month as a calendar: tap a date, then say what it was — a paid or unpaid day off, a paid
 * or unpaid half day, or an event day. A choice that would break the rules (more paid days off than
 * paid holidays, or an unpaid day while a paid holiday is left) is offered greyed out, with the reason.
 * Someone paid per event day only has event days. Dates outside `from`–`to` (before they joined, after
 * their last working day) can't be marked. `onDone` gets the marks: { "2": "paid", "5": "event" }.
 */
export default function DaysCalendar({ open, month, monthLabel, marks, paidHolidays, eventPaid, from = 1, to = 31, onClose, onDone }) {
  const [m, setM] = useState(marks || {});
  const [sel, setSel] = useState(null);
  useEffect(() => {
    if (open) {
      setM(marks || {});
      setSel(null);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null;

  const y = Number(month.slice(0, 4));
  const mo = Number(month.slice(5, 7));
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7; // weeks start on Monday
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  const paid = Number(paidHolidays) || 0;
  const problemOf = (next) => (eventPaid ? null : offProblem(marksToCounts(next), paid));
  const withMark = (day, key) => {
    const next = { ...m };
    if (key) next[day] = key;
    else delete next[day];
    return next;
  };
  const choices = eventPaid ? MARKS.filter((x) => x.key === "event") : MARKS;
  const c = marksToCounts(m);
  const now = problemOf(m);
  const used = c.paidOff + c.paidHalf / 2;
  const unpaid = c.unpaidOff + c.unpaidHalf / 2;
  const pick = (next) => {
    setM(next);
    setSel(null);
  };

  const summary = [
    !eventPaid && (paid ? `Paid ${used} of ${paid}` : "No paid holidays"),
    !eventPaid && unpaid > 0 && `Unpaid ${daysLabel(unpaid)}`,
    c.event > 0 && `Event days ${c.event}`,
  ].filter(Boolean);

  return (
    <Sheet
      open
      full
      onClose={onClose}
      title={`Dates · ${monthLabel}`}
      footer={
        <div className="grid-2">
          <button className="btn secondary" disabled={!Object.keys(m).length} onClick={() => pick({})}>
            Clear all
          </button>
          <button className="btn" disabled={!!now} onClick={() => onDone(m)}>
            Done
          </button>
        </div>
      }
    >
      <div className="cal" role="grid" aria-label={monthLabel}>
        {WEEKDAYS.map((w) => (
          <div key={w} className="wd">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={"x" + i} />;
          const mark = markOf(m[d]);
          const out = d < from || d > to; // not employed that day
          return (
            <button
              key={d}
              type="button"
              disabled={out}
              className={"day" + (mark ? " " + mark.tone : "") + (sel === d ? " sel" : "")}
              onClick={() => setSel(sel === d ? null : d)}
              aria-label={`${ordinal(d)}${out ? ", not employed" : mark ? ", " + mark.label : ""}`}
            >
              {d}
              {mark && <span className="mk">{mark.short}</span>}
            </button>
          );
        })}
      </div>

      {sel ? (
        <div className="cal-pick">
          <div className="bold" style={{ marginBottom: 8 }}>
            {DAY_NAMES[new Date(Date.UTC(y, mo - 1, sel)).getUTCDay()]} {ordinal(sel)}
          </div>
          {choices.map((x) => {
            const next = withMark(sel, x.key);
            const on = m[sel] === x.key;
            // a choice that would break the rules is greyed out — unless the marks already break them,
            // when everything stays open so they can be put right in any order
            const why = on || now ? null : problemOf(next);
            return (
              <button key={x.key} type="button" className={"cal-opt" + (on ? " on" : "")} disabled={!!why} onClick={() => pick(next)}>
                <span className={"sw " + x.tone}>{x.short}</span>
                <span className="grow">
                  {x.label}
                  {why && <small>{why}</small>}
                </span>
              </button>
            );
          })}
          {m[sel] && (
            <button type="button" className="cal-opt" onClick={() => pick(withMark(sel, null))}>
              <span className="sw" />
              <span className="grow">Clear this date</span>
            </button>
          )}
        </div>
      ) : (
        <div className="cal-legend">
          {choices.map((x) => (
            <span key={x.key}>
              <span className={"sw " + x.tone}>{x.short}</span> {x.label}
            </span>
          ))}
          {(from > 1 || to < days) && (
            <span>
              <span className="sw out" /> Not employed
            </span>
          )}
        </div>
      )}

      <div className={"small mt " + (now ? "bad-text" : "muted")}>{now || (summary.length ? summary.join(" · ") : "Tap a date to mark it.")}</div>
    </Sheet>
  );
}
