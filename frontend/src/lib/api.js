// Talks to the Apps Script web app. Body is text/plain JSON so the browser sends a
// "simple" request (Apps Script cannot answer CORS preflights).
const API_URL = import.meta.env.VITE_API_URL;

// Every key this app keeps in the browser starts with "ge_". Groovy Kiosk is served from the same
// address (GitHub Pages) and uses "gp_": browser storage is shared between the two, so sharing a
// prefix would log one app out when the other does.
const TOKEN_KEY = "ge_token";

let handlers = { authExpired: () => {} };
export function setApiHandlers(h) {
  handlers = { ...handlers, ...h };
}

export const getToken = () => localStorage.getItem(TOKEN_KEY) || "";
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// one id per action; retries reuse it so the server never runs the same save twice
const newReqId = () => {
  try {
    if (crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* older browsers */
  }
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
};

/**
 * Google occasionally loses the reply (404 on the …/macros/echo redirect) even though the script ran.
 * Every action is therefore retried with the same req_id: the server returns the saved reply of a
 * write that already happened instead of doing it again (no second slip, no second email).
 */
// Every try is given 45 s — the time Google takes to run the action plus the time to fetch its answer.
// On a slow day Google often answers after 20–33 s; giving up sooner only makes it do the job again.
const TRY_MS = 45000;

export async function api(action, payload = {}) {
  if (!API_URL) throw new ApiError("App not configured: VITE_API_URL is missing.", "CONFIG");
  if (!navigator.onLine) throw new ApiError("You're offline. Check the internet and try again.", "OFFLINE");
  const body = JSON.stringify({ action, token: getToken(), req_id: newReqId(), payload });
  const attempts = 3;
  let lastStatus = 0;
  for (let i = 0; i < attempts; i++) {
    let json = null;
    try {
      const ctrl = new AbortController();
      // the timer covers reading the answer too: a reply that starts arriving and then stalls used
      // to hang with nothing to stop it
      const timer = setTimeout(() => ctrl.abort(), TRY_MS);
      try {
        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body,
          redirect: "follow",
          signal: ctrl.signal,
        });
        lastStatus = res.status;
        const text = await res.text();
        try {
          json = JSON.parse(text);
        } catch {
          json = null; // Google's HTML error page (e.g. 404 on the echo redirect)
        }
        // "success" without a `data` field isn't an answer to this action: it is the web app's GET page,
        // which Google now and then serves for a POST. The action didn't run — treat it like a lost
        // reply and ask again with the same req_id.
        if (json && json.success && !("data" in json)) json = null;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      json = null; // network drop / timeout
    }
    if (json) {
      if (json.success) return json;
      if (json.code === "IN_PROGRESS" && i < attempts - 1) {
        await sleep(1500); // the first try is still being saved — ask again for its result
        continue;
      }
      if (json.code === "AUTH_EXPIRED") handlers.authExpired();
      throw new ApiError(json.message || "Request failed", json.code);
    }
    if (i < attempts - 1) await sleep(800 * (i + 1));
  }
  throw new ApiError(
    "Couldn't reach the server" + (lastStatus && lastStatus !== 200 ? " (Google returned " + lastStatus + ")" : "") +
      ". If you were saving something, check whether it was saved before trying again.",
    "NETWORK",
  );
}
