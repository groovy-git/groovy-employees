import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Copy, Eye, ExternalLink, FileDown, LockOpen, Mail, MessageCircle, Minus, Plus, Printer, Share2, Trash2 } from "lucide-react";
import { useApp } from "../store";
import { api } from "../lib/api";
import { runBusy } from "../lib/busy";
import { goBack, navigate } from "../lib/router";
import { fmtDateTime, r2 } from "../lib/format";
import { OFF_MARK_KEYS, daysLabel, eventDaysLabel, markList, marksToCounts, offProblem, ordinal, slipFigures, validDaysOff } from "../lib/slip";
import { copyText, printHtml, slipPrintHtml, whatsappLink, whatsappText } from "../lib/print";
import TopBar from "../components/TopBar";
import { Avatar, Button, Empty, Field, MoneyInput, Sheet, SkeletonList, useConfirm } from "../components/ui";
import { LineList } from "../components/Lines";
import SlipBadge from "../components/SlipBadge";
import DaysCalendar from "../components/DaysCalendar";

// the four kinds of day off, typed as totals when no dates are marked
const OFF_FIELDS = [
  ["paidOff", "Paid days off"],
  ["paidHalf", "Paid half days"],
  ["unpaidOff", "Unpaid days off"],
  ["unpaidHalf", "Unpaid half days"],
];

// the marks of these kinds only: { "2": "paid", "5": "event" } → { "5": "event" } for ["event"]
const onlyMarks = (marks, keys) => Object.fromEntries(Object.entries(marks || {}).filter(([, v]) => keys.includes(v)));

// what the editor holds, from a slip as the server sent it
function formOf(d) {
  const auto = (category) => d.items.find((i) => i.auto && i.category === category);
  // an amount on one of the app's own lines that differs from the worked-out one was typed in by the admin
  const typed = (item, worked) => (item && item.amount !== worked ? String(item.amount) : "");
  return {
    base: String(d.slip.base_salary),
    paidOff: String(d.slip.paid_off || 0),
    paidHalf: String(d.slip.paid_half || 0),
    unpaidOff: String(d.slip.unpaid_off || 0),
    unpaidHalf: String(d.slip.unpaid_half || 0),
    marks: d.slip.day_marks || {},
    eventDays: String(d.slip.event_days || 0),
    eventRate: d.slip.event_rate ? String(d.slip.event_rate) : "",
    items: d.items.filter((i) => !i.auto).map((i) => ({ kind: i.kind, category: i.category, label: i.label, amount: i.amount })),
    leaveAmount: typed(auto("Unpaid leave"), d.auto.leave_amount),
    holidayAmount: typed(auto("Holiday not taken"), d.auto.holiday_amount),
    eventAmount: typed(auto("Event pay"), d.auto.event_amount),
    notes: d.slip.notes || "",
  };
}

