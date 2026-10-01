import { useEffect, useMemo, useState } from "react";
import { Plus, UserCog } from "lucide-react";
import { useApp } from "../store";
import { api } from "../lib/api";
import { useCachedFetch } from "../lib/cached";
import { runBusy } from "../lib/busy";
import TopBar, { Updating } from "../components/TopBar";
import { Avatar, Button, Empty, Field, Sheet, SkeletonList, useConfirm } from "../components/ui";

export default function UsersPage() {
  const { toast, user } = useApp();
  const [edit, setEdit] = useState(null);
  const { data: list, loading, reload: load } = useCachedFetch("ge_users", () => api("listUsers").then((r) => r.data), [], (e) => toast(e.message, "error"));

  // active first, then by name. The copy is because sort() would otherwise mutate state in place.
  const ordered = useMemo(
    () => (list ? [...list].sort((a, b) => (a.active ? 0 : 1) - (b.active ? 0 : 1) || String(a.name || "").localeCompare(String(b.name || ""))) : null),
    [list],
  );

  return (
    <>
      <TopBar title="Admins" back="more" right={loading && list ? <Updating /> : null} />
      <div className="page">
        <p className="small muted" style={{ marginTop: 0 }}>
          Everyone listed here can log in and see every employee's salary. Employees themselves don't log in: they receive their slip by email.
        </p>
        {!list ? (
          <SkeletonList />
        ) : ordered.length === 0 ? (
          <Empty icon={UserCog} title="No admins" />
        ) : (
          <div className="list">
            {ordered.map((u) => (
              <button key={u.id} className="list-item" onClick={() => setEdit(u)} style={u.active ? null : { opacity: 0.55 }}>
                <Avatar name={u.name} gold={u.id === user.id} />
                <div className="grow">
                  <div className="title">
                    {u.name} {u.id === user.id && <span className="muted small">(you)</span>}
                  </div>
                  <div className="sub ellipsis">{u.email}</div>
                </div>
                {!u.active && <span className="badge bad">Inactive</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <button className="fab" onClick={() => setEdit({ name: "", email: "", phone: "" })}>
        <Plus size={20} /> Add admin
      </button>
      <UserSheet
        u={edit}
        onClose={() => setEdit(null)}
        onSaved={() => {
          setEdit(null);
          load();
        }}
      />
    </>
  );
}

function UserSheet({ u, onClose, onSaved }) {
  const { toast, user } = useApp();
  const [f, setF] = useState(u || {});
  const [pwd, setPwd] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, confirmNode] = useConfirm();
  useEffect(() => {
    setF(u || {});
    setPwd("");
  }, [u]);
  if (!u) return null;
  const self = u.id === user.id;

  const run = async (action, payload) => {
    setBusy(true);
    try {
      const r = await runBusy(action === "deleteUser" ? "Deleting login…" : "Saving login…", () => api(action, payload));
      toast(r.message, "success");
      onSaved();
    } catch (e) {
      toast(e.message, "error", 4000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={u.id ? "Edit admin" : "Add admin"}
      footer={<Button className="block big" loading={busy} onClick={() => run("saveUser", { ...f, password: pwd || undefined })}>Save</Button>}
    >
      <Field label="Name">
        <input className="input" value={f.name || ""} onChange={(e) => setF({ ...f, name: e.target.value })} autoCapitalize="words" />
      </Field>
      <Field label="Email (used to log in)">
        <input className="input" type="email" inputMode="email" value={f.email || ""} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </Field>
      <Field label="Mobile (optional)">
        <input className="input" type="tel" inputMode="tel" value={f.phone || ""} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      </Field>
      <Field label={u.id ? "New password (leave empty to keep)" : "Password"} hint="At least 6 characters. Share it with them privately.">
        <input className="input" type="text" autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} />
      </Field>
      {u.id && !self && (
        <div className="grid-2 mt">
          <button className="btn secondary" disabled={busy} onClick={() => run("toggleUser", { id: u.id })}>
            {u.active ? "Deactivate" : "Activate"}
          </button>
          <button
            className="btn danger"
            disabled={busy}
            onClick={async () => (await confirm({ title: `Delete ${u.name}'s login?`, text: "They will no longer be able to log in. This cannot be undone.", okText: "Delete", danger: true })) && run("deleteUser", { id: u.id })}
          >
            Delete
          </button>
        </div>
      )}
      {confirmNode}
    </Sheet>
  );
}
