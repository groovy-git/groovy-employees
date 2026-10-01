import { UserCog, Settings, History, KeyRound, LogOut, ChevronRight, Smartphone } from "lucide-react";
import { useApp } from "../store";
import { navigate } from "../lib/router";
import { ROLE_LABEL } from "../lib/format";
import TopBar from "../components/TopBar";
import { Avatar, useConfirm } from "../components/ui";

export default function More() {
  const { user, logout, settings } = useApp();
  const [confirm, confirmNode] = useConfirm();
  const items = [
    { id: "users", label: "Admins", sub: "Who can log in to this app", icon: UserCog },
    { id: "settings", label: "Settings", sub: "Company, holiday and salary rules, slip email", icon: Settings },
    { id: "logs", label: "Activity log", sub: "Who did what", icon: History },
    { id: "account", label: "My account", sub: "Change password", icon: KeyRound },
  ];

  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;

  return (
    <>
      <TopBar title="More" />
      <div className="page">
        <div className="card row">
          <Avatar name={user.name} gold />
          <div className="grow">
            <div className="bold serif" style={{ fontSize: 17 }}>{user.name}</div>
            <div className="small muted">
              {ROLE_LABEL[user.role] || "Admin"} · {user.email}
            </div>
          </div>
        </div>
        <div className="list mt">
          {items.map((it) => (
            <button key={it.id} className="list-item" onClick={() => navigate(it.id)}>
              <div className="avatar">
                <it.icon size={20} />
              </div>
              <div className="grow">
                <div className="title">{it.label}</div>
                <div className="sub">{it.sub}</div>
              </div>
              <ChevronRight size={18} color="var(--muted)" />
            </button>
          ))}
        </div>

        {!standalone && (
          <div className="card mt row" style={{ alignItems: "flex-start" }}>
            <Smartphone color="var(--brown)" />
            <div className="small">
              <b>Install on your phone:</b> Android Chrome → menu ⋮ → <i>Add to Home screen / Install app</i>. iPhone Safari → Share → <i>Add to Home Screen</i>. It then opens full-screen like an app.
            </div>
          </div>
        )}

        <button
          className="btn secondary block mt-l"
          onClick={async () => (await confirm({ title: "Log out?", text: "You'll need your password to log in again.", okText: "Log out" })) && logout()}
        >
          <LogOut size={18} /> Log out
        </button>
        <div className="tiny muted center mt">
          Groovy Employees · {settings.business_name || "Groovy Business Group"} · v1.0
        </div>
      </div>
      {confirmNode}
    </>
  );
}
