/**
 * Monthly salary slips.
 *
 *   net salary = base salary + earnings − deductions
 *
 * One slip per employee per month. A slip starts as a draft, is finalized once it is right, and from
 * then on can only be read (an admin can reopen it). The lines live in Slip_Items; the totals on the
 * slip are always worked out here on the server, never taken from the app.
 */

const MONTH_NAMES_ = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function validMonth_(m) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ""));
}

// "2026-09" → "September 2026"
function monthLabel_(ym) {
    return MONTH_NAMES_[parseInt(String(ym).slice(5, 7), 10) - 1] + " " + String(ym).slice(0, 4);
}

/** The month before the one this date falls in, as "yyyy-MM" — the month slips are usually made for. */
function lastMonth_(dateStr) {
    const y = parseInt(String(dateStr).slice(0, 4), 10);
    const m = parseInt(String(dateStr).slice(5, 7), 10);
    return m === 1 ? y - 1 + "-12" : y + "-" + pad_(m - 1, 2);
}

/** Was this person on the payroll at any point in that month? */
function eligibleFor_(e, month) {
    if (String(e.doj).slice(0, 7) > month) return false; // had not joined yet
    if (e.status === "left") return !!e.dol && String(e.dol).slice(0, 7) >= month;
    return true;
}

/* ---------- the maths (pure: no sheet, no settings) ---------- */

// an amount typed over the worked-out one; blank means "use the worked-out one"
function amountOr_(v, auto) {
    if (v === undefined || v === null || v === "") return auto;
    const n = parseFloat(v);
    if (isNaN(n) || n < 0) fail_("Amounts must be 0 or more");
    return r2_(n);
}

/**
 * Everything a slip's figures come from.
 *
 * One day's salary is base ÷ salaryDays. The employee has `paidHolidays` paid days off in the month:
 * days off beyond those are unpaid leave (a deduction), and a holiday not taken is paid as extra days
 * (an earning). Both of those lines are written here, from the days off; `over` carries an amount the
 * admin typed over either of them. `manual` are the lines the admin added.
 *
 * `ev` is the event work: { type, days, rate }. Days worked at events are paid at a daily rate, as one
 * more line written here — for anyone, on top of a base if they have one. Someone of type "event" is
 * paid only that way: they have no base, so there is no day's salary and the holiday rule has nothing
 * to work on; their slip carries no days off and neither of those two lines.
 */
function computeSlip_(base, salaryDays, paidHolidays, daysOff, manual, over, ev) {
    over = over || {};
    ev = ev || {};
    const eventPaid = ev.type === "event";
    base = eventPaid ? 0 : r2_(num_(base));
    salaryDays = num_(salaryDays);
    paidHolidays = eventPaid ? 0 : num_(paidHolidays);
    daysOff = eventPaid ? 0 : parseFloat(daysOff);
    const blank = (v) => v === undefined || v === null || v === "";
    const eventDays = blank(ev.days) ? 0 : parseFloat(ev.days);
    const eventRate = blank(ev.rate) ? 0 : r2_(parseFloat(ev.rate));
    if (!(base >= 0)) fail_("Base salary must be 0 or more");
    if (!eventPaid && !(salaryDays >= 1)) fail_("Days in a salary month must be 1 or more");
    if (isNaN(daysOff) || daysOff < 0 || daysOff > 31) fail_("Days off must be between 0 and 31");
    if (!isHalfStep_(daysOff)) fail_("Days off must be in whole or half days");
    if (isNaN(eventDays) || eventDays < 0 || eventDays > 31) fail_("Event days must be between 0 and 31");
    if (!isHalfStep_(eventDays)) fail_("Event days must be in whole or half days");
    if (!(eventRate >= 0)) fail_("The rate for an event day must be 0 or more");

    const perDay = eventPaid ? 0 : base / salaryDays;
    const unpaid = Math.max(0, r2_(daysOff - paidHolidays));
    const unused = Math.max(0, r2_(paidHolidays - daysOff));
    const leaveAuto = Math.round(perDay * unpaid);
    const holidayAuto = Math.round(perDay * unused);
    const eventAuto = r2_(eventDays * eventRate);

    const earnings = manual.filter((l) => l.kind === "earning").map((l) => Object.assign({}, l, { auto: 0 }));
    const deductions = manual.filter((l) => l.kind === "deduction").map((l) => Object.assign({}, l, { auto: 0 }));
    if (eventDays > 0) {
        if (!(eventRate > 0) && blank(over.event_amount)) fail_("Enter the rate for an event day");
        earnings.unshift({ kind: "earning", category: EVENT_CATEGORY_, label: EVENT_CATEGORY_, qty: eventDays, amount: amountOr_(over.event_amount, eventAuto), auto: 1 });
    }
    if (unused > 0)
        earnings.push({ kind: "earning", category: HOLIDAY_CATEGORY_, label: HOLIDAY_CATEGORY_, qty: unused, amount: amountOr_(over.holiday_amount, holidayAuto), auto: 1 });
    if (unpaid > 0)
        deductions.unshift({ kind: "deduction", category: LEAVE_CATEGORY_, label: LEAVE_CATEGORY_, qty: unpaid, amount: amountOr_(over.leave_amount, leaveAuto), auto: 1 });

    const sum = (list) => r2_(list.reduce((a, l) => a + l.amount, 0));
    const earningsTotal = sum(earnings);
    const deductionsTotal = sum(deductions);
    return {
        base_salary: base, days_off: daysOff, unpaid_days: unpaid, unused_days: unused,
        per_day: r2_(perDay), leave_auto: leaveAuto, holiday_auto: holidayAuto,
        pay_type: eventPaid ? "event" : "monthly", event_days: eventDays, event_rate: eventRate, event_auto: eventAuto,
        items: earnings.concat(deductions).map((l, i) => Object.assign(l, { sort: i + 1 })),
        earnings_total: earningsTotal, deductions_total: deductionsTotal,
        net_salary: r2_(base + earningsTotal - deductionsTotal),
    };
}

