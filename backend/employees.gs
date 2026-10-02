/** Employee records: who they are, how to reach them, and their monthly base salary. */

// a real calendar date written yyyy-MM-dd
function validDate_(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
    if (!m) return false;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1) return false;
    return d <= new Date(Date.UTC(y, mo, 0)).getUTCDate();
}

// whole or half days: 0, 0.5, 1, 1.5 …
function isHalfStep_(n) {
    return Math.abs(n * 2 - Math.round(n * 2)) < 1e-9;
}

/**
 * The lines an employee gets on every slip (a fixed allowance, a fixed deduction).
 * Anything unusable is dropped rather than refused: a half-filled row in the form is not an error.
 */
function cleanRecurring_(list) {
    if (!Array.isArray(list)) return [];
    const reserved = [LEAVE_CATEGORY_.toLowerCase(), HOLIDAY_CATEGORY_.toLowerCase()];
    return list
        .map((l) => {
            const kind = KINDS_.indexOf(l && l.kind) >= 0 ? l.kind : "";
            const category = str_(l && l.category).slice(0, 40) || "Other";
            const amount = r2_(num_(l && l.amount));
            return { kind, category, label: str_(l && l.label).slice(0, 60) || category, amount };
        })
        .filter((l) => l.kind && l.amount > 0 && reserved.indexOf(l.category.toLowerCase()) < 0)
        .slice(0, 12);
}

/**
 * The role as the list in Settings spells it. A role must come from that list — with one exception:
 * an employee keeps the role they already have, even if it was typed before the list existed or has
 * since been taken off it, so that correcting a phone number never forces a change of title.
 */
function roleFor_(wanted, existing) {
    if (existing && str_(existing.designation) === wanted) return wanted;
    const hit = roles_().find((r) => r.toLowerCase() === wanted.toLowerCase());
    if (!hit) fail_("“" + wanted + "” is not one of the roles. Choose one from the list, or add it in More → Settings → Roles.");
    return hit;
}

function employeeOut_(e, slips) {
    return {
        id: e.id, emp_no: e.emp_no, name: e.name, designation: e.designation, location: e.location,
        dob: e.dob, doj: e.doj, phone: e.phone, email: e.email, address: e.address,
        base_salary: e.base_salary, recurring: e.recurring || [], status: e.status || "active", dol: e.dol,
        notes: e.notes, created_at: e.created_at, updated_at: e.updated_at,
        slips: slips || 0,
    };
}

// how many slips each employee has — one column, not the whole table
function slipCounts_() {
    const n = {};
    columnValues_("Salary_Slips", "employee_id").forEach((id) => (n[id] = (n[id] || 0) + 1));
    return n;
}

function apiListEmployees_(p, ctx) {
    const counts = slipCounts_();
    const list = rows_("Employees")
        .map((e) => employeeOut_(e, counts[e.id]))
        .sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === "active" ? -1 : 1));
    return { data: list };
}

function apiSaveEmployee_(p, ctx) {
    const empNo = Number(p.emp_no);
    const name = str_(p.name);
    const designation = str_(p.designation);
    const doj = str_(p.doj);
    const dob = str_(p.dob);
    const email = str_(p.email).toLowerCase();
    const base = r2_(num_(p.base_salary));
    if (!(empNo > 0) || Math.floor(empNo) !== empNo) fail_("Emp No. must be a whole number, 1 or more");
    if (!name) fail_("Name is required");
    if (!designation) fail_("Choose a role");
    if (!validDate_(doj)) fail_("Enter the date of joining");
    if (dob) {
        if (!validDate_(dob)) fail_("Date of birth is not a valid date");
        if (dob >= todayStr_()) fail_("Date of birth must be in the past");
        if (dob >= doj) fail_("Date of birth must be before the date of joining");
    }
    if (email && !EMAIL_RE_.test(email)) fail_("Email is not valid");
    if (!(base > 0)) fail_("Enter the monthly base salary");

    return withLock_(() => {
        const clash = rows_("Employees").find((e) => e.emp_no === empNo && e.id !== Number(p.id || 0));
        if (clash) fail_("Emp No. " + empNo + " already belongs to " + clash.name);
        const existing = p.id ? findBy_("Employees", "id", Number(p.id)) : null;
        if (p.id && !existing) fail_("Employee not found");
        const now = nowStr_();
        const fields = {
            emp_no: empNo, name, designation: roleFor_(designation, existing), location: str_(p.location), dob, doj,
            phone: str_(p.phone).slice(0, 20), email, address: str_(p.address), base_salary: base,
            recurring: cleanRecurring_(p.recurring), notes: str_(p.notes), updated_at: now,
        };
        if (p.id) {
            const e = existing;
            if (e.status === "left" && e.dol && e.dol < doj) fail_("Date of joining is after the date of leaving (" + e.dol + ")");
            const was = e.base_salary;
            Object.assign(e, fields);
            updateRows_("Employees", [e]);
            // a salary change is the one edit worth being able to trace later
            log_(ctx, "UPDATE", "Employees", e.id, name + (was !== base ? " — base salary " + was + " → " + base : ""));
            return { message: "Employee saved", data: employeeOut_(e, slipCounts_()[e.id]) };
        }
        const e = Object.assign({ id: nextId_("Employees"), status: "active", dol: "", created_at: now }, fields);
        appendRows_("Employees", [e]);
        log_(ctx, "CREATE", "Employees", e.id, name + " (Emp No. " + empNo + ") — base salary " + base);
        return { message: "Employee added", data: employeeOut_(e, 0) };
    });
}

/** Mark someone as having left (with the date), or bring them back. Their slips stay either way. */
function apiSetEmployeeStatus_(p, ctx) {
    const status = p.status === "left" ? "left" : "active";
    const dol = status === "left" ? str_(p.dol) || todayStr_() : "";
    if (status === "left" && !validDate_(dol)) fail_("Enter the date of leaving");
    return withLock_(() => {
        const e = findBy_("Employees", "id", Number(p.id));
        if (!e) fail_("Employee not found");
        if (status === "left" && dol < e.doj) fail_("Date of leaving is before the date of joining");
        e.status = status;
        e.dol = dol;
        e.updated_at = nowStr_();
        updateRows_("Employees", [e]);
        log_(ctx, status === "left" ? "LEFT" : "REJOINED", "Employees", e.id, e.name + (dol ? " — left on " + dol : ""));
        return { message: status === "left" ? e.name + " marked as left" : e.name + " is active again", data: employeeOut_(e, slipCounts_()[e.id]) };
    });
}

function apiDeleteEmployee_(p, ctx) {
    return withLock_(() => {
        const e = findBy_("Employees", "id", Number(p.id));
        if (!e) fail_("Employee not found");
        if (slipCounts_()[e.id]) fail_(e.name + " has salary slips. Mark them as left instead, so the slips stay.");
        deleteRow_("Employees", e);
        log_(ctx, "DELETE", "Employees", e.id, e.name + " (Emp No. " + e.emp_no + ")");
        return { message: "Employee deleted" };
    });
}
