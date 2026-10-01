/**
 * One-time setup, run from the spreadsheet menu "Groovy Employees" (or the Apps Script editor).
 * setupSheets() is safe to run again: it only creates what is missing.
 */

function onOpen() {
    SpreadsheetApp.getUi()
        .createMenu(APP.NAME)
        .addItem("1. Setup / repair sheets", "setupSheets")
        .addItem("2. Load demo data (test copy only)", "seedDemo")
        .addSeparator()
        .addItem("Back up now", "backupNow")
        .addItem("Reset an admin password…", "resetAdminPassword")
        .addItem("Log everyone out (after an update)", "logoutEveryone")
        .addItem("Run self-tests", "runTests")
        .addItem("Show web app URL", "showWebAppUrl")
        .addToUi();
}

function alert_(msg) {
    try {
        SpreadsheetApp.getUi().alert(msg);
    } catch (e) {
        console.log(msg); // run from the editor
    }
}

/* ---------- the Drive folder ---------- */

/**
 * Make sure the Sheet lives in a folder called "Groovy Employees", beside "Groovy Kiosk".
 *
 *   <folder that holds Groovy Kiosk>/
 *     Groovy Kiosk/
 *     Groovy Employees/      ← this one: the Sheet, Salary_Slips, Back_up
 *
 * Already in a folder of that name: nothing moves. Otherwise the Groovy Kiosk folder is looked for
 * by name (not in the bin, not a backup's copy). Exactly one found: the new folder goes next to it.
 * None, or more than one: it goes in My Drive and the message says so — it never guesses between two.
 * Returns { folder, note } — the note is one line for the Setup message.
 */
function ensureHomeFolder_() {
    const file = DriveApp.getFileById(ss_().getId());
    const parents = file.getParents();
    const here = parents.hasNext() ? parents.next() : null;
    if (here && here.getName() === APP.HOME_FOLDER) return { folder: here, moved: false, note: "Drive folder: " + APP.HOME_FOLDER + " (already in place)." };

    const kiosks = [];
    const it = DriveApp.getFoldersByName(APP.KIOSK_FOLDER);
    while (it.hasNext()) {
        const f = it.next();
        if (!f.isTrashed() && !insideBackup_(f)) kiosks.push(f);
    }
    let base = DriveApp.getRootFolder();
    let where = "in My Drive";
    let why = "";
    if (kiosks.length === 1) {
        const up = kiosks[0].getParents();
        if (up.hasNext()) base = up.next();
        where = "beside " + APP.KIOSK_FOLDER;
    } else {
        why = kiosks.length
            ? " There are " + kiosks.length + " folders called " + APP.KIOSK_FOLDER + ", so it was not placed beside either — drag it where you want it."
            : " No " + APP.KIOSK_FOLDER + " folder was found in this account — drag it where you want it.";
    }
    const home = subFolder_(base, APP.HOME_FOLDER);
    file.moveTo(home);
    return { folder: home, moved: true, note: "Drive folder: " + APP.HOME_FOLDER + " created " + where + ", and this sheet was moved into it." + why };
}

/**
 * Who else can open the folder. It sits beside Groovy Kiosk, so it takes on whatever sharing the folder
 * above it has — and what is in it is everyone's salary. Setup says so plainly rather than changing
 * anything: who should see it is the owner's call.
 */
function folderAccessNote_(folder) {
    try {
        let me = "";
        try {
            me = String(Session.getEffectiveUser().getEmail() || "").toLowerCase();
        } catch (e) {}
        const others = {};
        const add = (u) => {
            const a = u && u.getEmail ? String(u.getEmail() || "").toLowerCase() : "";
            if (a && a !== me) others[a] = true;
        };
        folder.getEditors().forEach(add);
        folder.getViewers().forEach(add);
        try {
            add(folder.getOwner());
        } catch (e) {}
        const open = String(folder.getSharingAccess()) !== String(DriveApp.Access.PRIVATE);
        const list = Object.keys(others);
        if (!open && !list.length) return "Folder access: only you. Keep it that way — it holds salaries.";
        return (
            "⚠ Folder access: the " + APP.HOME_FOLDER + " folder can be opened by " +
            [open ? "anyone who has the link" : "", list.join(", ")].filter(Boolean).join(", and by ") +
            ". Salary slips in it are visible to them. Change this in Drive → right-click the folder → Share."
        );
    } catch (e) {
        console.error("folderAccessNote_", e);
        return "Folder access could not be checked — open the folder's Share box in Drive and make sure only you are on it.";
    }
}