// "event" for someone paid only for the event days they work; everyone else, and every row written
// before there was a choice, is "monthly"
function payTypeOf_(row) {
    return row && row.pay_type === "event" ? "event" : "monthly";
}

/** The lines an admin added, checked. The lines the app writes itself are never taken from the app. */
function cleanItems_(list) {
    if (!Array.isArray(list)) return [];
    const reserved = AUTO_CATEGORIES_;
    const out = [];
    list.forEach((l) => {
        if (!l || l.auto) return;
        const category = str_(l.category).slice(0, 40) || "Other";
        if (reserved.indexOf(category.toLowerCase()) >= 0) return;
        const label = str_(l.label).slice(0, 60) || category;
        if (KINDS_.indexOf(l.kind) < 0) fail_("Each line must be an earning or a deduction");
        const amount = r2_(num_(l.amount));
        if (!(amount > 0)) fail_("Enter an amount for “" + label + "”");
        out.push({ kind: l.kind, category, label, qty: 0, amount });
    });
    if (out.length > 30) fail_("A slip can have at most 30 lines");
    return out;
}

/* ---------- reading ---------- */

function itemsOf_(slipId) {
    return rows_("Slip_Items")
        .filter((i) => i.slip_id === slipId)
        .sort((a, b) => a.sort - b.sort);
}

function slipOut_(s) {
    const o = {};
    cols_("Salary_Slips").forEach((k) => (o[k] = s[k]));
    o.month_label = monthLabel_(s.month);
    return o;
}

// what a list needs: no lines, no text
function slipBrief_(s) {
    return {
        id: s.id, month: s.month, month_label: monthLabel_(s.month), employee_id: s.employee_id, status: s.status,
        base_salary: s.base_salary, earnings_total: s.earnings_total, deductions_total: s.deductions_total,
        net_salary: s.net_salary, days_off: s.days_off, unpaid_days: s.unpaid_days,
        pay_type: payTypeOf_(s), event_days: s.event_days || 0,
        emailed_at: s.emailed_at, emailed_to: s.emailed_to, pdf_url: s.pdf_url,
    };
}

/** A slip with its lines, its text, and what the editor needs to work the app's own lines out live. */
function slipDetail_(s) {
    const items = itemsOf_(s.id);
    const e = findBy_("Employees", "id", s.employee_id);
    const perDay = s.base_salary / (s.salary_days || 30);
    return {
        slip: Object.assign(slipOut_(s), { pay_type: payTypeOf_(s), event_days: s.event_days || 0, event_rate: s.event_rate || 0 }),
        items: items.map((i) => ({ kind: i.kind, category: i.category, label: i.label, qty: i.qty, amount: i.amount, auto: i.auto ? 1 : 0 })),
        text: slipText_(s, items),
        employee: e ? { id: e.id, name: e.name, email: e.email, phone: e.phone, status: e.status } : null,
        auto: {
            leave_amount: Math.round(perDay * s.unpaid_days),
            holiday_amount: Math.round(perDay * Math.max(0, r2_(s.paid_holidays - s.days_off))),
            event_amount: r2_((s.event_days || 0) * (s.event_rate || 0)),
        },
    };
}

