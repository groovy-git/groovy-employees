import { Component, Suspense, useEffect } from "react";
import { Home as HomeIcon, Users, Banknote, Menu, UserCog, Settings as Cog, History, UserCircle, LogOut } from "lucide-react";
import { useApp } from "./store";
import { useRoute, navigate } from "./lib/router";
import { Toasts, Spinner, SkeletonList, Empty } from "./components/ui";
import TopBar from "./components/TopBar";
import BusyOverlay from "./components/BusyOverlay";
import { lazyScreen } from "./lib/lazyScreen";
import Login from "./pages/Login";
import Home from "./pages/Home";

const Employees = lazyScreen(() => import("./pages/Employees"));
const EmployeeDetail = lazyScreen(() => import("./pages/EmployeeDetail"));
const Payroll = lazyScreen(() => import("./pages/Payroll"));
const Slip = lazyScreen(() => import("./pages/Slip"));
const More = lazyScreen(() => import("./pages/More"));
const UsersPage = lazyScreen(() => import("./pages/Users"));
const SettingsPage = lazyScreen(() => import("./pages/Settings"));
const Logs = lazyScreen(() => import("./pages/Logs"));
const Account = lazyScreen(() => import("./pages/Account"));

// the screens are separate files so the app starts fast; fetch them quietly once Home is up,
// otherwise the first tap on a screen waits for its file over mobile data
const PRELOAD = [
  () => import("./pages/Employees"),
  () => import("./pages/Payroll"),
  () => import("./pages/Slip"),
  () => import("./pages/EmployeeDetail"),
  () => import("./pages/More"),
  () => import("./pages/Settings"),
  () => import("./pages/Users"),
  () => import("./pages/Account"),
  () => import("./pages/Logs"),
];

// logged out: only the login screen shows, so keep the address on Home — a sheet closing can
// otherwise step back to the screen the last person had open (e.g. #/more)
function useHomeWhenLoggedOut(loggedOut) {
  useEffect(() => {
    if (!loggedOut) return;
    const fix = () => {
      if (window.location.hash && window.location.hash !== "#/home") navigate("home", { replace: true });
    };
    fix();
    window.addEventListener("hashchange", fix);
    window.addEventListener("popstate", fix);
    return () => {
      window.removeEventListener("hashchange", fix);
      window.removeEventListener("popstate", fix);
    };
  }, [loggedOut]);
}

// on a weak or metered connection these files are competing with the app's own data, so they wait
function connectionIsCheap() {
  try {
    const c = navigator.connection;
    if (!c) return true; // no way to tell (Safari) — behave as before
    if (c.saveData) return false;
    return !/(^|-)2g$/.test(c.effectiveType || "");
  } catch {
    return true;
  }
}

function usePreloadScreens(ready) {
  useEffect(() => {
    if (!ready || !connectionIsCheap()) return;
    let i = 0;
    let stop = false;
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 300));
    const next = () => {
      if (stop || i >= PRELOAD.length) return;
      PRELOAD[i++]()
        .catch(() => {}) // offline or a slow network: the screen loads normally when opened
        .then(() => idle(next));
    };
    // let the screen the user is actually looking at finish loading its data first
    const start = setTimeout(() => idle(next), 3000);
    return () => {
      stop = true;
      clearTimeout(start);
    };
  }, [ready]);
}

// iPhone home-screen app: at launch, and after the login keyboard closes, iOS can think the screen is
// shorter than it is, leaving a strip under the bottom tabs until something makes it measure again.
// A scroll to the top (where a fresh screen already is) is that something.
function useIosViewportNudge(shown) {
  useEffect(() => {
    if (!shown) return;
    const nudge = () => requestAnimationFrame(() => window.scrollTo(0, 0));
    nudge();
    const vv = window.visualViewport;
    if (!vv) return;
    let last = vv.height;
    const onResize = () => {
      const grew = vv.height > last;
      last = vv.height;
      // keyboard just closed, nothing is being typed into, and the page is at the top anyway
      if (grew && window.scrollY === 0 && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) nudge();
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, [shown]);
}

// same frame as a real screen (title bar + rows) so a screen being fetched never looks blank
function PageLoading() {
  return (
    <>
      <div className="topbar">
        <h1>&nbsp;</h1>
      </div>
      <div className="page">
        <SkeletonList rows={4} height={70} />
      </div>
    </>
  );
}

// a screen that cannot open (its file failed to load even after a reload, or it crashed) shows this
// instead of taking the whole app down to a blank page; the top bar and tabs stay usable
class ScreenGuard extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err) {
    console.error(err);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div data-screen-error>
        <TopBar title="Couldn't open" />
        <div className="page">
          <Empty
            title="This screen couldn't open"
            text="Check your internet, then tap Reload."
            action={<button className="btn" onClick={() => window.location.reload()}>Reload</button>}
          />
        </div>
      </div>
    );
  }
}