/* ---------- logins ---------- */

/**
 * End every login. Both halves are needed: the Sessions rows, and the cached copies of them —
 * a cached login keeps working for hours after its row is gone.
 */
function logoutEveryone_() {
    const cache = CacheService.getScriptCache();
    const t = readTable_("Sessions");
    const tokens = t.rows.map((s) => "s_" + s.token);
    for (let i = 0; i < tokens.length; i += 100) cache.removeAll(tokens.slice(i, i + 100));
    const last = t.sh.getLastRow();
    if (last >= 2) t.sh.getRange(2, 1, last - 1, t.keys.length).clearContent();
    delete REQ_CACHE_["Sessions"];
    return tokens.length;
}

function logoutEveryone() {
    const ui = SpreadsheetApp.getUi();
    const r = ui.alert(
        "Log everyone out",
        "Every admin signs in again on their next tap. Nothing else changes: no employees, slips or settings are touched.\n\nContinue?",
        ui.ButtonSet.YES_NO,
    );
    if (r !== ui.Button.YES) {
        alert_("Nothing was changed.");
        return;
    }
    const n = withLock_(() => logoutEveryone_());
    alert_(n ? n + (n === 1 ? " login ended." : " logins ended.") : "Nobody was logged in.");
}

/**
 * Hand an admin a new password without any email — the way back in when the reset code can't be
 * received. Only someone who can edit this spreadsheet can run it, which is the root of trust for
 * the app. Returns the new password so the caller can show it once; it is never written to the log.
 */
function resetAdminPassword_(email) {
    return withLock_(() => {
        const wanted = str_(email).toLowerCase();
        const u = rows_("Users").find((x) => String(x.email).toLowerCase() === wanted);
        if (!u) fail_("No login has the email " + email);
        const pwd = "groovy@" + Math.floor(1000 + Math.random() * 9000);
        u.salt = newSalt_();
        u.pwd_hash = hashPwd_(pwd, u.salt);
        u.otp = ""; // a code that was already on its way must not still work
        u.otp_exp = "";
        u.updated_at = nowStr_();
        updateRows_("Users", [u]);
        endUserSessions_(u.id);
        log_({ user: { id: 0, name: "Sheet owner" } }, "UPDATE", "Users", u.id, "Password reset for " + u.name);
        return { name: u.name, active: u.active, password: pwd };
    });
}

function resetAdminPassword() {
    const ui = SpreadsheetApp.getUi();
    const ask = ui.prompt("Reset an admin password", "Email of the admin who needs a new password:", ui.ButtonSet.OK_CANCEL);
    if (ask.getSelectedButton() !== ui.Button.OK) return;
    const email = ask.getResponseText().trim();
    if (!email) return alert_("Nothing was changed.");
    try {
        const r = resetAdminPassword_(email);
        alert_(
            "New password for " + r.name + ":\n\n    " + r.password + "\n\nHand this over now — it is not shown again and is not saved anywhere readable.\n" +
                "Ask them to change it after logging in." + (r.active ? "" : "\n\nNote: this login is deactivated, so it also needs reactivating in More → Admins."),
        );
    } catch (e) {
        alert_(e.message || String(e));
    }
}

/* ---------- setup ---------- */