function apiGetSlip_(p, ctx) {
    const s = findBy_("Salary_Slips", "id", Number(p.id));
    if (!s) fail_("Slip not found", "NOT_FOUND");
    return { data: slipDetail_(s) };
}

function apiEmployeeSlips_(p, ctx) {
    const id = Number(p.employee_id);
    return {
        data: rows_("Salary_Slips")
            .filter((s) => s.employee_id === id)
            .sort((a, b) => (a.month < b.month ? 1 : -1))
            .map(slipBrief_),
    };
}

/**
 * Where a month's payroll has got to.
 * Someone paid per event day is only due a slip in a month they worked, so until they have one they
 * are "on call": listed, but not counted as a slip waiting to be started.
 */
function monthSummary_(month, rows) {
    const slips = rows.map((r) => r.slip).filter(Boolean);
    const finals = slips.filter((s) => s.status === "final");
    const due = rows.filter((r) => r.slip || r.employee.pay_type !== "event").length;
    return {
        month, label: monthLabel_(month),
        employees: due,
        on_call: rows.length - due,
        not_started: due - slips.length,
        drafts: slips.length - finals.length,
        finals: finals.length,
        emailed: finals.filter((s) => s.emailed_at).length,
        total_net: r2_(slips.reduce((a, s) => a + s.net_salary, 0)),
    };
}

// everyone on the payroll that month, each with their slip if one exists
function monthRows_(month) {
    const byEmp = {};
    rows_("Salary_Slips").forEach((s) => {
        if (s.month === month) byEmp[s.employee_id] = s;
    });
    return rows_("Employees")
        .filter((e) => byEmp[e.id] || eligibleFor_(e, month))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((e) => ({
            employee: { id: e.id, emp_no: e.emp_no, name: e.name, designation: e.designation, location: e.location, email: e.email, base_salary: e.base_salary, status: e.status, pay_type: payTypeOf_(e), day_rate: e.day_rate || 0 },
            slip: byEmp[e.id] ? slipBrief_(byEmp[e.id]) : null,
        }));
}

function apiListMonth_(p, ctx) {
    const thisMonth = todayStr_().slice(0, 7);
    const month = validMonth_(p.month) ? p.month : lastMonth_(todayStr_());
    const rows = monthRows_(month);
    return { data: { month, this_month: thisMonth, future: month > thisMonth, rows, summary: monthSummary_(month, rows) } };
}

/* ---------- writing ---------- */

// the employee as they are now, copied onto the slip
function stampEmployee_(s, e) {
    s.emp_no = e.emp_no;
    s.employee_name = e.name;
    s.designation = e.designation;
    s.location = e.location;
    s.doj = e.doj;
}

function assertCanHaveSlip_(e, month) {
    if (!validMonth_(month)) fail_("Choose the salary month");
    if (month > todayStr_().slice(0, 7)) fail_(monthLabel_(month) + " hasn't started yet");
    if (String(e.doj).slice(0, 7) > month) fail_(e.name + " had not joined in " + monthLabel_(month));
    if (!eligibleFor_(e, month)) fail_(e.name + " had left before " + monthLabel_(month));
}

function blankSlip_(e, month, ctx, id) {
    const now = nowStr_();
    const type = payTypeOf_(e);
    // someone paid per event day has no base, so no holiday rule: their slip carries no days off at all
    const holidays = type === "event" ? 0 : num_(setting_("paid_holidays"), 1);
    const s = {
        id, month, employee_id: e.id, base_salary: type === "event" ? 0 : e.base_salary,
        salary_days: num_(setting_("salary_days"), 30), paid_holidays: holidays,
        // a new slip assumes the holiday was taken: nothing is added or taken off until the admin says otherwise
        days_off: holidays, unpaid_days: 0,
        earnings_total: 0, deductions_total: 0, net_salary: 0, status: "draft", notes: "", pdf_url: "",
        emailed_at: "", emailed_to: "", created_by: ctx.user.id, created_at: now, updated_at: now, finalized_at: "",
        // the slip keeps the pay type it was made with; the rate starts as the employee's and can be changed here
        pay_type: type, event_days: 0, event_rate: num_(e.day_rate),
    };
    stampEmployee_(s, e);
    return s;
}

