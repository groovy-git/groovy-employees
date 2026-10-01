/** Settings (key/value) + activity log. */

function settingsMap_() {
    if (REQ_CACHE_.__settings) return REQ_CACHE_.__settings;
    const m = Object.assign({}, DEFAULT_SETTINGS);
    rows_("Settings").forEach((r) => (m[r.key] = r.value));
    REQ_CACHE_.__settings = m;
    return m;
}

function setting_(key) {
    return settingsMap_()[key];
}

function setSetting_(key, value, userId) {
    const row = findBy_("Settings", "key", key);
    const now = nowStr_();
    if (row) {
        row.value = String(value);
        row.updated_by = userId || 0;
        row.updated_at = now;
        updateRows_("Settings", [row]);
    } else {
        appendRows_("Settings", [{ key, value: String(value), updated_by: userId || 0, updated_at: now }]);
    }
    if (REQ_CACHE_.__settings) REQ_CACHE_.__settings[key] = String(value);
}

// every setting is for admins, and only admins log in — nothing to hide
function publicSettings_() {
    return Object.assign({}, settingsMap_());
}

function apiGetSettings_(p, ctx) {
    return { data: publicSettings_() };
}

const EDITABLE_SETTINGS_ = [
    "business_name", "tagline", "address", "phone", "email", "currency_symbol",
    "salary_days", "paid_holidays", "earning_types", "deduction_types", "slip_footer",
    "email_slips", "slip_email_cc",
];

function splitEmails_(s) {
    return String(s || "")
        .split(/[,;\s]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
}

// "Overtime, bonus ,Overtime" → "Overtime, bonus": trimmed, no blanks, no repeats, and never one of
// the two lines the app writes itself
function cleanTypeList_(s) {
    const seen = {};
    return String(s || "")
        .split(",")
        .map((t) => t.trim().slice(0, 40))
        .filter((t) => {
            const k = t.toLowerCase();
            if (!t || seen[k] || k === LEAVE_CATEGORY_.toLowerCase() || k === HOLIDAY_CATEGORY_.toLowerCase()) return false;
            seen[k] = true;
            return true;
        })
        .join(", ");
}

function apiSaveSettings_(p, ctx) {
    const vals = Object.assign({}, p.settings || {});
    if (vals.business_name !== undefined && !str_(vals.business_name)) fail_("Company name is required");
    if (vals.currency_symbol !== undefined) {
        vals.currency_symbol = str_(vals.currency_symbol);
        if (!vals.currency_symbol || vals.currency_symbol.length > 4) fail_("Currency symbol must be 1–4 characters, e.g. ₹");
    }
    if (vals.salary_days !== undefined) {
        const d = parseFloat(vals.salary_days);
        if (isNaN(d) || d < 1 || d > 31) fail_("Days in a salary month must be between 1 and 31");
        vals.salary_days = String(d);
    }
    if (vals.paid_holidays !== undefined) {
        const d = parseFloat(vals.paid_holidays);
        if (isNaN(d) || d < 0 || d > 31 || !isHalfStep_(d)) fail_("Paid holidays a month must be 0 or more, in whole or half days");
        vals.paid_holidays = String(d);
    }
    ["earning_types", "deduction_types"].forEach((k) => {
        if (vals[k] === undefined) return;
        vals[k] = cleanTypeList_(vals[k]);
        if (!vals[k]) fail_("Keep at least one " + (k === "earning_types" ? "earning" : "deduction") + " type");
    });
    if (vals.email_slips !== undefined && ["yes", "no"].indexOf(vals.email_slips) < 0) fail_("Invalid email option");
    if (vals.slip_email_cc !== undefined) {
        const list = splitEmails_(vals.slip_email_cc);
        const bad = list.filter((e) => !EMAIL_RE_.test(e));
        if (bad.length) fail_("Not a valid email: " + bad.join(", "));
        vals.slip_email_cc = list.join(", ");
    }
    withLock_(() => {
        EDITABLE_SETTINGS_.forEach((k) => {
            if (vals[k] !== undefined && str_(vals[k]) !== str_(setting_(k))) setSetting_(k, str_(vals[k]), ctx.user.id);
        });
        log_(ctx, "UPDATE", "Settings", "", "Settings updated");
    });
    return { message: "Settings saved", data: publicSettings_() };
}

/* ---------- activity log ---------- */

function log_(ctx, action, entity, refId, details) {
    try {
        appendRows_("Activity_Logs", [
            {
                id: nextId_("Activity_Logs"),
                user_id: ctx && ctx.user ? ctx.user.id : 0,
                user_name: ctx && ctx.user ? ctx.user.name : "",
                action,
                entity,
                ref_id: refId === undefined ? "" : String(refId),
                details: details || "",
                at: nowStr_(),
            },
        ]);
    } catch (e) {
        console.error("log_", e);
    }
}

function apiListLogs_(p, ctx) {
    const lim = Math.min(num_(p.limit, 300), 1000);
    const q = str_(p.q).toLowerCase();
    // the newest rows are all this screen shows; a search looks back further but still not
    // through every line ever logged
    let rows = tailRows_("Activity_Logs", q ? Math.max(5000, lim) : lim).reverse();
    if (q)
        rows = rows.filter((r) =>
            (r.user_name + " " + r.action + " " + r.entity + " " + r.details).toLowerCase().indexOf(q) >= 0,
        );
    return {
        data: rows.slice(0, lim).map((r) => ({
            id: r.id, user_name: r.user_name, action: r.action, entity: r.entity,
            ref_id: r.ref_id, details: r.details, at: r.at,
        })),
    };
}
