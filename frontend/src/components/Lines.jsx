import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useApp } from "../store";
import { Button, Field, MoneyInput, Sheet } from "./ui";

// the choices "+ Add" offers, from Settings (a comma-separated list)
export function useLineTypes(kind) {
  const { settings } = useApp();
  const fallback = kind === "earning" ? "Overtime,Commission,Allowance,Bonus,Other" : "Advance,Penalty,Other";
  return String(settings[kind === "earning" ? "earning_types" : "deduction_types"] || fallback)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Add or edit one earning or deduction: what kind it is, what to call it, how much.
 * `line` is { kind, category, label, amount } (a new one has an empty category); null closes the sheet.
 */
export function LineSheet({ line, onClose, onSave, onDelete }) {
  const [f, setF] = useState(line || {});
  const types = useLineTypes(line ? line.kind : "earning");
  useEffect(() => setF(line || {}), [line]);
  if (!line) return null;
  const earning = line.kind === "earning";
  const editing = line.index !== undefined;
  const amount = Number(f.amount);
  const ok = amount > 0;
  const save = () => {
    const category = f.category || types[types.length - 1] || "Other";
    onSave({ kind: line.kind, category, label: (f.label || "").trim() || category, amount: Math.round(amount * 100) / 100 }, line.index);
  };
  return (
    <Sheet
      open
      onClose={onClose}
      title={(editing ? "Edit " : "Add ") + (earning ? "earning" : "deduction")}
      headerRight={
        editing && (
          <button className="icon-btn" onClick={() => onDelete(line.index)} aria-label="Remove this line">
            <Trash2 size={20} />
          </button>
        )
      }
      footer={<Button className="block big" disabled={!ok} onClick={save}>{editing ? "Done" : "Add"}</Button>}
    >
      <div className="field">
        <label>Type</label>
        <div className="chips" style={{ flexWrap: "wrap" }}>
          {types.map((t) => (
            // picking a type names the line too, unless a name of its own was already typed
            <button key={t} type="button" className={"chip" + (f.category === t ? " active" : "")} onClick={() => setF({ ...f, category: t, label: !f.label || f.label === f.category ? t : f.label })}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <Field label="Shown on the slip as" hint={earning ? "e.g. Overtime (6 hrs), Diwali bonus" : "e.g. Advance taken on 5 Sep"}>
        <input className="input" value={f.label || ""} maxLength={60} onChange={(e) => setF({ ...f, label: e.target.value })} />
      </Field>
      <Field label="Amount">
        <MoneyInput value={String(f.amount ?? "")} onChange={(v) => setF({ ...f, amount: v })} autoFocus={!editing} />
      </Field>
    </Sheet>
  );
}

/**
 * The earnings or the deductions of a slip (or an employee's recurring lines): each a row to tap and
 * edit, with "+ Add" under them. `lines` is the whole list, of both kinds; this shows one kind and
 * hands the changed whole list back. `children` are rows the caller puts first (the days-off lines).
 */
export function LineList({ kind, lines, onChange, children, readOnly }) {
  const { inr } = useApp();
  const [edit, setEdit] = useState(null);
  const earning = kind === "earning";
  const shown = lines.map((l, index) => ({ ...l, index })).filter((l) => l.kind === kind);
  const save = (l, index) => {
    onChange(index === undefined ? [...lines, l] : lines.map((x, i) => (i === index ? l : x)));
    setEdit(null);
  };
  const remove = (index) => {
    onChange(lines.filter((_, i) => i !== index));
    setEdit(null);
  };
  return (
    <>
      {children}
      {shown.map((l) => (
        <button key={l.index} type="button" className="line-row" disabled={readOnly} onClick={() => setEdit(l)}>
          <div className="grow">
            <div className="bold">{l.label}</div>
            {l.label !== l.category && <div className="tiny muted">{l.category}</div>}
          </div>
          <b className="money">{inr(l.amount)}</b>
        </button>
      ))}
      {!readOnly && (
        <button type="button" className="btn ghost" style={{ paddingLeft: 0 }} onClick={() => setEdit({ kind, category: "", label: "", amount: "" })}>
          <Plus size={18} /> Add {earning ? "earning" : "deduction"}
        </button>
      )}
      <LineSheet line={edit} onClose={() => setEdit(null)} onSave={save} onDelete={remove} />
    </>
  );
}