function applyFigures_(s, c) {
    s.base_salary = c.base_salary;
    s.days_off = c.days_off;
    s.unpaid_days = c.unpaid_days;
    s.event_days = c.event_days;
    s.event_rate = c.event_rate;
    s.earnings_total = c.earnings_total;
    s.deductions_total = c.deductions_total;
    s.net_salary = c.net_salary;
}

function itemRows_(slipId, items, firstId) {
    return items.map((l, i) => ({
        id: firstId + i, slip_id: slipId, kind: l.kind, category: l.category, label: l.label,
        qty: l.qty || 0, amount: l.amount, sort: l.sort, auto: l.auto ? 1 : 0,
    }));
}

// replace a slip's lines (inside the lock)
function writeItems_(slipId, items) {
    emptyRows_("Slip_Items", rows_("Slip_Items").filter((i) => i.slip_id === slipId).map((i) => i._r));
    appendRows_("Slip_Items", itemRows_(slipId, items, nextId_("Slip_Items")));
}

/**
 * Create a draft, or save changes to one.
 * payload: { id } or { employee_id, month }, plus any of base_salary, days_off, event_days, event_rate,
 * items (the added lines), leave_amount / holiday_amount / event_amount (typed over the worked-out
 * ones; blank = worked out), notes.
 */
function apiSaveSlip_(p, ctx) {
    return withLock_(() => {
        let s;
        let e;
        const isNew = !p.id;
        if (isNew) {
            e = findBy_("Employees", "id", Number(p.employee_id));
            if (!e) fail_("Employee not found");
            const month = str_(p.month);
            assertCanHaveSlip_(e, month);
            if (rows_("Salary_Slips").some((x) => x.employee_id === e.id && x.month === month))
                fail_(e.name + " already has a slip for " + monthLabel_(month), "EXISTS");
            s = blankSlip_(e, month, ctx, nextId_("Salary_Slips"));
        } else {
            s = findBy_("Salary_Slips", "id", Number(p.id));
            if (!s) fail_("Slip not found", "NOT_FOUND");
            if (s.status !== "draft") fail_("This slip is final. Reopen it to make changes.");
            e = findBy_("Employees", "id", s.employee_id);
            if (e) stampEmployee_(s, e); // a draft follows the profile; a final slip never does
        }
        const manual =
            p.items !== undefined ? cleanItems_(p.items)
                : isNew ? cleanRecurring_(e.recurring).map((l) => Object.assign({ qty: 0 }, l))
                    : itemsOf_(s.id).filter((i) => !i.auto);
        const c = computeSlip_(
            p.base_salary === undefined ? s.base_salary : p.base_salary,
            s.salary_days, s.paid_holidays,
            p.days_off === undefined || p.days_off === "" ? s.days_off : p.days_off,
            manual, { leave_amount: p.leave_amount, holiday_amount: p.holiday_amount, event_amount: p.event_amount },
            {
                type: payTypeOf_(s),
                days: p.event_days === undefined || p.event_days === "" ? s.event_days : p.event_days,
                rate: p.event_rate === undefined || p.event_rate === "" ? s.event_rate : p.event_rate,
            },
        );
        applyFigures_(s, c);
        if (p.notes !== undefined) s.notes = str_(p.notes).slice(0, 300);
        s.updated_at = nowStr_();
        if (isNew) appendRows_("Salary_Slips", [s]);
        else updateRows_("Salary_Slips", [s]);
        writeItems_(s.id, c.items);
        if (isNew) s = findBy_("Salary_Slips", "id", s.id); // the stored row, with its place in the sheet
        log_(ctx, isNew ? "CREATE" : "UPDATE", "Salary_Slips", s.id, s.employee_name + " — " + monthLabel_(s.month) + " — net " + s.net_salary);
        return { message: isNew ? "Draft created" : "Draft saved", data: slipDetail_(s) };
    });
}

/**
 * A draft for everyone on a monthly salary who doesn't have a slip for that month yet, with their
 * recurring lines. Those paid per event day are left out: their slip is started by hand, in a month
 * they worked.
 */
