import { lazy } from "react";

// A new version was deployed while this page was open: the new service worker took over and cleared the
// old files, and the server only has the new ones. The old app then asks for a screen file that no longer
// exists. The browser remembers a failed import for the life of the page, so retrying cannot help —
// reload once, into the new version.
const KEY = "ge_update_reload";

export function reloadForUpdate() {
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY) || 0) < 15000) return false; // just did; stop
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false; // storage blocked: no way to prevent a reload loop, so do not start one
  }
  window.location.reload();
  return true;
}

export const lazyScreen = (load) =>
  lazy(() =>
    load().catch((err) => {
      if (reloadForUpdate()) return new Promise(() => {}); // keep the loading frame up until the reload lands
      throw err; // reloaded a moment ago and still failing — the error screen says so
    }),
  );
