/**
 * Web API. The app POSTs {action, token, payload} as text/plain JSON
 * (text/plain avoids a CORS preflight, which Apps Script cannot answer).
 * Every action is listed here with the roles allowed to call it — the role always
 * comes from the server-side session, never from the request.
 */

const A_ = ["owner"]; // everyone who can log in today; a second role gets its own list here

// built lazily: Apps Script evaluates files in load order, so top-level code
// must not reference functions from other files
let ACTIONS_CACHE_ = null;
function actions_() {
    if (ACTIONS_CACHE_) return ACTIONS_CACHE_;
    ACTIONS_CACHE_ = {
    // public
    ping: { fn: () => ({ data: { time: nowStr_() } }), public: true },
    login: { fn: apiLogin_, public: true },
    forgotPassword: { fn: apiForgotPassword_, public: true },
    resetPassword: { fn: apiResetPassword_, public: true },

    // session
    bootstrap: { fn: apiBootstrap_, roles: A_ },
    me: { fn: apiMe_, roles: A_ },
    logout: { fn: apiLogout_, roles: A_ },
    changePassword: { fn: apiChangePassword_, roles: A_ },
    dashboard: { fn: apiDashboard_, roles: A_ },

    // employees
    listEmployees: { fn: apiListEmployees_, roles: A_ },
    saveEmployee: { fn: apiSaveEmployee_, roles: A_ },
    setEmployeeStatus: { fn: apiSetEmployeeStatus_, roles: A_ },
    deleteEmployee: { fn: apiDeleteEmployee_, roles: A_ },

    // salary slips
    listMonth: { fn: apiListMonth_, roles: A_ },
    getSlip: { fn: apiGetSlip_, roles: A_ },
    employeeSlips: { fn: apiEmployeeSlips_, roles: A_ },
    saveSlip: { fn: apiSaveSlip_, roles: A_ },
    prepareMonth: { fn: apiPrepareMonth_, roles: A_ },
    finalizeSlip: { fn: apiFinalizeSlip_, roles: A_ },
    reopenSlip: { fn: apiReopenSlip_, roles: A_ },
    deleteSlip: { fn: apiDeleteSlip_, roles: A_ },
    emailSlip: { fn: apiEmailSlip_, roles: A_ },
    emailMonth: { fn: apiEmailMonth_, roles: A_ },
    saveSlipPdf: { fn: apiSaveSlipPdf_, roles: A_ },

    // logins, settings, log
    listUsers: { fn: apiListUsers_, roles: A_ },
    saveUser: { fn: apiSaveUser_, roles: A_ },
    toggleUser: { fn: apiToggleUser_, roles: A_ },
    deleteUser: { fn: apiDeleteUser_, roles: A_ },
    getSettings: { fn: apiGetSettings_, roles: A_ },
    saveSettings: { fn: apiSaveSettings_, roles: A_ },
    listLogs: { fn: apiListLogs_, roles: A_ },
    };
    return ACTIONS_CACHE_;
}

function doPost(e) {
    let req = null;
    try {
        req = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    } catch (err) {
        return json_({ success: false, code: "BAD_REQUEST", message: "Invalid request" });
    }
    return json_(dispatchOnce_(req));
}

// reads are safe to run again, so their saved reply is kept only briefly — long enough to cover a
// retry after Google loses one, not long enough to hand anyone stale figures
const READ_ACTIONS_ = {
    bootstrap: 1, me: 1, ping: 1, dashboard: 1, listEmployees: 1, listMonth: 1, getSlip: 1, employeeSlips: 1,
    listUsers: 1, getSettings: 1, listLogs: 1,
};

/**
 * Google sometimes loses the reply (404 on the …/macros/echo redirect) after the script has already run.
 * The app then retries with the same req_id: a write that already happened returns its saved reply
 * instead of running twice (no second slip, no second email). Requests without req_id run as before.
 */
function dispatchOnce_(req) {
    const id = req && typeof req.req_id === "string" && /^[A-Za-z0-9-]{8,64}$/.test(req.req_id) ? req.req_id : "";
    if (!id) return dispatch_(req);
    const isRead = !!READ_ACTIONS_[req.action];
    const cache = CacheService.getScriptCache();
    const key = "rq_" + id;
    const seen = cache.get(key);
    if (seen === "PENDING")
        return {
            success: false,
            code: "IN_PROGRESS",
            message: isRead ? "Still fetching that — one moment…" : "Still saving your last request — one moment…",
        };
    if (seen) {
        try {
            return JSON.parse(seen);
        } catch (e) {
            /* unreadable → run again */
        }
    }
    cache.put(key, "PENDING", 120); // a retry arriving while this runs waits instead of running again
    const res = dispatch_(req);
    try {
        const out = JSON.stringify(res);
        // failures aren't kept, so a retry can try again; big replies can't be cached (100 KB limit).
        // A save is remembered for 6 hours (the cache's limit): a phone locked mid-save can retry much later.
        if (res.success && out.length < 90000) cache.put(key, out, isRead ? 120 : 21600);
        else cache.remove(key);
    } catch (e) {
        cache.remove(key);
    }
    return res;
}

function doGet() {
    return json_({ success: true, app: APP.NAME, time: nowStr_() });
}

function json_(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function dispatch_(req) {
    resetReqCache_();
    REQ_CACHE_.__api = true; // sheet handles and header rows can be reused for this request (db.gs sheet_)
    const action = req && req.action;
    const acts = actions_();
    const def = Object.prototype.hasOwnProperty.call(acts, action) ? acts[action] : null;
    if (!def) return { success: false, code: "BAD_ACTION", message: "Unknown action" };
    try {
        let ctx = null;
        if (!def.public) {
            ctx = authenticate_(req.token);
            if (def.roles.indexOf(ctx.user.role) < 0) fail_("You don't have permission to do this", "FORBIDDEN");
        }
        const res = def.fn(req.payload || {}, ctx) || {};
        return { success: true, message: res.message || "", data: res.data === undefined ? null : res.data };
    } catch (err) {
        if (err && err.isAppError) return { success: false, code: err.code, message: err.message };
        console.error("API " + action + ":", err && err.stack ? err.stack : err);
        return { success: false, code: "SERVER", message: "Something went wrong. Please try again." };
    }
}

function apiBootstrap_(p, ctx) {
    return { data: { user: publicUser_(ctx.user), settings: publicSettings_() } };
}
