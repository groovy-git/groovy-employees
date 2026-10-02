import { useMemo, useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { useApp } from "../store";
import { api } from "../lib/api";
import { useCachedFetch } from "../lib/cached";
import { navigate } from "../lib/router";
import TopBar, { Updating } from "../components/TopBar";
import { Avatar, Chips, Empty, SearchBar, SkeletonList } from "../components/ui";
import EmployeeSheet, { NEW_EMPLOYEE } from "../components/EmployeeSheet";

export default function Employees() {
  const { toast, inr } = useApp();
  const [q, setQ] = useState("");
  const [show, setShow] = useState("active");
  const [edit, setEdit] = useState(null);
  const { data: list, loading, reload } = useCachedFetch("ge_employees", () => api("listEmployees").then((r) => r.data), [], (e) => toast(e.message, "error"));

  const counts = useMemo(() => {
    const active = (list || []).filter((e) => e.status !== "left").length;
    return { active, left: (list || []).length - active };
  }, [list]);

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return (list || []).filter((e) => {
      if (show !== "all" && (e.status === "left") !== (show === "left")) return false;
      const hay = `${e.name} ${e.designation} ${e.location} ${e.phone} emp no ${e.emp_no}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [list, q, show]);

  return (
    <>
      <TopBar title="Employees" right={loading && list ? <Updating /> : null} />
      <div className="page">
        <SearchBar value={q} onChange={setQ} placeholder="Search name, role or Emp No." />
        <div className="mt">
          <Chips
            value={show}
            onChange={setShow}
            options={[
              { value: "active", label: `Active${list ? " · " + counts.active : ""}` },
              { value: "left", label: `Left${list ? " · " + counts.left : ""}` },
              { value: "all", label: "All" },
            ]}
          />
        </div>
        {!list ? (
          <div className="mt"><SkeletonList /></div>
        ) : shown.length === 0 ? (
          <Empty
            icon={Users}
            title={list.length === 0 ? "No employees yet" : "Nobody found"}
            text={list.length === 0 ? "Tap Add employee to start." : q ? "Try a different search." : show === "left" ? "Nobody has left." : ""}
          />
        ) : (
          <div className="list mt">
            {shown.map((e) => (
              <button key={e.id} className="list-item" onClick={() => navigate("employees/" + e.id)} style={e.status === "left" ? { opacity: 0.6 } : null}>
                <Avatar name={e.name} />
                <div className="grow">
                  <div className="title ellipsis">
                    {e.name} <span className="muted small">· Emp No. {e.emp_no}</span>
                  </div>
                  <div className="sub ellipsis">{[e.designation, e.location].filter(Boolean).join(" · ")}</div>
                </div>
                {e.status === "left" ? (
                  <span className="badge bad">Left</span>
                ) : e.pay_type === "event" ? (
                  // no base salary: what one event day pays
                  <span className="money small right">
                    <b>{inr(e.day_rate)}</b>
                    <span className="muted"> / day</span>
                  </span>
                ) : (
                  <b className="money small">{inr(e.base_salary)}</b>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="fab" onClick={() => setEdit(NEW_EMPLOYEE)}>
        <UserPlus size={20} /> Add employee
      </button>
      <EmployeeSheet
        e={edit}
        all={list || []}
        onClose={() => setEdit(null)}
        onSaved={() => {
          setEdit(null);
          reload();
        }}
      />
    </>
  );
}
