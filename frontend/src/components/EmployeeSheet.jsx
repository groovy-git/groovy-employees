import { useEffect, useState } from "react";
import { useApp } from "../store";
import { api } from "../lib/api";
import { runBusy } from "../lib/busy";
import { istDate } from "../lib/format";
import { Button, DateField, Field, MoneyInput, Sheet, useConfirm } from "./ui";
import { LineList } from "./Lines";

export const NEW_EMPLOYEE = { emp_no: "", name: "", designation: "", location: "", dob: "", doj: "", phone: "", email: "", address: "", base_salary: "", recurring: [], notes: "" };

// values already used, offered as you type so "Kondhwa" is not also "kondhwa" and "Kondwa"
function Suggest({ id, values }) {
  return (
    <datalist id={id}>
      {[...new Set(values.filter(Boolean))].sort().map((v) => (
        <option key={v} value={v} />
      ))}
    </datalist>
  );
}

/**
 * Add or edit an employee. `e` is the employee (NEW_EMPLOYEE for a new one), null closes the sheet;
 * `all` is the current list, for the suggestions. onSaved gets the saved employee, or null after a delete.
 */
export default function EmployeeSheet({ e, all = [], onClose, onSaved }) {
  const { toast, inr, settings } = useApp();
  const [f, setF] = useState(e || {});
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(null);
  const [confirm, confirmNode] = useConfirm();
  useEffect(() => setF(e || {}), [e]);
  if (!e) return null;
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value });
  const salaryDays = Number(settings.salary_days) || 30;
  const base = Number(f.base_salary) || 0;

  const run = async (label, action, payload, done) => {
    setBusy(true);
    try {
      const r = await runBusy(label, () => api(action, payload));
      toast(r.message, "success");
      done(r.data);
    } catch (ex) {
      toast(ex.message, "error", 4000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      full
      onClose={onClose}
      title={e.id ? "Edit employee" : "Add employee"}
      footer={<Button className="block big" loading={busy} onClick={() => run("Saving employee…", "saveEmployee", f, onSaved)}>Save</Button>}
    >
      <div className="grid-2">
        <Field label="Employee no." hint="Their id in the Groovy Kiosk sheet">
          <input className="input" inputMode="numeric" value={f.emp_no ?? ""} onChange={(ev) => setF({ ...f, emp_no: ev.target.value.replace(/\D/g, "") })} />
        </Field>
        <Field label="Date of joining">
          <DateField value={f.doj} onChange={set("doj")} aria-label="Date of joining" />
        </Field>
      </div>
      <Field label="Full name">
        <input className="input" value={f.name || ""} onChange={set("name")} autoCapitalize="words" />
      </Field>
      <div className="grid-2">
        <Field label="Role / designation">
          <input className="input" list="ge-designations" value={f.designation || ""} onChange={set("designation")} autoCapitalize="words" />
        </Field>
        <Field label="Location (optional)">
          <input className="input" list="ge-locations" value={f.location || ""} onChange={set("location")} placeholder="Kiosk or office" autoCapitalize="words" />
        </Field>
      </div>
      <Suggest id="ge-designations" values={all.map((x) => x.designation)} />
      <Suggest id="ge-locations" values={all.map((x) => x.location)} />

      <Field label="Monthly base salary" hint={base > 0 ? `One day's salary: ${inr(Math.round((base / salaryDays) * 100) / 100)} (base ÷ ${salaryDays})` : null}>
        <MoneyInput value={String(f.base_salary ?? "")} onChange={(v) => setF({ ...f, base_salary: v })} />
      </Field>

      <div className="section-label" style={{ marginLeft: 0 }}>Contact</div>
      <div className="grid-2">
        <Field label="Mobile">
          <input className="input" type="tel" inputMode="tel" value={f.phone || ""} onChange={set("phone")} />
        </Field>
        <Field label="Date of birth">
          <DateField value={f.dob} max={istDate(-1)} onChange={set("dob")} aria-label="Date of birth" />
        </Field>
      </div>
      <Field label="Email" hint="Salary slips are emailed here">
        <input className="input" type="email" inputMode="email" value={f.email || ""} onChange={set("email")} />
      </Field>
      <Field label="Address (optional)">
        <textarea className="input" value={f.address || ""} onChange={set("address")} />
      </Field>

      <div className="section-label" style={{ marginLeft: 0 }}>Added every month</div>
      <div className="card" style={{ padding: "4px 14px" }}>
        <LineList kind="earning" lines={f.recurring || []} onChange={(recurring) => setF({ ...f, recurring })} />
      </div>
      <div className="section-label" style={{ marginLeft: 0 }}>Deducted every month</div>
      <div className="card" style={{ padding: "4px 14px" }}>
        <LineList kind="deduction" lines={f.recurring || []} onChange={(recurring) => setF({ ...f, recurring })} />
      </div>
      <div className="hint small muted" style={{ margin: "6px 0 12px" }}>Fixed lines, such as a travel allowance, are filled into each new slip. They can still be changed on the slip.</div>

      <Field label="Notes (optional)">
        <textarea className="input" value={f.notes || ""} onChange={set("notes")} />
      </Field>

      {e.id && (
        <div className="grid-2 mt">
          {e.status === "left" ? (
            <button className="btn secondary" disabled={busy} onClick={() => run("Saving…", "setEmployeeStatus", { id: e.id, status: "active" }, onSaved)}>
              Mark as active again
            </button>
          ) : (
            <button className="btn secondary" disabled={busy} onClick={() => setLeaving(istDate())}>
              Mark as left
            </button>
          )}
          <button
            className="btn danger"
            disabled={busy || e.slips > 0}
            onClick={async () => (await confirm({ title: `Delete ${e.name}?`, text: "This cannot be undone.", okText: "Delete", danger: true })) && run("Deleting employee…", "deleteEmployee", { id: e.id }, () => onSaved(null))}
          >
            Delete
          </button>
        </div>
      )}
      {e.slips > 0 && <div className="tiny muted mt">Has salary slips — mark as left instead of deleting, so the slips stay.</div>}

      <Sheet
        open={leaving !== null}
        onClose={() => setLeaving(null)}
        title={`${e.name} has left`}
        footer={
          <Button
            className="block big"
            loading={busy}
            onClick={() =>
              run("Saving…", "setEmployeeStatus", { id: e.id, status: "left", dol: leaving }, (d) => {
                setLeaving(null);
                onSaved(d);
              })
            }
          >
            Mark as left
          </Button>
        }
      >
        <Field label="Last working day" hint="They stay on the payroll up to and including this month. Their slips are kept.">
          <DateField value={leaving || ""} min={e.doj} onChange={(ev) => setLeaving(ev.target.value)} aria-label="Last working day" />
        </Field>
      </Sheet>
      {confirmNode}
    </Sheet>
  );
}
