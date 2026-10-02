import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Eye, ExternalLink, FileDown, LockOpen, Mail, MessageCircle, Minus, Plus, Printer, Share2, Trash2 } from "lucide-react";
import { useApp } from "../store";
import { api } from "../lib/api";
import { runBusy } from "../lib/busy";
import { goBack, navigate } from "../lib/router";
import { fmtDateTime } from "../lib/format";
import { daysLabel, slipFigures, validDaysOff } from "../lib/slip";
import { copyText, printHtml, slipPrintHtml, whatsappLink, whatsappText } from "../lib/print";
import TopBar from "../components/TopBar";
import { Avatar, Button, Empty, Field, MoneyInput, Sheet, SkeletonList, useConfirm } from "../components/ui";
import { LineList } from "../components/Lines";
import SlipBadge from "../components/SlipBadge";

// what the editor holds, from a slip as the server sent it
function formOf(d) {
  const auto = (category) => d.items.find((i) => i.auto && i.category === category);
  // an amount on a days-off line that differs from the worked-out one was typed in by the admin
  const typed = (item, worked) => (item && item.amount !== worked ? String(item.amount) : "");
  return {
    base: String(d.slip.base_salary),
    daysOff: String(d.slip.days_off),
    items: d.items.filter((i) => !i.auto).map((i) => ({ kind: i.kind, category: i.category, label: i.label, amount: i.amount })),
    leaveAmount: typed(auto("Unpaid leave"), d.auto.leave_amount),
    holidayAmount: typed(auto("Holiday not taken"), d.auto.holiday_amount),
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
  const [confirm, confirmNode] = useConfirm();
  const dirty = JSON.stringify(f) !== saved;

  const fig = useMemo(
    () => slipFigures({ base: f.base, salaryDays: s.salary_days, paidHolidays: s.paid_holidays, daysOff: f.daysOff, items: f.items, leaveAmount: f.leaveAmount, holidayAmount: f.holidayAmount }),
    [f, s.salary_days, s.paid_holidays],
  );
  const daysOk = validDaysOff(f.daysOff);
  const baseOk = f.base !== "" && Number(f.base) >= 0;

  // the worked-out amounts follow the base and the days off; changing either drops a typed-over amount
  const setBase = (v) => setF({ ...f, base: v, leaveAmount: "", holidayAmount: "" });
  const setDays = (v) => setF({ ...f, daysOff: v, leaveAmount: "", holidayAmount: "" });
  const stepDays = (by) => setDays(String(Math.max(0, Math.min(31, (Number(f.daysOff) || 0) + by))));

  const adopt = (data) => {
    setD(data);
    setF(formOf(data));
    setSaved(JSON.stringify(formOf(data)));
  };

  const save = useCallback(async () => {
    const r = await api("saveSlip", { id: s.id, base_salary: f.base, days_off: f.daysOff, items: f.items, leave_amount: f.leaveAmount, holiday_amount: f.holidayAmount, notes: f.notes });
    adopt(r.data);
    return r;
  }, [f, s.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (label, fn) => {
    if (!baseOk) return toast("Enter the base salary", "error");
    if (!daysOk) return toast("Days off must be in whole or half days, 0 to 31", "error");
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

  // what the days off come to, in a line
  const paid = s.paid_holidays;
  const daysNote = !daysOk
    ? null
    : fig.unpaid > 0
      ? `${paid ? `${paid} paid holiday${paid === 1 ? "" : "s"}, ` : ""}${fig.unpaid} unpaid: −${inr(fig.leave)}`
      : fig.unused > 0
        ? `${Number(f.daysOff) ? daysLabel(fig.unused) + " of holiday" : "Holiday"} not taken: +${inr(fig.holiday)}`
        : paid
          ? "Paid holiday taken — nothing added or deducted."
          : "No days off.";

  // a line the app writes from the days off; its amount can be typed over
  const autoRow = (label, days, value, worked, key) => (
    <div className="line-row">
      <div className="grow">
        <div className="bold">
          {label} ({daysLabel(days)})
        </div>
        <div className="tiny muted">
          {value !== "" && Number(value) !== worked ? (
            <>
              Worked out: {inr(worked)} ·{" "}
              <button type="button" onClick={() => setF({ ...f, [key]: "" })} style={{ border: 0, background: "none", padding: 0, color: "var(--brown)", fontWeight: 700, cursor: "pointer", fontSize: "inherit" }}>
                use it
              </button>
            </>
          ) : (
            `${inr(fig.perDay)} a day × ${days}`
          )}
        </div>
      </div>
      <div className="amt">
        <MoneyInput value={value !== "" ? value : String(worked)} onChange={(v) => setF({ ...f, [key]: v })} aria-label={label + " amount"} />
      </div>
    </div>
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
          <Field label="Base salary for the month" hint={`One day's salary: ${inr(fig.perDay)} (base ÷ ${s.salary_days})`} error={baseOk ? null : "Enter the base salary"}>
            <MoneyInput value={f.base} onChange={setBase} />
          </Field>
          <Field label="Days off taken" hint={daysNote} error={daysOk ? null : "Whole or half days, 0 to 31"}>
            <div className="row">
              <button type="button" className="icon-btn soft" onClick={() => stepDays(-0.5)} aria-label="Half a day less">
                <Minus size={18} />
              </button>
              <input className="input center" style={{ width: 96 }} inputMode="decimal" value={f.daysOff} onChange={(e) => setDays(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Days off taken" />
              <button type="button" className="icon-btn soft" onClick={() => stepDays(0.5)} aria-label="Half a day more">
                <Plus size={18} />
              </button>
            </div>
          </Field>
        </div>

        <div className="section-label">Earnings</div>
        <div className="card" style={{ padding: "4px 14px" }}>
          <div className="line-row">
            <div className="grow bold">Base salary</div>
            <b className="money">{inr(Number(f.base) || 0)}</b>
          </div>
          <LineList kind="earning" lines={f.items} onChange={(items) => setF({ ...f, items })}>
            {fig.unused > 0 && autoRow("Holiday not taken", fig.unused, f.holidayAmount, fig.holidayAuto, "holidayAmount")}
          </LineList>
        </div>

        <div className="section-label">Deductions</div>
        <div className="card" style={{ padding: "4px 14px" }}>
          <LineList kind="deduction" lines={f.items} onChange={(items) => setF({ ...f, items })}>
            {fig.unpaid > 0 && autoRow("Unpaid leave", fig.unpaid, f.leaveAmount, fig.leaveAuto, "leaveAmount")}
          </LineList>
        </div>

        <div className="card mt">
          <div className="kv">
            <span className="k">Base salary</span>
            <span className="money">{inr(Number(f.base) || 0)}</span>
          </div>
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
        <button className="btn" disabled={busy || fig.net < 0} onClick={() => run("Saving draft…", async () => { if (dirty) await save(); setFinalize(true); })}>
          Finalize
        </button>
      </div>

      <Sheet open={preview} onClose={() => setPreview(false)} title="Preview" full>
        <pre className="slip-text">{d.text}</pre>
      </Sheet>
      <FinalizeSheet open={finalize} d={d} onClose={() => setFinalize(false)} onDone={setD} />
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