function setupSheets() {
    resetReqCache_();
    const ss = ss_();
    const created = [];
    const kept = []; // tabs where the owner added their own columns (left untouched)
    Object.keys(SCHEMA).forEach((name) => {
        const keys = Object.keys(SCHEMA[name]);
        let sh = ss.getSheetByName(name);
        if (!sh) {
            sh = ss.insertSheet(name);
            created.push(name);
        }
        if (sh.getMaxColumns() < keys.length) sh.insertColumnsAfter(sh.getMaxColumns(), keys.length - sh.getMaxColumns());
        const lastCol = sh.getLastColumn();
        const header = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
        if (!header.length || header.every((h) => !h)) {
            sh.getRange(1, 1, 1, keys.length).setValues([keys]);
        } else {
            // columns added in later versions are appended at the end — fill in their headers
            const added = [];
            keys.forEach((k, i) => {
                if (header[i] === k) return;
                if (!header[i] && header.slice(i).every((h) => !h)) {
                    sh.getRange(1, i + 1).setValue(k);
                    added.push(k);
                    return;
                }
                throw new Error("Sheet '" + name + "' column " + (i + 1) + " should be '" + k + "' but is '" + (header[i] || "") + "'. Fix the header row and run setup again.");
            });
            if (added.length) created.push(name + " (+" + added.join(", ") + ")");
        }
        sh.getRange(1, 1, 1, keys.length).setFontWeight("bold").setBackground("#654321").setFontColor("#FFFFFF");
        sh.setFrozenRows(1);
        // tidy away unused columns — but never delete a column that has anything in it
        const extra = sh.getMaxColumns() - keys.length;
        if (extra > 0) {
            const vals = sh.getRange(1, keys.length + 1, Math.max(1, sh.getLastRow()), extra).getValues();
            if (vals.every((row) => row.every((c) => c === "" || c === null))) sh.deleteColumns(keys.length + 1, extra);
            else kept.push(name);
        }
        if (sh.getMaxRows() < 500) sh.insertRowsAfter(sh.getMaxRows(), 500 - sh.getMaxRows());
        formatTextCols_(sh, name, 2, sh.getMaxRows() - 1);
    });

    // remove the blank default sheet
    ["Sheet1", "Sheet 1"].forEach((n) => {
        const sh = ss.getSheetByName(n);
        if (sh && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
    });

    resetReqCache_();
    const have = indexBy_(rows_("Settings"), "key");
    const now = nowStr_();
    const missing = Object.keys(DEFAULT_SETTINGS)
        .filter((k) => !have[k])
        .map((k) => ({ key: k, value: DEFAULT_SETTINGS[k], updated_by: 0, updated_at: now }));
    appendRows_("Settings", missing);

    // spare empty rows in every table, and the nightly job that keeps them topped up (maintenance.gs)
    resetReqCache_();
    topUpSpareRows_();
    try {
        ensureMaintenanceTrigger_();
    } catch (e) {
        console.error("ensureMaintenanceTrigger_", e);
    }
    let backupMsg = "\nBackups: a copy of this sheet goes into Back_up on the 1st of every month.";
    try {
        ensureBackupTrigger_(); // Setup is where Google asks for permission
    } catch (e) {
        console.error("ensureBackupTrigger_", e);
        backupMsg = "\nThe monthly backup timer could not be set up: " + e;
    }

    // the Drive folder, beside Groovy Kiosk — and who else can open it
    let folderMsg = "";
    try {
        const home = ensureHomeFolder_();
        folderMsg = "\n\n" + home.note + "\n" + folderAccessNote_(home.folder);
    } catch (e) {
        console.error("ensureHomeFolder_", e);
        folderMsg = "\n\nThe " + APP.HOME_FOLDER + " folder could not be set up in Drive: " + (e.message || e) +
            "\nCreate a folder called " + APP.HOME_FOLDER + " beside " + APP.KIOSK_FOLDER + " and move this sheet into it.";
    }

    let adminMsg = "";
    if (!rows_("Users").length) {
        let email = "";
        try {
            email = Session.getEffectiveUser().getEmail();
        } catch (e) {}
        email = (email || "admin@groovy.local").toLowerCase();
        const pwd = "groovy@" + Math.floor(1000 + Math.random() * 9000);
        const salt = newSalt_();
        appendRows_("Users", [
            { id: 1, name: "Admin", email, phone: "", role: "owner", pwd_hash: hashPwd_(pwd, salt), salt, active: 1, otp: "", otp_exp: "", created_at: now, updated_at: now },
        ]);
        adminMsg = "\n\nAdmin login created:\nEmail: " + email + "\nPassword: " + pwd + "\n\nWrite this down and change the password after first login.";
    }
    SpreadsheetApp.flush();
    const msg =
        "Setup complete." +
        (created.length ? "\nCreated sheets: " + created.join(", ") : "\nAll sheets already existed.") +
        (kept.length ? "\nKept your extra columns in: " + kept.join(", ") + " (no data was removed)." : "") +
        adminMsg +
        folderMsg +
        backupMsg;
    alert_(msg);
    return msg;
}

function showWebAppUrl() {
    let url = "";
    try {
        url = ScriptApp.getService().getUrl();
    } catch (e) {}
    alert_(url ? "Web app URL (use as VITE_API_URL):\n" + url : "Not deployed yet. In Apps Script: Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).");
}

/* ---------- demo data ---------- */

// "yyyy-MM-dd" this many days from today (IST); negative = in the past
function dayFromToday_(n) {
    return fmtDate_(new Date(Date.now() + n * 86400000));
}

/**
 * A small made-up team with two months of slips: the month before last finalized (PDFs filed, nothing
 * emailed — the addresses are not real), last month left as drafts to work on.
 */
function seedDemo() {
    resetReqCache_();
    if (rows_("Employees").length) {
        alert_("Employees already exist — demo data is only for an empty test copy of the sheet.");
        return;
    }
    const admin = rows_("Users")[0];
    if (!admin) throw new Error("Run setup first");
    const ctx = { user: admin, token: "" };
    const year = Number(todayStr_().slice(0, 4));
    const soon = dayFromToday_(9).slice(4); // a birthday nine days from now, so Home has something to show

    // [emp_no, name, designation, location, dob, doj, phone, base, recurring]
    const team = [
        [1, "Imran Shaikh", "Store Manager", "Kondhwa", "1988" + soon, year - 5 + "-04-01", "9822012345", 32000, [{ kind: "earning", category: "Allowance", label: "Travel allowance", amount: 1500 }]],
        [2, "Sameer Khan", "Salesperson", "Kondhwa", "1996-02-14", year - 3 + "-07-15", "9876543210", 18000, []],
        [3, "Asha Khan", "Salesperson", "Kalyani Nagar", "1998-11-03", year - 2 + "-01-12", "9765432109", 15000, []],
        [4, "Ayesha Pathan", "Salesperson", "Kalyani Nagar", "1999-06-21", year - 1 + "-03-01", "9890011223", 15000, [{ kind: "earning", category: "Allowance", label: "Phone allowance", amount: 300 }]],
        [5, "Rahul Patil", "Stock Mover", "Kondhwa", "1994-09-30", year - 2 + "-10-05", "9850098500", 14000, []],
        [6, "Zoya Shaikh", "Cashier", "Kondhwa", "2000-12-19", year - 1 + "-08-20", "9833445566", 16000, [{ kind: "deduction", category: "Advance", label: "Advance repayment", amount: 1000 }]],
    ];
    team.forEach((t) =>
        apiSaveEmployee_(
            { emp_no: t[0], name: t[1], designation: t[2], location: t[3], dob: t[4], doj: t[5], phone: t[6], email: t[1].split(" ")[0].toLowerCase() + "@demo.local", base_salary: t[7], recurring: t[8] },
            ctx,
        ),
    );

    const last = lastMonth_(todayStr_());
    const before = lastMonth_(last + "-01");
    // days off and extra lines per employee number, to give the slips some variety
    const extras = {
        2: { days_off: 3, items: [{ kind: "earning", category: "Commission", label: "Commission", amount: 2200 }] },
        3: { days_off: 0, items: [{ kind: "earning", category: "Overtime", label: "Overtime (6 hrs)", amount: 600 }] },
        5: { days_off: 2.5, items: [{ kind: "deduction", category: "Penalty", label: "Late marks", amount: 200 }] },
    };
    [before, last].forEach((month) => {
        resetReqCache_();
        apiPrepareMonth_({ month }, ctx);
        resetReqCache_();
        rows_("Salary_Slips")
            .filter((s) => s.month === month)
            .map((s) => ({ id: s.id, emp_no: s.emp_no }))
            .forEach((s) => {
                const x = extras[s.emp_no];
                if (x) {
                    resetReqCache_();
                    const keep = itemsOf_(s.id).filter((i) => !i.auto).map((i) => ({ kind: i.kind, category: i.category, label: i.label, amount: i.amount }));
                    apiSaveSlip_({ id: s.id, days_off: x.days_off, items: keep.concat(x.items) }, ctx);
                }
                if (month === before) {
                    resetReqCache_();
                    apiFinalizeSlip_({ id: s.id, email: false }, ctx);
                }
            });
    });
    alert_(
        "Demo data loaded: " + team.length + " employees, " + monthLabel_(before) + " finalized (PDFs are in Salary_Slips), " +
            monthLabel_(last) + " left as drafts.\n\nThe email addresses are made up — change one to your own before trying Email.",
    );
}
