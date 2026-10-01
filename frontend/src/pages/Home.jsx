import { Cake, Award, ChevronRight, UserPlus, Users } from "lucide-react";
import { useApp } from "../store";
import { api } from "../lib/api";
import { useCachedFetch } from "../lib/cached";
import { navigate } from "../lib/router";
import { fmtDayMonth, plural } from "../lib/format";
import TopBar, { Updating } from "../components/TopBar";
import { Empty, SkeletonList } from "../components/ui";

const inDays = (n) => (n === 0 ? "Today" : n === 1 ? "Tomorrow" : `in ${n} days`);

export default function Home() {
  const { toast, inr, user } = useApp();
  const { data, loading } = useCachedFetch("ge_dashboard", () => api("dashboard").then((r) => r.data), [], (e) => toast(e.message, "error"));

  if (!data)
    return (
      <>
        <TopBar title="Home" />
        <div className="page">
          <SkeletonList rows={3} height={90} />
        </div>
      </>
    );

  const p = data.payroll;
  const done = p.employees > 0 && p.finals === p.employees;
  // what is left to do for last month, in the order it gets done
  const todo = [
    p.not_started ? `${p.not_started} not started` : "",
    p.drafts ? plural("draft", p.drafts) : "",
    p.finals - p.emailed > 0 ? `${p.finals - p.emailed} not emailed` : "",
  ].filter(Boolean);

  return (
    <>
      <TopBar title={`Hello, ${String(user.name || "").split(" ")[0]}`} right={loading ? <Updating /> : null} />
      <div className="page">
        {data.active + data.left === 0 ? (
          <Empty
            icon={Users}
            title="No employees yet"
            text="Add the people on your payroll, then prepare their salary slips each month."
            action={<button className="btn" onClick={() => navigate("employees")}><UserPlus size={18} /> Add employees</button>}
          />
        ) : (
          <>
            <button className="card" onClick={() => navigate("payroll/" + data.month)} style={{ width: "100%", border: 0, textAlign: "left", cursor: "pointer", display: "block" }}>
              <div className="card-title">
                <div>
                  <div className="brand-label">Payroll</div>
                  <h2>{p.label}</h2>
                </div>
                <ChevronRight color="var(--muted)" />
              </div>
              {p.employees === 0 ? (
                <div className="muted small">Nobody was on the payroll that month.</div>
              ) : (
                <>
                  <div className="row between small" style={{ marginBottom: 6 }}>
                    <span>
                      <b>{p.finals}</b> of {p.employees} slips final
                    </span>
                    <b className="money">{inr(p.total_net)}</b>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${Math.round((p.finals / p.employees) * 100)}%`, background: done ? "var(--ok)" : "var(--gold)" }} />
                  </div>
                  <div className="small mt" style={{ color: done && !todo.length ? "var(--ok)" : "var(--charcoal)" }}>
                    {todo.length ? todo.join(" · ") : "All done — every slip is final and emailed."}
                  </div>
                </>
              )}
            </button>

            <div className="grid-2 mt">
              <button className="stat gold" onClick={() => navigate("employees")} style={{ border: 0, textAlign: "left", cursor: "pointer" }}>
                <div className="label">Active employees</div>
                <div className="value">{data.active}</div>
              </button>
              <div className="stat brown">
                <div className="label">Base salaries a month</div>
                <div className="value">{inr(data.base_total)}</div>
              </div>
            </div>

            <div className="section-label">Coming up · next 30 days</div>
            {data.upcoming.length === 0 ? (
              <div className="card muted small">No birthdays or work anniversaries in the next 30 days.</div>
            ) : (
              <div className="list">
                {data.upcoming.map((u) => (
                  <button key={u.type + u.employee_id} className="list-item" onClick={() => navigate("employees/" + u.employee_id)}>
                    <div className="avatar">{u.type === "birthday" ? <Cake size={20} /> : <Award size={20} />}</div>
                    <div className="grow">
                      <div className="title">{u.name}</div>
                      <div className="sub">
                        {u.type === "birthday" ? "Birthday" : `${plural("year", u.years)} with us`} · {fmtDayMonth(u.date)}
                      </div>
                    </div>
                    <span className={"badge" + (u.days <= 1 ? " gold" : "")}>{inDays(u.days)}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