export default function Slip({ id }) {
  const { toast } = useApp();
  const [d, setD] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    api("getSlip", { id })
      .then((r) => live && setD(r.data))
      .catch((e) => {
        if (!live) return;
        if (e.code === "NOT_FOUND") setMissing(true);
        else toast(e.message, "error");
      });
    return () => {
      live = false;
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (missing)
    return (
      <>
        <TopBar title="Salary slip" back="payroll" />
        <div className="page">
          <Empty title="Slip not found" text="It may have been deleted." action={<button className="btn" onClick={() => navigate("payroll", { replace: true })}>Payroll</button>} />
        </div>
      </>
    );
  if (!d)
    return (
      <>
        <TopBar title="Salary slip" back="payroll" />
        <div className="page"><SkeletonList rows={4} height={80} /></div>
      </>
    );
  // keyed by status: finalizing or reopening swaps the whole screen for the other one
  return d.slip.status === "final" ? <FinalSlip key="final" d={d} setD={setD} /> : <DraftSlip key="draft" d={d} setD={setD} />;
}

function Header({ d }) {
  const s = d.slip;
  return (
    <div className="card row">
      <Avatar name={s.employee_name} gold />
      <div className="grow">
        <div className="bold serif" style={{ fontSize: 17 }}>{s.employee_name}</div>
        <div className="small muted">
          Emp No. {s.emp_no} · {[s.designation, s.location].filter(Boolean).join(" · ")}
        </div>
      </div>
      <SlipBadge slip={s} />
    </div>
  );
}

/* ---------- draft: the editor ---------- */

function DraftSlip({ d, setD }) {
  const { toast, inr } = useApp();
  const s = d.slip;
  const [f, setF] = useState(() => formOf(d));
  const [saved, setSaved] = useState(() => JSON.stringify(formOf(d)));
  const [busy, setBusy] = useState(false);
  const [finalize, setFinalize] = useState(false);
  const [preview, setPreview] = useState(false);
  const [calendar, setCalendar] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const dirty = JSON.stringify(f) !== saved;

  // paid only for event days: no base and no days off on this slip
  const eventPaid = s.pay_type === "event";
  const offCounts = { paidOff: f.paidOff, paidHalf: f.paidHalf, unpaidOff: f.unpaidOff, unpaidHalf: f.unpaidHalf };
  const fig = useMemo(
    () =>
      slipFigures({
        base: f.base, salaryDays: s.salary_days, paidHolidays: s.paid_holidays, ...offCounts, items: f.items,
        leaveAmount: f.leaveAmount, holidayAmount: f.holidayAmount,
        eventPaid, eventDays: f.eventDays, eventRate: f.eventRate, eventAmount: f.eventAmount,
      }),
    [f, s.salary_days, s.paid_holidays, eventPaid], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const offErr = eventPaid ? null : offProblem(offCounts, s.paid_holidays);
  const daysOk = !offErr;
  // the dates marked on the calendar, by kind: when there are any, they decide the totals
  const offDates = markList(f.marks, OFF_MARK_KEYS);
  const eventDates = markList(f.marks, ["event"]);
  const baseOk = eventPaid || (f.base !== "" && Number(f.base) >= 0);
  const eventOk = validDaysOff(f.eventDays);
  // event days need a rate, unless the amount itself was typed in
  const rateOk = !(fig.eventDays > 0) || fig.eventRate > 0 || f.eventAmount !== "";
  // no base and nothing earned: an event slip with no days on it yet
  const nothing = !(Number(eventPaid ? 0 : f.base) > 0) && !(fig.earnings > 0);

  // the days of the month they were employed (backend/slips.gs employedSpan_): the whole month, or from
  // the day they joined / to their last working day. A draft from before slips kept these: the month.
  const lastDay = new Date(Date.UTC(Number(s.month.slice(0, 4)), Number(s.month.slice(5, 7)), 0)).getUTCDate();
  const span = s.to_day > 0 ? { from: s.from_day || 1, to: s.to_day } : { from: 1, to: lastDay };
  const monthDays = Math.max(0, span.to - span.from + 1);
  const workedDays = eventPaid ? fig.eventDays : r2(monthDays - fig.daysOff);
  const paidDays = r2(monthDays - fig.unpaid);
  const spanErr =
    !eventPaid && fig.daysOff > monthDays
      ? `Days off can't be more than the number of days (${monthDays})`
      : fig.eventDays > monthDays
        ? `Event days can't be more than the number of days (${monthDays})`
        : null;
  // part of the month: suggest the base for the days employed (one day's salary × the days)
  const fullBase = d.employee ? Number(d.employee.base_salary) || 0 : 0;
  const partBase = !eventPaid && monthDays < lastDay && fullBase > 0 ? Math.round((fullBase / (Number(s.salary_days) || 30)) * monthDays) : null;
  const showPartBase = partBase !== null && partBase < fullBase && partBase !== Number(f.base);
  const spanWords =
    span.from > 1 && span.to < lastDay
      ? `Here from the ${ordinal(span.from)} to the ${ordinal(span.to)}`
      : span.from > 1
        ? `Joined on the ${ordinal(span.from)}`
        : `Last working day the ${ordinal(span.to)}`;

  // the worked-out amounts follow what they are worked out from; changing that drops a typed-over amount
  const setBase = (v) => setF({ ...f, base: v, leaveAmount: "", holidayAmount: "" });
  const setCount = (k, v) => setF({ ...f, [k]: v, leaveAmount: "", holidayAmount: "" });
  const stepCount = (k, by) => setCount(k, String(Math.max(0, Math.min(31, (Number(f[k]) || 0) + by))));
  // one more of this kind would still keep to the rules (not more paid than the paid holidays, paid first)
  const canAdd = (k) => !offProblem({ ...offCounts, [k]: (Number(f[k]) || 0) + 1 }, s.paid_holidays);
  // the calendar's marks: the dates decide the days off and the event days; with the dates cleared,
  // the totals they came to stay, to be changed by hand
  const applyMarks = (marks) => {
    const c = marksToCounts(marks);
    const next = { ...f, marks };
    const offChanged = JSON.stringify(onlyMarks(marks, OFF_MARK_KEYS)) !== JSON.stringify(onlyMarks(f.marks, OFF_MARK_KEYS));
    if (offChanged) Object.assign(next, { leaveAmount: "", holidayAmount: "" });
    if (c.off > 0) Object.assign(next, { paidOff: String(c.paidOff), paidHalf: String(c.paidHalf), unpaidOff: String(c.unpaidOff), unpaidHalf: String(c.unpaidHalf) });
    if (c.event > 0 && String(c.event) !== f.eventDays) Object.assign(next, { eventDays: String(c.event), eventAmount: "" });
    setF(next);
  };
  const setEventDays = (v) => setF({ ...f, eventDays: v, eventAmount: "" });
  const setEventRate = (v) => setF({ ...f, eventRate: v, eventAmount: "" });
  const stepEventDays = (by) => setEventDays(String(Math.max(0, Math.min(31, (Number(f.eventDays) || 0) + by))));

  const adopt = (data) => {
    setD(data);
    setF(formOf(data));
    setSaved(JSON.stringify(formOf(data)));
  };

  const save = useCallback(async () => {
    const r = await api("saveSlip", {
      id: s.id, base_salary: f.base, items: f.items, notes: f.notes,
      paid_off: f.paidOff, paid_half: f.paidHalf, unpaid_off: f.unpaidOff, unpaid_half: f.unpaidHalf, day_marks: f.marks,
      leave_amount: f.leaveAmount, holiday_amount: f.holidayAmount,
      event_days: f.eventDays, event_rate: f.eventRate === "" ? 0 : f.eventRate, event_amount: f.eventAmount,
    });
    adopt(r.data);
    return r;
  }, [f, s.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (label, fn) => {
    if (!baseOk) return toast("Enter the base salary", "error");
    if (!daysOk) return toast(offErr, "error", 4000);
    if (spanErr) return toast(spanErr, "error", 4000);
    if (!eventOk) return toast("Event days must be in whole or half days, 0 to 31", "error");
    if (!rateOk) return toast("Enter the rate for an event day", "error");
    setBusy(true);
    try {
      await runBusy(label, fn);
    } catch (ex) {
      toast(ex.message, "error", 4000);
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!(await confirm({ title: "Delete this draft?", text: `${s.employee_name} · ${s.month_label}. You can prepare it again afterwards.`, okText: "Delete", danger: true }))) return;
    setBusy(true);
    try {
      await runBusy("Deleting draft…", () => api("deleteSlip", { id: s.id }));
      toast("Draft deleted", "success");
      goBack("payroll/" + s.month);
    } catch (ex) {
      toast(ex.message, "error");
      setBusy(false);
    }
  };

  // what the days off come to, in a line: "1.5 of 2 paid holidays used · 2 days unpaid: −₹1,000"
  const paid = Number(s.paid_holidays) || 0;
  const daysNote = [
    paid ? `${fig.paidUsed} of ${paid} paid holiday${paid === 1 ? "" : "s"} used` : fig.unpaid ? null : "No days off",
    fig.unpaid > 0 ? `${daysLabel(fig.unpaid)} unpaid: −${inr(fig.leave)}` : null,
    fig.unused > 0 ? `${daysLabel(fig.unused)} of holiday not taken: +${inr(fig.holiday)}` : null,
    paid && !fig.unpaid && !fig.unused ? "nothing added or deducted" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // a line the app writes itself (from the days off, or the event days); its amount can be typed over.
  // `sum` says what it was worked out from, e.g. "₹500 a day × 2".
  const autoRow = (title, sum, value, worked, key) => (
    <div className="line-row">
      <div className="grow">
        <div className="bold">{title}</div>
        <div className="tiny muted">
          {value !== "" && Number(value) !== worked ? (
            <>
              Worked out: {inr(worked)} ·{" "}
              <button type="button" onClick={() => setF({ ...f, [key]: "" })} style={{ border: 0, background: "none", padding: 0, color: "var(--brown)", fontWeight: 700, cursor: "pointer", fontSize: "inherit" }}>
                use it
              </button>
            </>
          ) : (
            sum
          )}
        </div>
      </div>
      <div className="amt">
        <MoneyInput value={value !== "" ? value : String(worked)} onChange={(v) => setF({ ...f, [key]: v })} aria-label={title + " amount"} />
      </div>
    </div>
  );
  const leaveRow = (title, days, value, worked, key) => autoRow(`${title} (${daysLabel(days)})`, `${inr(fig.perDay)} a day × ${days}`, value, worked, key);

  // how many event days, and what one pays. Everyone can have these; for someone paid per event day
  // they are the whole slip.
  // a field's label with the calendar button beside it
  const datesHead = (label, hasDates) => (
    <div className="row between">
      <label>{label}</label>
      <button type="button" className="btn ghost small" onClick={() => setCalendar(true)}>
        <CalendarDays size={16} /> {hasDates ? "Change dates" : "Pick dates"}
      </button>
    </div>
  );

  const eventFields = (
    <>
      <div className="field">
        {datesHead(eventPaid ? "Event days worked" : "Event days worked (if any)", eventDates.length > 0)}
        {eventDates.length ? (
          // counted from the dates marked
          <div className="row between">
            <span>
              {eventDates[0].days} <span className="muted">({eventDaysLabel(fig.eventDays)})</span>
            </span>
            <button type="button" className="link-btn" onClick={() => applyMarks(onlyMarks(f.marks, OFF_MARK_KEYS))}>
              Clear dates
            </button>
          </div>
        ) : (
          <div className="row">
            <button type="button" className="icon-btn soft" onClick={() => stepEventDays(-1)} aria-label="One event day less">
              <Minus size={18} />
            </button>
            <input className="input center" style={{ width: 96 }} inputMode="decimal" value={f.eventDays} onChange={(e) => setEventDays(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Event days worked" />
            <button type="button" className="icon-btn soft" onClick={() => stepEventDays(1)} aria-label="One event day more">
              <Plus size={18} />
            </button>
          </div>
        )}
        {eventOk ? (
          <div className="hint">{fig.eventDays > 0 ? `${eventDaysLabel(fig.eventDays)} × ${inr(fig.eventRate)} = ${inr(fig.eventAuto)}` : eventPaid ? "Enter the days worked this month, or pick their dates." : "Paid on top of the base salary."}</div>
        ) : (
          <div className="err">Whole or half days, 0 to 31</div>
        )}
      </div>
      {(eventPaid || fig.eventDays > 0) && (
        <Field label="Rate per event day" hint="For this slip. Their usual rate is on their profile." error={rateOk ? null : "Enter the rate for an event day"}>
          <MoneyInput value={f.eventRate} onChange={setEventRate} />
        </Field>
      )}
    </>
  );

  return (
    <>
      <TopBar
        title="Salary slip"
        sub={`${s.employee_name} · ${s.month_label}`}
        back={"payroll/" + s.month}
        right={
          <button className="icon-btn" onClick={del} disabled={busy} aria-label="Delete this draft">
            <Trash2 size={20} />
          </button>
        }
      />
      <div className="page has-bar">
        <Header d={d} />

        <div className="card">
          {eventPaid ? (
            <div className="small muted mb">Paid per event day: no base salary and no days off on this slip.</div>
          ) : (
            <>
              <Field label="Base salary for the month" hint={`One day's salary: ${inr(fig.perDay)} (base ÷ ${s.salary_days})`} error={baseOk ? null : "Enter the base salary"}>
                <MoneyInput value={f.base} onChange={setBase} />
              </Field>
              {showPartBase && (
                // joined or left during the month: the base for the days they were here, if wanted
                <div className="part-month small">
                  {spanWords}: {monthDays} of {lastDay} days. Base for {monthDays} days: <b className="money">{inr(partBase)}</b>{" "}
                  <button type="button" className="link-btn" onClick={() => setBase(String(partBase))}>
                    Use it
                  </button>
                </div>
              )}
              <div className="field">
                {datesHead("Days off", offDates.length > 0)}
                {offDates.length ? (
                  // counted from the dates marked
                  <div>
                    {offDates.map((x) => (
                      <div key={x.key} className="kv small" style={{ padding: "3px 0" }}>
                        <span className="k">{x.list}</span>
                        <span className="right">{x.days}</span>
                      </div>
                    ))}
                    <button type="button" className="link-btn" onClick={() => applyMarks(onlyMarks(f.marks, ["event"]))}>
                      Clear dates and type the totals
                    </button>
                  </div>
                ) : (
                  OFF_FIELDS.map(([k, label]) => (
                    <div key={k} className="stepper-row">
                      <span className="grow small">{label}</span>
                      <button type="button" className="icon-btn soft" disabled={!(Number(f[k]) > 0)} onClick={() => stepCount(k, -1)} aria-label={`One less: ${label}`}>
                        <Minus size={18} />
                      </button>
                      <input className="input center" style={{ width: 60 }} inputMode="numeric" value={f[k]} onChange={(e) => setCount(k, e.target.value.replace(/\D/g, ""))} aria-label={label} />
                      <button type="button" className="icon-btn soft" disabled={!canAdd(k)} onClick={() => stepCount(k, 1)} aria-label={`One more: ${label}`}>
                        <Plus size={18} />
                      </button>
                    </div>
                  ))
                )}
                {offErr ? <div className="err">{offErr}</div> : <div className="hint">{daysNote}</div>}
              </div>
            </>
          )}
          {eventFields}
          {/* the days, as the slip prints them */}
          <div className={"days-sum small" + (spanErr ? " bad-text" : "")}>
            {spanErr || (
              <>
                <span>
                  Number of days <b>{monthDays}</b>
                </span>
                <span>
                  Worked days <b>{workedDays}</b>
                  {eventPaid ? " (event days)" : ""}
                </span>
                {!eventPaid && (
                  <span>
                    Paid days <b>{paidDays}</b>
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <div className="section-label">Earnings</div>
        <div className="card" style={{ padding: "4px 14px" }}>
          {!eventPaid && (
            <div className="line-row">
              <div className="grow bold">Base salary</div>
              <b className="money">{inr(Number(f.base) || 0)}</b>
            </div>
          )}
          {fig.eventDays > 0 && eventOk && autoRow(`Event pay (${eventDaysLabel(fig.eventDays)})`, `${inr(fig.eventRate)} a day × ${fig.eventDays}`, f.eventAmount, fig.eventAuto, "eventAmount")}
          <LineList kind="earning" lines={f.items} onChange={(items) => setF({ ...f, items })}>
            {fig.unused > 0 && leaveRow("Holiday not taken", fig.unused, f.holidayAmount, fig.holidayAuto, "holidayAmount")}
          </LineList>
        </div>

        <div className="section-label">Deductions</div>
        <div className="card" style={{ padding: "4px 14px" }}>
          <LineList kind="deduction" lines={f.items} onChange={(items) => setF({ ...f, items })}>
            {fig.unpaid > 0 && leaveRow("Unpaid leave", fig.unpaid, f.leaveAmount, fig.leaveAuto, "leaveAmount")}
          </LineList>
        </div>

        <div className="card mt">
          {!eventPaid && (
            <div className="kv">
              <span className="k">Base salary</span>
              <span className="money">{inr(Number(f.base) || 0)}</span>
            </div>
          )}
          <div className="kv">
            <span className="k">Earnings</span>
            <span className="money ok-text">+{inr(fig.earnings)}</span>
          </div>
          <div className="kv">
            <span className="k">Deductions</span>
            <span className="money bad-text">−{inr(fig.deductions)}</span>
          </div>
          <div className="kv total">
            <span>Net salary</span>
            <span className={"money" + (fig.net < 0 ? " bad-text" : "")}>{inr(fig.net)}</span>
          </div>
          {fig.net < 0 && <div className="small bad-text">Deductions are more than the salary. Lower one, or carry part of it to next month.</div>}
          {nothing && <div className="small muted">Nothing to pay yet. Enter the event days worked, or delete this draft if they didn't work this month.</div>}
        </div>

        <div className="card">
          <Field label="Note on the slip (optional)">
            <input className="input" value={f.notes} maxLength={300} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="e.g. Advance of 2,000 taken on 5 Sep" />
          </Field>
          <button type="button" className="btn ghost" style={{ paddingLeft: 0 }} disabled={busy} onClick={() => run("Saving draft…", async () => { if (dirty) await save(); setPreview(true); })}>
            <Eye size={18} /> Preview the slip
          </button>
        </div>
      </div>

      <div className="actionbar">
        <button className="btn secondary" disabled={busy || !dirty} onClick={() => run("Saving draft…", async () => toast((await save()).message, "success"))}>
          {dirty ? "Save draft" : "Saved"}
        </button>
        <button className="btn" disabled={busy || fig.net < 0 || nothing} onClick={() => run("Saving draft…", async () => { if (dirty) await save(); setFinalize(true); })}>
          Finalize
        </button>
      </div>

      <Sheet open={preview} onClose={() => setPreview(false)} title="Preview" full>
        <pre className="slip-text">{d.text}</pre>
      </Sheet>
      <FinalizeSheet open={finalize} d={d} onClose={() => setFinalize(false)} onDone={setD} />
      <DaysCalendar
        open={calendar}
        month={s.month}
        monthLabel={s.month_label}
        from={span.from}
        to={span.to}
        marks={f.marks}
        paidHolidays={s.paid_holidays}
        eventPaid={eventPaid}
        onClose={() => setCalendar(false)}
        onDone={(marks) => {
          applyMarks(marks);
          setCalendar(false);
        }}
      />
      {confirmNode}
    </>
  );
}

function FinalizeSheet({ open, d, onClose, onDone }) {
  const { toast, inr, settings } = useApp();
  const email = d.employee ? d.employee.email : "";
  const [send, setSend] = useState(settings.email_slips !== "no");
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const s = d.slip;
  const go = async () => {
    setBusy(true);
    try {
      const r = await runBusy(send && email ? "Finalizing and emailing…" : "Finalizing…", () => api("finalizeSlip", { id: s.id, email: !!(send && email) }));
      // "Slip finalized." alone is good news; anything after it says what did or didn't follow
      toast(r.message, /could not|no email|limit/i.test(r.message) ? "warn" : "success", 5000);
      onClose();
      onDone(r.data);
    } catch (ex) {
      toast(ex.message, "error", 4000);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title="Finalize this slip?" footer={<Button className="block big" loading={busy} onClick={go}>Finalize</Button>}>
      <div className="kv total" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
        <span>Net salary</span>
        <span className="money">{inr(s.net_salary)}</span>
      </div>
      <p className="small muted">
        {s.employee_name} · {s.month_label}. The slip is locked and its PDF is filed in Google Drive. You can reopen it later if something needs correcting.
      </p>
      {email ? (
        <label className="row" style={{ minHeight: 44 }}>
          <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} style={{ width: 22, height: 22, accentColor: "var(--brown)", flex: "none" }} />
          <span>
            Email the slip to <b style={{ overflowWrap: "anywhere" }}>{email}</b>
          </span>
        </label>
      ) : (
        <div className="small" style={{ background: "var(--warn-soft)", borderRadius: 10, padding: "10px 12px" }}>
          {s.employee_name} has no email address, so the slip won't be emailed. Add one on their profile, or share the slip by WhatsApp or print afterwards.
        </div>
      )}
    </Sheet>
  );
}

/* ---------- final: read, send, print ---------- */

function FinalSlip({ d, setD }) {
  const { toast } = useApp();
  const s = d.slip;
  const emp = d.employee || {};
  const [busy, setBusy] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const title = `Salary slip ${s.month_label} - ${s.employee_name}`;

  const run = async (label, action, extra) => {
    setBusy(true);
    try {
      const r = await runBusy(label, () => api(action, { id: s.id, ...extra }));
      toast(r.message, "success", 3500);
      setD(r.data);
    } catch (ex) {
      toast(ex.message, "error", 4000);
    } finally {
      setBusy(false);
    }
  };

  const email = async () => {
    if (!emp.email) return toast(`${s.employee_name} has no email address. Add one on their profile.`, "warn", 4000);
    if (!(await confirm({ title: s.emailed_at ? "Email the slip again?" : "Email the slip?", text: `To ${emp.email}, with the PDF attached.`, okText: "Send" }))) return;
    run("Emailing the slip…", "emailSlip");
  };

  const reopen = async () => {
    const text = "It becomes a draft again so you can correct it. The filed PDF goes to Drive's bin" + (s.emailed_at ? ", and the corrected slip will need emailing again." : ".");
    if (await confirm({ title: "Reopen this slip?", text, okText: "Reopen" })) run("Reopening…", "reopenSlip");
  };

  return (
    <>
      <TopBar title="Salary slip" sub={`${s.employee_name} · ${s.month_label}`} back={"payroll/" + s.month} />
      <div className="page">
        <Header d={d} />
        <div className="small muted" style={{ margin: "10px 4px" }}>
          Finalized {fmtDateTime(s.finalized_at)}
          {s.emailed_at ? ` · Emailed to ${s.emailed_to}, ${fmtDateTime(s.emailed_at)}` : " · Not emailed yet"}
        </div>

        <pre className="slip-text">{d.text}</pre>

        <div className="grid-2 mt">
          <button className={"btn" + (s.emailed_at ? " secondary" : "")} disabled={busy} onClick={email}>
            <Mail size={18} /> {s.emailed_at ? "Email again" : "Email"}
          </button>
          {emp.phone ? (
            <a className="btn wa" href={whatsappLink(emp.phone, whatsappText(d.text))} target="_blank" rel="noreferrer">
              <MessageCircle size={18} /> WhatsApp
            </a>
          ) : (
            <button className="btn secondary" disabled title="No mobile number on the profile">
              <MessageCircle size={18} /> WhatsApp
            </button>
          )}
          <button
            className="btn secondary"
            onClick={async () => ((await copyText(d.text)) ? toast("Slip copied", "success") : toast("Couldn't copy — select the text above and copy it by hand", "warn", 4000))}
          >
            <Copy size={18} /> Copy
          </button>
          <button className="btn secondary" onClick={() => printHtml(slipPrintHtml(d.text, title))}>
            <Printer size={18} /> Print
          </button>
          {s.pdf_url ? (
            <a className="btn secondary" href={s.pdf_url} target="_blank" rel="noreferrer">
              <ExternalLink size={18} /> Open PDF
            </a>
          ) : (
            <button className="btn secondary" disabled={busy} onClick={() => run("Saving the PDF…", "saveSlipPdf")}>
              <FileDown size={18} /> Save PDF
            </button>
          )}
          {navigator.share && (
            <button className="btn secondary" onClick={() => navigator.share({ title, text: d.text }).catch(() => {})}>
              <Share2 size={18} /> Share
            </button>
          )}
        </div>

        <button className="btn ghost block mt-l" disabled={busy} onClick={reopen}>
          <LockOpen size={18} /> Reopen to correct
        </button>
      </div>
      {confirmNode}
    </>
  );
}
