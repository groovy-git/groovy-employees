import { useState } from "react";
import { ChevronLeft, ChevronRight, Download, FilePlus2, Send, Users } from "lucide-react";
import { useApp } from "../store";
import { api } from "../lib/api";
import { useCachedFetch } from "../lib/cached";
import { runBusy } from "../lib/busy";
import { navigate } from "../lib/router";
import { lastMonth, monthLabel, plural, shiftMonth, thisMonth, validMonth } from "../lib/format";
import { toCSV, downloadText } from "../lib/files";
import TopBar, { Updating } from "../components/TopBar";
import { Avatar, Empty, SkeletonList, useConfirm } from "../components/ui";
import SlipBadge from "../components/SlipBadge";

export default function Payroll({ month: fromRoute }) {
  const { toast, inr } = useApp();
  const month = validMonth(fromRoute) ? fromRoute : lastMonth();
  const [busy, setBusy] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  const { data, loading, reload } = useCachedFetch(`ge_month_${month}`, () => api("listMonth", { month }).then((r) => r.data), [month], (e) => toast(e.message, "error"));

  // the month in the address, so Back from a slip returns to the month it belongs to
  const go = (m) => navigate("payroll/" + m, { replace: true });
  const s = data ? data.summary : null;
  const toEmail = s ? s.finals - s.emailed : 0;

  const act = async (label, fn) => {
    setBusy(true);
    try {
      await runBusy(label, fn);
    } catch (ex) {
      toast(ex.message, "error", 4000);
    } finally {
      setBusy(false);
      reload();
    }
  };

  const open = (row) => {
    if (row.slip) return navigate("slips/" + row.slip.id);
    if (data.future) return;
    act("Preparing the slip…", async () => {
      const r = await api("saveSlip", { employee_id: row.employee.id, month });
      navigate("slips/" + r.data.slip.id);
    });
  };

  const prepareAll = () =>
    act("Preparing drafts…", async () => {
      const r = await api("prepareMonth", { month });
      toast(r.message, "success", 3500);
    });

  const emailAll = async () => {
    const without = data.rows.filter((r) => r.slip && r.slip.status === "final" && !r.slip.emailed_at && !r.employee.email).map((r) => r.employee.name);
    const sending = toEmail - without.length;
    if (!sending) return toast("None of the slips waiting has an email address on the profile.", "warn", 4000);
    const text =
      `Each employee gets their ${monthLabel(month)} slip at their own address, with the PDF attached.` +
      (without.length ? ` Not sent, no email address: ${without.join(", ")}.` : "");
    if (!(await confirm({ title: `Email ${plural("slip", sending)}?`, text, okText: "Send" }))) return;
    act("Emailing slips…", async () => {
      // the server sends for about 25 seconds at a time and says how many are left
      let sent = 0;
      let last;
      do {
        last = (await api("emailMonth", { month })).data;
        sent += last.sent;
      } while (last.remaining > 0 && last.sent > 0);
      const problems = [last.failed.length ? `could not send to ${last.failed.join(", ")}` : "", last.stopped].filter(Boolean);
      toast(`${plural("slip", sent)} emailed` + (problems.length ? "; " + problems.join("; ") : "") + ".", problems.length ? "warn" : "success", 5000);
    });
  };

  const exportCsv = () => {
    const text = toCSV(data.rows, [
      { label: "Emp No", get: (r) => r.employee.emp_no },
      { label: "Name", get: (r) => r.employee.name },
      { label: "Role", get: (r) => r.employee.designation },
      { label: "Location", get: (r) => r.employee.location },
      { label: "Base salary", get: (r) => (r.slip ? r.slip.base_salary : r.employee.base_salary) },
      { label: "Earnings", get: (r) => (r.slip ? r.slip.earnings_total : "") },
      { label: "Deductions", get: (r) => (r.slip ? r.slip.deductions_total : "") },
      { label: "Net salary", get: (r) => (r.slip ? r.slip.net_salary : "") },
      { label: "Days off", get: (r) => (r.slip ? r.slip.days_off : "") },
      { label: "Unpaid days", get: (r) => (r.slip ? r.slip.unpaid_days : "") },
      { label: "Status", get: (r) => (!r.slip ? "Not started" : r.slip.status === "final" ? "Final" : "Draft") },
      { label: "Emailed to", get: (r) => (r.slip ? r.slip.emailed_to : "") },
    ]);
    downloadText(`payroll-${month}.csv`, text);
  };

  const bar = s && !data.future && (s.not_started > 0 || toEmail > 0);

  return (
    <>
      <TopBar
        title="Payroll"
        right={
          <>
            {loading && data && <Updating />}
            {data && data.rows.length > 0 && (
              <button className="icon-btn" onClick={exportCsv} aria-label="Download this month as CSV">
                <Download size={20} />
              </button>
            )}
          </>
        }
      />
      <div className={"page" + (bar ? " has-bar" : "")}>
        <div className="month-nav">
          <button className="icon-btn soft" onClick={() => go(shiftMonth(month, -1))} aria-label="Earlier month">
            <ChevronLeft />
          </button>
          <h2>{monthLabel(month)}</h2>
          <button className="icon-btn soft" disabled={month >= thisMonth()} onClick={() => go(shiftMonth(month, 1))} aria-label="Later month">
            <ChevronRight />
          </button>
        </div>

        {!data ? (
          <div className="mt"><SkeletonList /></div>
        ) : data.rows.length === 0 ? (
          <Empty icon={Users} title="Nobody on the payroll" text={`No employee had joined by ${monthLabel(month)}, or all had left.`} />
        ) : (
          <>
            <div className="grid-3 mt">
              <div className="stat brown">
                <div className="label">Net total</div>
                <div className="value" style={{ fontSize: 18 }}>{inr(s.total_net)}</div>
              </div>
              <div className="stat">
                <div className="label">Final</div>
                <div className="value" style={{ fontSize: 18 }}>
                  {s.finals} <span className="muted small">of {s.employees}</span>
                </div>
              </div>
              <div className="stat">
                <div className="label">Emailed</div>
                <div className="value" style={{ fontSize: 18 }}>
                  {s.emailed} <span className="muted small">of {s.finals}</span>
                </div>
              </div>
            </div>
            <div className="list mt">
              {data.rows.map((r) => (
                <button key={r.employee.id} className="list-item" disabled={busy} onClick={() => open(r)}>
                  <Avatar name={r.employee.name} />
                  <div className="grow">
                    <div className="title ellipsis">{r.employee.name}</div>
                    <div className="sub ellipsis">
                      Emp No. {r.employee.emp_no} · {r.employee.designation}
                    </div>
                  </div>
                  <div className="right">
                    <b className="money">{r.slip ? inr(r.slip.net_salary) : <span className="muted">{inr(r.employee.base_salary)}</span>}</b>
                    <div><SlipBadge slip={r.slip} /></div>
                  </div>
                </button>
              ))}
            </div>
            <div className="tiny muted center mt">Tap a name to open the slip{s.not_started ? ", or to start it" : ""}.</div>
          </>
        )}
      </div>
      {bar && (
        <div className="actionbar">
          {s.not_started > 0 && (
            <button className="btn" disabled={busy} onClick={prepareAll}>
              <FilePlus2 size={18} /> Prepare {plural("draft", s.not_started)}
            </button>
          )}
          {toEmail > 0 && (
            <button className={"btn" + (s.not_started > 0 ? " secondary" : "")} disabled={busy} onClick={emailAll}>
              <Send size={18} /> Email {plural("slip", toEmail)}
            </button>
          )}
        </div>
      )}
      {confirmNode}
    </>
  );
}
