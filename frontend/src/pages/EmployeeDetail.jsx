import { useState } from "react";
import { Pencil, Phone, MessageCircle, Mail, FilePlus2, ChevronLeft, ChevronRight, ReceiptText } from "lucide-react";
import { useApp } from "../store";
import { api } from "../lib/api";
import { useCachedFetch } from "../lib/cached";
import { runBusy } from "../lib/busy";
import { navigate, goBack } from "../lib/router";
import { fmtDate, lastMonth, monthLabel, shiftMonth, tenure, thisMonth } from "../lib/format";
import { whatsappLink } from "../lib/print";
import TopBar, { Updating } from "../components/TopBar";
import { Avatar, Button, Empty, Sheet, SkeletonList } from "../components/ui";
import EmployeeSheet from "../components/EmployeeSheet";
import SlipBadge from "../components/SlipBadge";

export default function EmployeeDetail({ id }) {
  const { toast, inr, settings } = useApp();
  const [edit, setEdit] = useState(false);
  const [pick, setPick] = useState(false);
  const onError = (e) => toast(e.message, "error");
  const { data: list, loading, reload } = useCachedFetch("ge_employees", () => api("listEmployees").then((r) => r.data), [], onError);
  const { data: slips, reload: reloadSlips } = useCachedFetch(`ge_slips_of_${id}`, () => api("employeeSlips", { employee_id: id }).then((r) => r.data), [id], onError);
  const e = list ? list.find((x) => x.id === id) : null;

  if (!list)
    return (
      <>
        <TopBar title="Employee" back="employees" />
        <div className="page"><SkeletonList rows={3} height={90} /></div>
      </>
    );
  if (!e)
    return (
      <>
        <TopBar title="Employee" back="employees" />
        <div className="page">
          <Empty title="Employee not found" text="They may have been deleted." action={<button className="btn" onClick={() => navigate("employees", { replace: true })}>All employees</button>} />
        </div>
      </>
    );

  const salaryDays = Number(settings.salary_days) || 30;
  const info = [
    ["Joined", `${fmtDate(e.doj)} · ${tenure(e.doj)}`],
    e.status === "left" && ["Left", e.dol ? fmtDate(e.dol) : "Yes"],
    e.dob && ["Born", fmtDate(e.dob)],
    e.phone && ["Mobile", e.phone],
    e.email && ["Email", e.email],
    e.address && ["Address", e.address],
    e.notes && ["Notes", e.notes],
  ].filter(Boolean);

  return (
    <>
      <TopBar
        title={e.name}
        sub={`No. ${e.emp_no}`}
        back="employees"
        right={
          <>
            {loading && <Updating />}
            <button className="icon-btn" onClick={() => setEdit(true)} aria-label="Edit employee">
              <Pencil size={20} />
            </button>
          </>
        }
      />
      <div className="page">
        <div className="card">
          <div className="row">
            <Avatar name={e.name} gold />
            <div className="grow">
              <div className="bold serif" style={{ fontSize: 17 }}>{e.name}</div>
              <div className="small muted">{[e.designation, e.location].filter(Boolean).join(" · ")}</div>
            </div>
            {e.status === "left" && <span className="badge bad">Left</span>}
          </div>
          <div className="divider" />
          {info.map(([k, v]) => (
            <div key={k} className="kv small">
              <span className="k">{k}</span>
              <span className="right" style={{ overflowWrap: "anywhere" }}>{v}</span>
            </div>
          ))}
          {(e.phone || e.email) && (
            <div className="row wrap mt">
              {e.phone && (
                <a className="btn secondary small" href={`tel:${e.phone}`}>
                  <Phone size={16} /> Call
                </a>
              )}
              {e.phone && (
                <a className="btn wa small" href={whatsappLink(e.phone, "")} target="_blank" rel="noreferrer">
                  <MessageCircle size={16} /> WhatsApp
                </a>
              )}
              {e.email && (
                <a className="btn secondary small" href={`mailto:${e.email}`}>
                  <Mail size={16} /> Email
                </a>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-title">
            <h3>Salary</h3>
            <span className="small muted">{inr(Math.round((e.base_salary / salaryDays) * 100) / 100)} a day</span>
          </div>
          <div className="kv">
            <span className="k">Base salary, per month</span>
            <b className="money">{inr(e.base_salary)}</b>
          </div>
          {e.recurring.map((l, i) => (
            <div key={i} className="kv small">
              <span className="k">{l.label} · every month</span>
              <span className={"money " + (l.kind === "deduction" ? "bad-text" : "ok-text")}>
                {l.kind === "deduction" ? "−" : "+"}
                {inr(l.amount)}
              </span>
            </div>
          ))}
        </div>

        <div className="section-label">Salary slips</div>
        {!slips ? (
          <SkeletonList rows={2} />
        ) : slips.length === 0 ? (
          <div className="card muted small">No slips yet.</div>
        ) : (
          <div className="list">
            {slips.map((s) => (
              <button key={s.id} className="list-item" onClick={() => navigate("slips/" + s.id)}>
                <div className="avatar"><ReceiptText size={20} /></div>
                <div className="grow">
                  <div className="title">{s.month_label}</div>
                  <div className="sub">{s.unpaid_days > 0 ? `${s.unpaid_days} unpaid ${s.unpaid_days === 1 ? "day" : "days"}` : `${s.days_off} ${s.days_off === 1 ? "day" : "days"} off`}</div>
                </div>
                <div className="right">
                  <b className="money">{inr(s.net_salary)}</b>
                  <div><SlipBadge slip={s} /></div>
                </div>
              </button>
            ))}
          </div>
        )}
        <button className="btn secondary block mt" onClick={() => setPick(true)}>
          <FilePlus2 size={18} /> New slip
        </button>
      </div>

      <EmployeeSheet
        e={edit ? e : null}
        all={list}
        onClose={() => setEdit(false)}
        onSaved={(saved) => {
          setEdit(false);
          if (saved === null) return goBack("employees"); // deleted
          reload();
        }}
      />
      <NewSlipSheet open={pick} employee={e} taken={(slips || []).map((s) => s.month)} onClose={() => setPick(false)} onMade={reloadSlips} />
    </>
  );
}

// which month the new slip is for — last month unless they say otherwise
function NewSlipSheet({ open, employee, taken, onClose, onMade }) {
  const { toast } = useApp();
  const [month, setMonth] = useState(lastMonth);
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const has = taken.includes(month);
  const make = async () => {
    setBusy(true);
    try {
      const r = await runBusy("Preparing the slip…", () => api("saveSlip", { employee_id: employee.id, month }));
      onMade();
      onClose();
      navigate("slips/" + r.data.slip.id);
    } catch (ex) {
      toast(ex.message, "error", 4000);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title="New salary slip"
      footer={<Button className="block big" loading={busy} disabled={has} onClick={make}>{has ? "Already has a slip for this month" : `Prepare slip for ${monthLabel(month, true)}`}</Button>}
    >
      <p className="small muted" style={{ marginTop: 0 }}>Which month is the salary for?</p>
      <div className="month-nav">
        <button className="icon-btn soft" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Earlier month">
          <ChevronLeft />
        </button>
        <h2>{monthLabel(month)}</h2>
        <button className="icon-btn soft" disabled={month >= thisMonth()} onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Later month">
          <ChevronRight />
        </button>
      </div>
    </Sheet>
  );
}
