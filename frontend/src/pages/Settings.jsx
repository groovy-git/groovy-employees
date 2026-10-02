import { useState } from "react";
import { useApp } from "../store";
import { api } from "../lib/api";
import { runBusy } from "../lib/busy";
import TopBar from "../components/TopBar";
import { Button, Chips, Field, Seg } from "../components/ui";

export default function SettingsPage() {
  const { settings, setSettings, toast, inr } = useApp();
  const [f, setF] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("company");
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });

  const save = async () => {
    setBusy(true);
    try {
      const r = await runBusy("Saving settings…", () => api("saveSettings", { settings: f }));
      setSettings(r.data);
      setF((cur) => ({ ...cur, ...r.data })); // the server tidies some values (lists, email addresses)
      toast(r.message, "success");
    } catch (e) {
      toast(e.message, "error", 4000);
    } finally {
      setBusy(false);
    }
  };

  const days = Number(f.salary_days) || 30;
  const holidays = Number(f.paid_holidays) || 0;

  return (
    <>
      <TopBar title="Settings" back="more" />
      <div className="page has-bar">
        <Chips
          value={tab}
          onChange={setTab}
          options={[
            { value: "company", label: "Company" },
            { value: "roles", label: "Roles" },
            { value: "payroll", label: "Salary rules" },
            { value: "slip", label: "Slip & email" },
          ]}
        />
        {tab === "roles" && (
          <div className="card mt">
            <Field label="Roles" hint="One role on each line. These are the choices when you add or edit an employee.">
              <textarea className="input" rows={Math.max(8, String(f.roles || "").split("\n").length + 1)} value={f.roles || ""} onChange={set("roles")} autoCapitalize="words" spellCheck={false} />
            </Field>
            <p className="small muted" style={{ margin: 0 }}>
              Taking a role off this list doesn't change anyone who already has it, or any salary slip. They keep it until you choose another role for them.
            </p>
          </div>
        )}
        {tab === "company" && (
          <div className="card mt">
            <Field label="Company name" hint="Heads every salary slip">
              <input className="input" value={f.business_name || ""} onChange={set("business_name")} />
            </Field>
            <Field label="Tagline (optional)"><input className="input" value={f.tagline || ""} onChange={set("tagline")} /></Field>
            <Field label="Address"><textarea className="input" value={f.address || ""} onChange={set("address")} /></Field>
            <div className="grid-2">
              <Field label="Phone"><input className="input" value={f.phone || ""} onChange={set("phone")} /></Field>
              <Field label="Email"><input className="input" value={f.email || ""} onChange={set("email")} /></Field>
            </div>
          </div>
        )}
        {tab === "payroll" && (
          <div className="card mt">
            <div className="grid-2">
              <Field label="Days in a salary month" hint={`One day's salary = base ÷ ${days}. On ${inr(15000)} that is ${inr(Math.round((15000 / days) * 100) / 100)}.`}>
                <input className="input" inputMode="decimal" value={f.salary_days || ""} onChange={set("salary_days")} />
              </Field>
              <Field label="Paid holidays a month" hint={holidays ? `Days off beyond ${holidays} are unpaid. A holiday not taken is paid as an extra day.` : "Every day off is unpaid."}>
                <input className="input" inputMode="decimal" value={f.paid_holidays ?? ""} onChange={set("paid_holidays")} />
              </Field>
            </div>
            <p className="small muted" style={{ marginTop: 0 }}>A change here applies to slips prepared from now on. Slips that already exist keep the rules they were made with.</p>
            <Field label="Currency symbol"><input className="input" style={{ maxWidth: 110 }} maxLength={4} value={f.currency_symbol || ""} onChange={set("currency_symbol")} /></Field>
            <Field label="Earning types" hint="Comma separated. Offered when you add an earning to a slip.">
              <textarea className="input" value={f.earning_types || ""} onChange={set("earning_types")} />
            </Field>
            <Field label="Deduction types" hint="Comma separated. Unpaid leave is worked out from the days off, so it isn't listed here.">
              <textarea className="input" value={f.deduction_types || ""} onChange={set("deduction_types")} />
            </Field>
          </div>
        )}
        {tab === "slip" && (
          <div className="card mt">
            <Field label="Line at the foot of every slip"><textarea className="input" value={f.slip_footer || ""} onChange={set("slip_footer")} /></Field>
            <div className="field">
              <label>Offer to email the slip when it is finalized</label>
              <Seg value={f.email_slips || "yes"} onChange={set("email_slips")} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
              <div className="hint">The slip goes to the employee's own address, with the PDF attached. You can always email it later from the slip.</div>
            </div>
            <Field label="Copy every slip email to" hint="Optional. Addresses separated by commas, e.g. your accountant.">
              <input className="input" inputMode="email" value={f.slip_email_cc || ""} onChange={set("slip_email_cc")} />
            </Field>
            <p className="small muted" style={{ marginBottom: 0 }}>Emails are sent from the Google account that owns the Sheet. A personal Gmail account can send about 100 a day.</p>
          </div>
        )}
      </div>
      <div className="actionbar">
        <Button className="big" loading={busy} onClick={save}>
          Save settings
        </Button>
      </div>
    </>
  );
}