function apiPrepareMonth_(p, ctx) {
    const month = str_(p.month);
    if (!validMonth_(month)) fail_("Choose the salary month");
    if (month > todayStr_().slice(0, 7)) fail_(monthLabel_(month) + " hasn't started yet");
    return withLock_(() => {
        const have = {};
        rows_("Salary_Slips").forEach((s) => {
            if (s.month === month) have[s.employee_id] = true;
        });
        const todo = rows_("Employees").filter((e) => !have[e.id] && payTypeOf_(e) !== "event" && eligibleFor_(e, month));
        let slipId = nextId_("Salary_Slips");
        let itemId = nextId_("Slip_Items");
        const slips = [];
        let items = [];
        todo.forEach((e) => {
            const s = blankSlip_(e, month, ctx, slipId++);
            const c = computeSlip_(s.base_salary, s.salary_days, s.paid_holidays, s.days_off, cleanRecurring_(e.recurring).map((l) => Object.assign({ qty: 0 }, l)), {}, { type: s.pay_type, days: 0, rate: s.event_rate });
            applyFigures_(s, c);
            slips.push(s);
            const rows = itemRows_(s.id, c.items, itemId);
            itemId += rows.length;
            items = items.concat(rows);
        });
        appendRows_("Salary_Slips", slips);
        appendRows_("Slip_Items", items);
        if (slips.length) log_(ctx, "PREPARE", "Salary_Slips", month, slips.length + " draft slips for " + monthLabel_(month));
        return {
            message: slips.length ? slips.length + (slips.length === 1 ? " draft" : " drafts") + " prepared for " + monthLabel_(month) : "Everyone on a monthly salary already has a slip for " + monthLabel_(month),
            data: { created: slips.length },
        };
    });
}

/**
 * Draft → final. The slip is locked first; the PDF and the email come after, outside the lock, because
 * they are slow and can fail on their own. If either does, the slip is still final and the app offers
 * that step again.
 */
function apiFinalizeSlip_(p, ctx) {
    const s = withLock_(() => {
        const s = findBy_("Salary_Slips", "id", Number(p.id));
        if (!s) fail_("Slip not found", "NOT_FOUND");
        if (s.status === "final") fail_("This slip is already final");
        if (s.net_salary < 0) fail_("Deductions are more than the salary. Lower a deduction, or carry part of it to next month.");
        // no base and nothing earned: an event salesperson's slip for a month they did not work
        if (!(s.base_salary > 0) && !(s.earnings_total > 0)) fail_("Nothing to pay on this slip. Enter the event days, or delete the draft.");
        const e = findBy_("Employees", "id", s.employee_id);
        if (e) stampEmployee_(s, e);
        const now = nowStr_();
        s.status = "final";
        s.finalized_at = now;
        s.updated_at = now;
        updateRows_("Salary_Slips", [s]);
        log_(ctx, "FINALIZE", "Salary_Slips", s.id, s.employee_name + " — " + monthLabel_(s.month) + " — net " + s.net_salary);
        return s;
    });
    const notes = [];
    try {
        saveSlipPdf_(s);
    } catch (err) {
        console.error("saveSlipPdf_", err);
        notes.push("The PDF could not be saved to Drive — tap Save PDF to try again.");
    }
    if (p.email) {
        try {
            notes.push("Emailed to " + emailSlip_(s, ctx) + ".");
        } catch (err) {
            if (!err || !err.isAppError) console.error("emailSlip_", err);
            notes.push(err && err.isAppError ? err.message : "The email could not be sent — tap Email to try again.");
        }
    }
    return { message: ["Slip finalized."].concat(notes).join(" "), data: slipDetail_(s) };
}

/** Final → draft, for a correction. The filed PDF goes to Drive's bin and the "emailed" mark is cleared. */
function apiReopenSlip_(p, ctx) {
    return withLock_(() => {
        const s = findBy_("Salary_Slips", "id", Number(p.id));
        if (!s) fail_("Slip not found", "NOT_FOUND");
        if (s.status !== "final") fail_("This slip is still a draft");
        if (s.pdf_url) trashPdf_(s.pdf_url);
        s.status = "draft";
        s.pdf_url = "";
        s.emailed_at = "";
        s.emailed_to = "";
        s.finalized_at = "";
        s.updated_at = nowStr_();
        updateRows_("Salary_Slips", [s]);
        log_(ctx, "REOPEN", "Salary_Slips", s.id, s.employee_name + " — " + monthLabel_(s.month));
        return { message: "Slip reopened as a draft", data: slipDetail_(s) };
    });
}

function apiDeleteSlip_(p, ctx) {
    return withLock_(() => {
        const s = findBy_("Salary_Slips", "id", Number(p.id));
        if (!s) fail_("Slip not found", "NOT_FOUND");
        if (s.status !== "draft") fail_("A final slip cannot be deleted. Reopen it first.");
        emptyRows_("Slip_Items", rows_("Slip_Items").filter((i) => i.slip_id === s.id).map((i) => i._r));
        deleteRow_("Salary_Slips", s);
        log_(ctx, "DELETE", "Salary_Slips", s.id, s.employee_name + " — " + monthLabel_(s.month));
        return { message: "Draft deleted" };
    });
}