const PAGES = ["home", "employees", "payroll", "slips", "more", "users", "settings", "logs", "account"];

function Page({ route }) {
  const { page, parts } = route;
  switch (page) {
    case "employees": return parts[1] ? <EmployeeDetail key={parts[1]} id={Number(parts[1])} /> : <Employees />;
    case "payroll": return <Payroll month={parts[1]} />;
    case "slips": return parts[1] ? <Slip key={parts[1]} id={Number(parts[1])} /> : <Payroll />;
    case "more": return <More />;
    case "users": return <UsersPage />;
    case "settings": return <SettingsPage />;
    case "logs": return <Logs />;
    case "account": return <Account />;
    default: return <Home />;
  }
}

export default function App() {
  const { user, booting, settings, online, logout } = useApp();
  const route = useRoute();
  const ready = !!user && !(booting && !settings.business_name);
  usePreloadScreens(ready);
  useHomeWhenLoggedOut(!user);
  useIosViewportNudge(ready);

  if (!user) return (<><Login /><Toasts /><BusyOverlay /></>);
  if (!ready)
    return (
      <div className="login">
        <img className="logo" src="./logo.svg" alt="Groovy" />
        <div className="tagline">Loading…</div>
        <Spinner />
      </div>
    );

  const page = PAGES.includes(route.page) ? route.page : "home";
  // which tab is lit: a slip belongs to Payroll, and the admin screens to More
  const section = page === "slips" ? "payroll" : ["users", "settings", "logs", "account"].includes(page) ? "more" : page;

  const tabs = [
    { id: "home", label: "Home", icon: HomeIcon },
    { id: "employees", label: "Employees", icon: Users },
    { id: "payroll", label: "Payroll", icon: Banknote },
    { id: "more", label: "More", icon: Menu },
  ];
  const side = [
    ...tabs.slice(0, 3),
    { id: "users", label: "Admins", icon: UserCog },
    { id: "settings", label: "Settings", icon: Cog },
    { id: "logs", label: "Activity", icon: History },
  ];
  const here = page === "slips" ? "payroll" : page; // the sidebar's highlighted row

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <img src="./logo.svg" alt="" />
          <div>
            <div className="name">Groovy Employees</div>
            <div className="tag">{(settings.business_name || "Groovy Business Group").toUpperCase()}</div>
          </div>
        </div>
        {side.map((s) => (
          <button key={s.id} className={here === s.id ? "active" : ""} onClick={() => navigate(s.id)}>
            <s.icon size={20} /> {s.label}
          </button>
        ))}
        <div className="spacer" />
        <button onClick={() => navigate("account")} className={page === "account" ? "active" : ""}>
          <UserCircle size={20} /> {user.name}
        </button>
        <button onClick={logout}>
          <LogOut size={20} /> Log out
        </button>
      </nav>

      <div className="main">
        {!online && <div className="offline">You're offline — you can look around, but nothing can be saved until you're back online.</div>}
        {/* keyed by page, so moving to another tab clears an error */}
        <ScreenGuard key={page}>
          <Suspense fallback={<PageLoading />}>
            <Page route={{ ...route, page }} />
          </Suspense>
        </ScreenGuard>
      </div>

      <nav className="bottomnav" aria-label="Main">
        {tabs.map((t) => (
          <button key={t.id} className={section === t.id ? "active" : ""} onClick={() => navigate(t.id)}>
            <t.icon size={23} />
            {t.label}
          </button>
        ))}
      </nav>
      <Toasts />
      <BusyOverlay />
    </div>
  );
}
