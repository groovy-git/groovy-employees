import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, clearToken, getToken, setApiHandlers, setToken } from "./lib/api";
import { navigate } from "./lib/router";
import { runBusy } from "./lib/busy";
import { money } from "./lib/format";

const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);

const load = (k, def) => {
  try {
    const v = localStorage.getItem(k);
    return v ? JSON.parse(v) : def;
  } catch {
    return def;
  }
};
const save = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage full / private mode — app still works */
  }
};

// Everything this app keeps in the browser is under "ge_", and logging out removes exactly that.
// Groovy Kiosk lives at the same address with its own "gp_" keys, which must be left alone.
function forgetOwn(storage, keep) {
  try {
    Object.keys(storage)
      .filter((k) => k.indexOf("ge_") === 0 && k !== keep)
      .forEach((k) => storage.removeItem(k));
  } catch {
    /* private mode */
  }
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(() => (getToken() ? load("ge_user", null) : null));
  const [settings, setSettingsState] = useState(() => load("ge_settings", {}));
  const [booting, setBooting] = useState(!!getToken());
  const [online, setOnline] = useState(navigator.onLine);
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = "info", ms = 2600) => {
    const id = Math.random();
    setToasts((t) => [...t.slice(-2), { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  const setSettings = useCallback((s) => {
    setSettingsState(s);
    save("ge_settings", s);
  }, []);

  const logoutLocal = useCallback(() => {
    clearToken();
    // a shared computer: the next person must not see names, salaries or slips left in the browser
    forgetOwn(localStorage, "ge_last_email");
    forgetOwn(sessionStorage);
    setSettingsState({});
    setUser(null);
    navigate("home", { replace: true }); // the next person starts at Home, not the last screen used
  }, []);

  useEffect(() => {
    setApiHandlers({
      authExpired: () => {
        logoutLocal();
        toast("Please log in again", "warn");
      },
    });
  }, [logoutLocal, toast]);

  const bootstrap = useCallback(async () => {
    const d = (await api("bootstrap")).data;
    setUser(d.user);
    setSettings(d.settings);
    save("ge_user", d.user);
    return d;
  }, [setSettings]);

  // on app open: refresh who we are and the settings in the background (the saved copy shows instantly)
  useEffect(() => {
    if (!getToken()) return;
    bootstrap()
      .catch((e) => {
        if (e.code !== "AUTH_EXPIRED") toast(e.message, "error");
      })
      .finally(() => setBooting(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const login = useCallback(
    async (email, password) => {
      const r = await api("login", { email, password, device: navigator.userAgent.slice(0, 100) });
      setToken(r.data.token);
      setBooting(true);
      setUser(r.data.user);
      save("ge_user", r.data.user);
      try {
        await bootstrap();
        navigate("home", { replace: true }); // always start on Home, whatever the last person had open
      } finally {
        setBooting(false);
      }
    },
    [bootstrap],
  );

  // the screen is blocked until this browser is fully logged out
  const logout = useCallback(
    () =>
      runBusy("Logging out…", async () => {
        try {
          await api("logout");
        } catch {
          /* already logged out server-side */
        }
        logoutLocal();
      }),
    [logoutLocal],
  );

  const symbol = settings.currency_symbol || "₹";
  const value = {
    user,
    settings, setSettings,
    booting, online,
    login, logout,
    toast, toasts,
    symbol,
    inr: (n) => money(n, symbol), // an amount as this company writes it
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