function finalSlip_(id) {
    const s = findBy_("Salary_Slips", "id", Number(id));
    if (!s) fail_("Slip not found", "NOT_FOUND");
    if (s.status !== "final") fail_("Finalize the slip first");
    return s;
}

function apiSaveSlipPdf_(p, ctx) {
    const s = finalSlip_(p.id);
    saveSlipPdf_(s);
    return { message: "PDF saved in Google Drive", data: slipDetail_(s) };
}

function apiEmailSlip_(p, ctx) {
    const s = finalSlip_(p.id);
    const to = emailSlip_(s, ctx);
    return { message: "Slip emailed to " + to, data: slipDetail_(s) };
}

/**
 * Email every final slip of the month that hasn't been sent yet.
 * It stops after about 25 seconds and says how many are left, and the app asks again: a request that
 * runs much longer than that is one the app gives up waiting for.
 */
function apiEmailMonth_(p, ctx) {
    const month = str_(p.month);
    if (!validMonth_(month)) fail_("Choose the salary month");
    const started = Date.now();
    const emails = {};
    rows_("Employees").forEach((e) => (emails[e.id] = str_(e.email)));
    const waiting = rows_("Salary_Slips").filter((s) => s.month === month && s.status === "final" && !s.emailed_at);
    const noEmail = waiting.filter((s) => !emails[s.employee_id]).map((s) => s.employee_name);
    const todo = waiting.filter((s) => emails[s.employee_id]);
    let sent = 0;
    const failed = [];
    let stopped = "";
    while (todo.length) {
        if (Date.now() - started > 25000) break;
        const s = todo.shift();
        try {
            emailSlip_(s, ctx);
            sent++;
        } catch (err) {
            if (err && err.code === "QUOTA") {
                stopped = err.message;
                todo.unshift(s);
                break;
            }
            console.error("emailMonth " + s.id, err);
            failed.push(s.employee_name);
        }
    }
    const left = stopped ? 0 : todo.length; // nothing more to try today once the limit is hit
    const parts = [sent + (sent === 1 ? " slip" : " slips") + " emailed"];
    if (noEmail.length) parts.push("no email address for " + noEmail.join(", "));
    if (failed.length) parts.push("could not send to " + failed.join(", "));
    if (stopped) parts.push(stopped);
    return { message: parts.join("; ") + ".", data: { sent, remaining: left, no_email: noEmail, failed, stopped } };
}

/* ---------- home ---------- */

function daysBetween_(a, b) {
    const t = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
    return Math.round((t(b) - t(a)) / 86400000);
}

// the next time this month-and-day comes round, today included (29 Feb falls on the 28th in other years)
function nextOccurrence_(date, today) {
    const y = Number(today.slice(0, 4));
    for (let yr = y; yr <= y + 1; yr++) {
        let d = yr + date.slice(4);
        if (!validDate_(d)) d = yr + "-02-28";
        if (d >= today) return d;
    }
    return "";
}

/** Birthdays and work anniversaries of active employees in the next `days` days, soonest first. */
function upcoming_(emps, today, days) {
    const out = [];
    emps.forEach((e) => {
        [["birthday", e.dob], ["anniversary", e.doj]].forEach(([type, date]) => {
            if (!validDate_(date)) return;
            const on = nextOccurrence_(date, today);
            if (!on) return;
            const inDays = daysBetween_(today, on);
            const years = Number(on.slice(0, 4)) - Number(date.slice(0, 4));
            if (inDays > days || (type === "anniversary" && years < 1)) return;
            out.push({ employee_id: e.id, name: e.name, type, date: on, days: inDays, years });
        });
    });
    return out.sort((a, b) => a.days - b.days || a.name.localeCompare(b.name));
}

function apiDashboard_(p, ctx) {
    const today = todayStr_();
    const month = lastMonth_(today);
    const emps = rows_("Employees");
    const active = emps.filter((e) => e.status !== "left");
    return {
        data: {
            today, month,
            active: active.length,
            left: emps.length - active.length,
            base_total: r2_(active.reduce((a, e) => a + e.base_salary, 0)),
            payroll: monthSummary_(month, monthRows_(month)),
            upcoming: upcoming_(active, today, 30),
        },
    };
}
