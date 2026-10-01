/**
 * End-to-end backend scenarios against the in-memory Apps Script mock.
 * Run: node backend/dev/e2e.js
 */
const vm = require("vm");
const { createEnv } = require("./mock-gas");

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
    if (cond) passed++;
    else {
        failed++;
        console.log("FAIL:", name, extra !== undefined ? JSON.stringify(extra) : "");
    }
}
function ok(res, name) {
    check(name + " → " + (res.message || ""), res.success, res);
    return res.data;
}
const refused = (res, name, re) => check(name, !res.success && (!re || re.test(res.message)), res);
// where a Drive item sits, e.g. "My Drive/GBG/Groovy Employees/Salary_Slips/FY 2026-27/09/3-Asha-2026-09.pdf"
const pathOf = (item) => {
    const parts = [];
    for (let x = item; x; x = x.parent) parts.unshift(x.name);
    return parts.join("/");
};

/* ================= the Drive folder: beside Groovy Kiosk ================= */
{
    // no Groovy Kiosk folder at all → My Drive, and the message says so
    const env = createEnv();
    env.ctx.setupSheets();
    const msg = env.alerts.pop();
    check("no kiosk folder: home is in My Drive", pathOf(env.drive.sheetFile) === "My Drive/Groovy Employees/Groovy Employees Data", pathOf(env.drive.sheetFile));
    check("no kiosk folder: message says so", /No Groovy Kiosk folder was found/.test(msg), msg);
}
{
    // two Groovy Kiosk folders → never guesses between them
    const env = createEnv();
    env.drive.make("folder", "Groovy Kiosk", env.drive.make("folder", "A", env.drive.root));
    env.drive.make("folder", "Groovy Kiosk", env.drive.make("folder", "B", env.drive.root));
    env.ctx.setupSheets();
    const msg = env.alerts.pop();
    check("two kiosk folders: home is in My Drive", pathOf(env.drive.sheetFile) === "My Drive/Groovy Employees/Groovy Employees Data", pathOf(env.drive.sheetFile));
    check("two kiosk folders: message says so", /There are 2 folders called Groovy Kiosk/.test(msg), msg);
}
{
    // a Groovy Kiosk folder in the bin, and a backup's copy of one, are not the real one
    const env = createEnv();
    const gbg = env.drive.make("folder", "GBG", env.drive.root);
    env.drive.make("folder", "Groovy Kiosk", gbg);
    env.drive.make("folder", "Groovy Kiosk", env.drive.root).setTrashed(true);
    env.drive.make("folder", "Groovy Kiosk", env.drive.make("folder", "Back_up", env.drive.root));
    env.ctx.setupSheets();
    env.alerts.pop();
    check("binned and backed-up kiosk folders ignored", pathOf(env.drive.sheetFile) === "My Drive/GBG/Groovy Employees/Groovy Employees Data", pathOf(env.drive.sheetFile));
}
{
    // the sheet already sits in a folder of the right name → nothing moves
    const env = createEnv();
    const mine = env.drive.make("folder", "Groovy Employees", env.drive.make("folder", "Elsewhere", env.drive.root));
    env.drive.sheetFile.moveTo(mine);
    env.drive.make("folder", "Groovy Kiosk", env.drive.root);
    env.ctx.setupSheets();
    const msg = env.alerts.pop();
    check("already in place: not moved", pathOf(env.drive.sheetFile) === "My Drive/Elsewhere/Groovy Employees/Groovy Employees Data", pathOf(env.drive.sheetFile));
    check("already in place: message says so", /already in place/.test(msg), msg);
}

/* ================= the main run ================= */
const env = createEnv();
const { ctx, call } = env;
const run = (code) => vm.runInContext(code, ctx);

const gbg = env.drive.make("folder", "GBG", env.drive.root);
env.drive.make("folder", "Groovy Kiosk", gbg);

// ---- setup + self tests ----
ctx.setupSheets();
const setupMsg = env.alerts.pop();
const pwd = /Password: (\S+)/.exec(setupMsg)[1];
check("setup created the admin", !!pwd, setupMsg);
check("setup made the folder beside Groovy Kiosk", pathOf(env.drive.sheetFile) === "My Drive/GBG/Groovy Employees/Groovy Employees Data", pathOf(env.drive.sheetFile));
check("setup says where the folder went", /created beside Groovy Kiosk, and this sheet was moved into it/.test(setupMsg), setupMsg);
check("setup: folder is private", /Folder access: only you/.test(setupMsg), setupMsg);
check("setup created every tab", ["Users", "Sessions", "Settings", "Employees", "Salary_Slips", "Slip_Items", "Activity_Logs"].every((n) => env.ss.getSheetByName(n)));
check("setup: monthly backup + nightly maintenance timers", env.triggers.map((t) => t.fn).sort().join() === "monthlyBackup,nightlyMaintenance", env.triggers.map((t) => t.fn));
ctx.setupSheets(); // safe to repeat
const again = env.alerts.pop();
check("setup rerun: nothing new", /already existed/.test(again) && /already in place/.test(again) && !/Password/.test(again), again);
check("setup rerun: no second folder", [...env.drive.items.values()].filter((x) => x.kind === "folder" && x.name === "Groovy Employees").length === 1);
check("setup rerun: no second timer", env.triggers.length === 2);

// the folder inherits sharing from the one above it — Setup must say who can see the salaries
gbg.sharedWith = ["manager@shop.in"];
ctx.setupSheets();
check("setup warns when the folder is shared", /⚠ Folder access.*manager@shop\.in/.test(env.alerts.pop()));
gbg.sharedWith = [];
gbg.access = "anyone";
ctx.setupSheets();
check("setup warns when anyone with the link can open it", /anyone who has the link/.test(env.alerts.pop()));
gbg.access = "private";

const testMsg = ctx.runTests();
check("unit tests", /All \d+ tests passed/.test(testMsg), testMsg);

// ---- auth ----
check("no token rejected", call("listEmployees", {}).code === "AUTH_EXPIRED");
check("bad token rejected", call("listEmployees", {}, "x".repeat(64)).code === "AUTH_EXPIRED");
check("unknown action", call("dropEverything", {}).code === "BAD_ACTION");
refused(call("login", { email: "owner@groovy.test", password: "nope" }), "bad password");
const login = ok(call("login", { email: "OWNER@groovy.test", password: pwd }), "admin login");
const T = login.token;
check("admin role", login.user.role === "owner");
const boot = ok(call("bootstrap", {}, T), "bootstrap");
check("company name", boot.settings.business_name === "Groovy Business Group", boot.settings);
check("defaults: 30 days, 1 paid holiday, rupees", boot.settings.salary_days === "30" && boot.settings.paid_holidays === "1" && boot.settings.currency_symbol === "₹", boot.settings);

// a second admin, password change, deactivation
ok(call("saveUser", { name: "Sana", email: "sana@gbg.in", password: "secret1" }, T), "add admin");
refused(call("saveUser", { name: "Dup", email: "sana@gbg.in", password: "secret1" }, T), "duplicate login email", /already in use/);
refused(call("saveUser", { name: "Short", email: "short@gbg.in", password: "123" }, T), "short password", /at least 6/);
const T2 = ok(call("login", { email: "sana@gbg.in", password: "secret1" }), "second admin login").token;
const sana = ok(call("listUsers", {}, T), "list admins").find((u) => u.email === "sana@gbg.in");
refused(call("toggleUser", { id: login.user.id }, T), "cannot deactivate yourself", /yourself/);
ok(call("toggleUser", { id: sana.id }, T), "deactivate second admin");
check("deactivated admin is logged out", call("listEmployees", {}, T2).code === "AUTH_EXPIRED");
refused(call("login", { email: "sana@gbg.in", password: "secret1" }), "deactivated admin cannot log in", /inactive/);
ok(call("toggleUser", { id: sana.id }, T), "reactivate second admin");

// forgot password: same answer for a real and an unknown address; the code works once
const before = env.mails.length;
const f1 = call("forgotPassword", { email: "sana@gbg.in" });
const f2 = call("forgotPassword", { email: "nobody@gbg.in" });
check("forgot password answers alike", f1.success && f2.success && f1.message === f2.message, [f1, f2]);
check("only the real address gets a code", env.mails.length === before + 1 && env.mails[before].to === "sana@gbg.in");
const otp = /code is: (\d{6})/.exec(env.mails[before].body)[1];
refused(call("resetPassword", { email: "sana@gbg.in", otp: "000000", password: "newpass1" }), "wrong reset code");
ok(call("resetPassword", { email: "sana@gbg.in", otp, password: "newpass1" }), "reset password");
ok(call("login", { email: "sana@gbg.in", password: "newpass1" }), "login with the new password");

// ---- employees ----
const emp = (o) => Object.assign({ designation: "Salesperson", doj: "2024-01-12", base_salary: 15000 }, o);
const asha = ok(call("saveEmployee", emp({ emp_no: 3, name: "Asha Khan", email: "Asha@Example.com", phone: "09876543210", dob: "1998-11-03", location: "Kondhwa" }), T), "add Asha");
check("employee saved as typed", asha.emp_no === 3 && asha.email === "asha@example.com" && asha.phone === "09876543210" && asha.status === "active", asha);
refused(call("saveEmployee", emp({ emp_no: 3, name: "Someone Else" }), T), "duplicate employee number", /already belongs to Asha Khan/);
refused(call("saveEmployee", emp({ emp_no: 0, name: "Zero" }), T), "employee number must be 1 or more", /whole number/);
refused(call("saveEmployee", emp({ emp_no: 2.5, name: "Half" }), T), "employee number must be whole", /whole number/);
refused(call("saveEmployee", emp({ emp_no: 9, name: "" }), T), "name required", /Name/);
refused(call("saveEmployee", emp({ emp_no: 9, name: "No Role", designation: "" }), T), "designation required", /designation/);
refused(call("saveEmployee", emp({ emp_no: 9, name: "No Pay", base_salary: 0 }), T), "base salary required", /base salary/);
refused(call("saveEmployee", emp({ emp_no: 9, name: "Bad Date", doj: "12/01/2024" }), T), "joining date required", /date of joining/);
refused(call("saveEmployee", emp({ emp_no: 9, name: "Bad Mail", email: "not-an-email" }), T), "email checked", /Email/);
refused(call("saveEmployee", emp({ emp_no: 9, name: "Baby", dob: "2024-06-01" }), T), "born after joining", /before the date of joining/);

const imran = ok(
    call("saveEmployee", emp({
        emp_no: 1, name: "Imran Shaikh", designation: "Store Manager", base_salary: 32000, doj: "2021-04-01", email: "imran@example.com",
        recurring: [
            { kind: "earning", category: "Allowance", label: "Travel allowance", amount: 1500 },
            { kind: "deduction", category: "Advance", label: "Advance repayment", amount: 1000 },
            { kind: "earning", category: "Allowance", label: "", amount: "" }, // a half-filled row is dropped, not an error
            { kind: "deduction", category: "Unpaid leave", label: "sneaky", amount: 50 }, // the app's own line can't be recurring
        ],
    }), T),
    "add Imran with recurring lines",
);
check("recurring lines cleaned", imran.recurring.length === 2, imran.recurring);
const noMail = ok(call("saveEmployee", emp({ emp_no: 5, name: "Rahul Patil", base_salary: 16000 }), T), "add Rahul (no email)");
const newbie = ok(call("saveEmployee", emp({ emp_no: 7, name: "Zoya Shaikh", doj: "2026-09-10" }), T), "add Zoya (joined Sep 2026)");
const gone = ok(call("saveEmployee", emp({ emp_no: 8, name: "Old Hand", doj: "2020-01-01" }), T), "add Old Hand");
refused(call("setEmployeeStatus", { id: gone.id, status: "left", dol: "2019-01-01" }, T), "leaving before joining", /before the date of joining/);
ok(call("setEmployeeStatus", { id: gone.id, status: "left", dol: "2026-03-20" }, T), "mark Old Hand as left");

// a salary change is logged with both figures
ok(call("saveEmployee", Object.assign({}, noMail, { base_salary: 17000 }), T), "raise Rahul");
check("salary change logged", ok(call("listLogs", { q: "rahul" }, T), "logs").some((l) => /16000 → 17000/.test(l.details)));
ok(call("saveEmployee", Object.assign({}, noMail, { base_salary: 16000 }), T), "put Rahul back");

const list = ok(call("listEmployees", {}, T), "list employees");
check("active first, then by name", list.map((e) => e.name).join() === "Asha Khan,Imran Shaikh,Rahul Patil,Zoya Shaikh,Old Hand", list.map((e) => e.name));
check("phone keeps its leading zero", list.find((e) => e.id === asha.id).phone === "09876543210");
check("dates stay as text", list.find((e) => e.id === asha.id).doj === "2024-01-12" && list.find((e) => e.id === asha.id).dob === "1998-11-03");

// ---- one slip ----
const next = run("(function () { const t = todayStr_(); const y = Number(t.slice(0, 4)); const m = Number(t.slice(5, 7)); return m === 12 ? y + 1 + '-01' : y + '-' + pad_(m + 1, 2); })()");
refused(call("saveSlip", { employee_id: asha.id, month: next }, T), "no slip for a month that hasn't started", /hasn't started/);
refused(call("saveSlip", { employee_id: asha.id, month: "2023-12" }, T), "no slip before joining", /had not joined/);
refused(call("saveSlip", { employee_id: gone.id, month: "2026-04" }, T), "no slip after leaving", /had left/);
refused(call("saveSlip", { employee_id: asha.id, month: "2026-9" }, T), "month must be yyyy-MM", /salary month/);
refused(call("saveSlip", { employee_id: 999, month: "2026-09" }, T), "unknown employee", /not found/);

let d = ok(call("saveSlip", { employee_id: asha.id, month: "2026-09" }, T), "new draft for Asha, September 2026");
const slipId = d.slip.id;
check("draft starts with the holiday taken: nothing added or deducted", d.slip.status === "draft" && d.slip.days_off === 1 && d.items.length === 0 && d.slip.net_salary === 15000, d);
check("slip carries the employee as they are", d.slip.emp_no === 3 && d.slip.employee_name === "Asha Khan" && d.slip.designation === "Salesperson" && d.slip.salary_days === 30 && d.slip.paid_holidays === 1, d.slip);
check("EXISTS code on a second slip", call("saveSlip", { employee_id: asha.id, month: "2026-09" }, T).code === "EXISTS");

// the slip from the plan: 3 days off, overtime, commission, advance
d = ok(call("saveSlip", {
    id: slipId, days_off: 3,
    items: [
        { kind: "earning", category: "Overtime", label: "Overtime (6 hrs)", amount: 1200 },
        { kind: "earning", category: "Commission", label: "Commission", amount: 850 },
        { kind: "deduction", category: "Advance", label: "Advance", amount: 2000 },
    ],
}, T), "save the draft");
check("3 days off → 2 unpaid → 1,000", d.slip.unpaid_days === 2 && d.items.find((i) => i.category === "Unpaid leave").amount === 1000, d);
check("totals", d.slip.earnings_total === 2050 && d.slip.deductions_total === 3000 && d.slip.net_salary === 14050, d.slip);
check("line order: earnings, then leave, then other deductions", d.items.map((i) => i.label).join() === "Overtime (6 hrs),Commission,Unpaid leave,Advance", d.items);
const want = [
    "*** DRAFT - not final ***",
    "",
    "GROOVY BUSINESS GROUP",
    "Salary Slip - September 2026",
    "",
    "Employee : Asha Khan (No. 3)",
    "Role     : Salesperson",
    "Location : Kondhwa",
    "Joined   : 12 Jan 2024",
    "Days off : 3 (1 paid holiday, 2 unpaid)",
    "",
    "EARNINGS",
    "Base salary                  ₹15,000",
    "Overtime (6 hrs)              ₹1,200",
    "Commission                      ₹850",
    "Total earnings               ₹17,050",
    "",
    "DEDUCTIONS",
    "Unpaid leave (2 days)         ₹1,000",
    "Advance                       ₹2,000",
    "Total deductions              ₹3,000",
    "",
    "NET SALARY                   ₹14,050",
    "Rupees Fourteen Thousand Fifty only",
    "",
];
check("slip text", d.text.split("\n").slice(0, want.length).join("\n") === want.join("\n"), d.text);
check("slip text ends with the footer", /Generated on \d+ \w+ \d{4}\.\nThis is a computer-generated slip/.test(d.text), d.text);

// the totals are never taken from the app
d = ok(call("saveSlip", { id: slipId, net_salary: 999999, earnings_total: 5, status: "final" }, T), "save with made-up totals");
check("made-up totals ignored", d.slip.net_salary === 14050 && d.slip.status === "draft", d.slip);
check("lines kept when none are sent", d.items.length === 4, d.items);

// days off, every way round
d = ok(call("saveSlip", { id: slipId, days_off: 0 }, T), "no day off");
check("holiday not taken → +500", d.items.find((i) => i.category === "Holiday not taken").amount === 500 && !d.items.find((i) => i.category === "Unpaid leave") && d.slip.net_salary === 15000 + 2050 + 500 - 2000, d);
check("days-off note: holiday not taken", /Days off : 0 \(holiday not taken, paid extra\)/.test(d.text), d.text);
d = ok(call("saveSlip", { id: slipId, days_off: 1 }, T), "one day off");
check("holiday taken → neither line", d.items.every((i) => !i.auto) && /Days off : 1 \(paid holiday\)/.test(d.text), d);
d = ok(call("saveSlip", { id: slipId, days_off: 1.5 }, T), "one and a half days off");
check("half day unpaid → 250", d.items.find((i) => i.auto).amount === 250 && /Unpaid leave \(half day\)/.test(d.text), d);
d = ok(call("saveSlip", { id: slipId, days_off: 3, leave_amount: 800 }, T), "leave amount typed over");
check("typed-over amount kept", d.items.find((i) => i.auto).amount === 800 && d.auto.leave_amount === 1000 && d.slip.deductions_total === 2800, d);
d = ok(call("saveSlip", { id: slipId, days_off: 3, leave_amount: "" }, T), "back to the worked-out amount");
check("worked-out amount again", d.items.find((i) => i.auto).amount === 1000 && d.slip.net_salary === 14050, d);
refused(call("saveSlip", { id: slipId, days_off: 1.25 }, T), "quarter days refused", /whole or half/);
refused(call("saveSlip", { id: slipId, days_off: 40 }, T), "40 days off refused", /between 0 and 31/);
refused(call("saveSlip", { id: slipId, items: [{ kind: "earning", category: "Bonus", label: "Bonus", amount: -5 }] }, T), "negative line refused", /amount/);
refused(call("saveSlip", { id: slipId, items: [{ kind: "gift", category: "Bonus", label: "Bonus", amount: 5 }] }, T), "unknown kind refused");
check("a refused save changed nothing", ok(call("getSlip", { id: slipId }, T), "get slip").slip.net_salary === 14050);

// a base salary changed on the draft only
d = ok(call("saveSlip", { id: slipId, base_salary: 18000 }, T), "base changed on the slip");
check("leave follows the slip's base", d.items.find((i) => i.auto).amount === 1200 && d.slip.net_salary === 18000 + 2050 - 1200 - 2000, d);
check("the employee's own base is untouched", ok(call("listEmployees", {}, T), "list").find((e) => e.id === asha.id).base_salary === 15000);
ok(call("saveSlip", { id: slipId, base_salary: 15000, notes: "Advance of 2,000 taken on 5 Sep" }, T), "base back, note added");

// a draft follows the profile; the number and name on it change with the employee
ok(call("saveEmployee", Object.assign({}, asha, { designation: "Senior Salesperson" }), T), "promote Asha");
d = ok(call("saveSlip", { id: slipId }, T), "save the draft again");
check("draft picks up the new designation", d.slip.designation === "Senior Salesperson", d.slip);

// negative net cannot be finalized
const big = ok(call("saveSlip", { employee_id: noMail.id, month: "2026-09", items: [{ kind: "deduction", category: "Advance", label: "Advance", amount: 20000 }] }, T), "Rahul: advance bigger than the salary");
check("negative net is shown", big.slip.net_salary === -4000, big.slip);
refused(call("finalizeSlip", { id: big.slip.id }, T), "negative net cannot be finalized", /more than the salary/);
ok(call("deleteSlip", { id: big.slip.id }, T), "delete the draft");
check("deleted draft is gone, with its lines", call("getSlip", { id: big.slip.id }, T).code === "NOT_FOUND" && run(`rows_("Slip_Items").filter((i) => i.slip_id === ${big.slip.id}).length`) === 0);

// ---- finalize: locked, filed in Drive, emailed ----
refused(call("emailSlip", { id: slipId }, T), "a draft cannot be emailed", /Finalize/);
refused(call("saveSlipPdf", { id: slipId }, T), "a draft has no PDF", /Finalize/);
const mailsBefore = env.mails.length;
let fin = call("finalizeSlip", { id: slipId, email: true }, T);
d = ok(fin, "finalize and email");
check("final", d.slip.status === "final" && !!d.slip.finalized_at && !/DRAFT/.test(d.text), d.slip);
check("message says where it went", /Slip finalized\. Emailed to asha@example\.com\./.test(fin.message), fin.message);
const pdf = env.drive.items.get(/\/d\/([^/]+)/.exec(d.slip.pdf_url)[1]);
check("PDF filed by FY, month, number-name-month", pathOf(pdf) === "My Drive/GBG/Groovy Employees/Salary_Slips/FY 2026-27/09/3-Asha-2026-09.pdf", pathOf(pdf));
check("PDF is a PDF", pdf.mime === "application/pdf");
check("PDF holds the slip", ["GROOVY", "Groovy Business Group", "SEPTEMBER 2026", "Asha Khan", "No. 3", "Senior Salesperson", "Unpaid leave (2 days)", "₹14,050", "Rupees Fourteen Thousand Fifty only", "Advance of 2,000"].every((t) => pdf.html.toUpperCase().indexOf(t.toUpperCase()) >= 0), pdf.html);
check("PDF is not marked draft", !/DRAFT/.test(pdf.html));
const mail = env.mails[env.mails.length - 1];
check("one email, to the employee", env.mails.length === mailsBefore + 1 && mail.to === "asha@example.com", mail);
check("email subject", mail.subject === "Salary slip for September 2026 — Groovy Business Group", mail.subject);
check("email body is the slip text", mail.body.indexOf("Hi Asha,") === 0 && mail.body.indexOf(d.text) > 0, mail.body);
check("email carries the PDF", mail.attachments.length === 1 && mail.attachments[0].name === "3-Asha-2026-09.pdf", mail.attachments);
check("slip remembers the email", d.slip.emailed_to === "asha@example.com" && !!d.slip.emailed_at, d.slip);

// a final slip is read-only, and no longer follows the profile
refused(call("saveSlip", { id: slipId, days_off: 0 }, T), "a final slip cannot be edited", /final/);
refused(call("deleteSlip", { id: slipId }, T), "a final slip cannot be deleted", /Reopen/);
refused(call("finalizeSlip", { id: slipId }, T), "cannot finalize twice", /already final/);
ok(call("saveEmployee", Object.assign({}, asha, { designation: "Salesperson", name: "Asha K. Khan", base_salary: 20000 }), T), "edit Asha after the slip is final");
d = ok(call("getSlip", { id: slipId }, T), "get the final slip");
check("final slip keeps the old name, role and base", d.slip.employee_name === "Asha Khan" && d.slip.designation === "Senior Salesperson" && d.slip.base_salary === 15000, d.slip);
refused(call("deleteEmployee", { id: asha.id }, T), "an employee with slips cannot be deleted", /has salary slips/);

// a lost reply: the app retries with the same id and nothing happens twice
const firstTry = call("saveSlip", { employee_id: imran.id, month: "2026-09" }, T, undefined, "req-imran-sep-0001");
const retry = call("saveSlip", { employee_id: imran.id, month: "2026-09" }, T, undefined, "req-imran-sep-0001");
check("retry returns the first answer", firstTry.success && retry.success && retry.data.slip.id === firstTry.data.slip.id, retry);
check("retry made no second slip", run(`rows_("Salary_Slips").filter((s) => s.employee_id === ${imran.id}).length`) === 1);
check("new slip starts with the recurring lines", firstTry.data.items.map((i) => i.label).join() === "Travel allowance,Advance repayment" && firstTry.data.slip.net_salary === 32500, firstTry.data);
const m1 = env.mails.length;
const e1 = call("finalizeSlip", { id: firstTry.data.slip.id, email: true }, T, undefined, "req-imran-fin-0001");
const e2 = call("finalizeSlip", { id: firstTry.data.slip.id, email: true }, T, undefined, "req-imran-fin-0001");
check("retried finalize: one email", e1.success && e2.success && env.mails.length === m1 + 1, [e1.message, e2.message]);

// ---- reopen and re-finalize: the file is replaced ----
d = ok(call("reopenSlip", { id: slipId }, T), "reopen Asha's slip");
check("reopened: draft, no file, not emailed", d.slip.status === "draft" && !d.slip.pdf_url && !d.slip.emailed_at && pdf.trashed, d.slip);
check("reopened draft follows the profile again", ok(call("saveSlip", { id: slipId, base_salary: 15000 }, T), "save").slip.employee_name === "Asha K. Khan");
ok(call("saveEmployee", Object.assign({}, asha, { designation: "Salesperson" }), T), "Asha's name back");
d = ok(call("finalizeSlip", { id: slipId }, T), "finalize again, no email");
const inFolder = [...env.drive.items.values()].filter((x) => x.kind === "file" && x.name === "3-Asha-2026-09.pdf");
check("one live file of that name", inFolder.filter((x) => !x.trashed).length === 1 && inFolder.length === 2, inFolder.map((x) => x.trashed));
check("not emailed when not asked", !d.slip.emailed_at && env.mails.length === m1 + 1);
// a stray file left under the same name is replaced too
ok(call("saveSlipPdf", { id: slipId }, T), "save the PDF again");
check("still one live file", [...env.drive.items.values()].filter((x) => x.kind === "file" && x.name === "3-Asha-2026-09.pdf" && !x.trashed).length === 1);

// a slip for March is filed under the earlier financial year
const march = ok(call("saveSlip", { employee_id: asha.id, month: "2026-03" }, T), "Asha: March 2026");
d = ok(call("finalizeSlip", { id: march.slip.id }, T), "finalize March");
check("March goes under FY 2025-26", pathOf(env.drive.items.get(/\/d\/([^/]+)/.exec(d.slip.pdf_url)[1])) === "My Drive/GBG/Groovy Employees/Salary_Slips/FY 2025-26/03/3-Asha-2026-03.pdf");

// ---- email problems are reported, never fatal ----
const r = ok(call("saveSlip", { employee_id: noMail.id, month: "2026-09" }, T), "Rahul: September");
fin = call("finalizeSlip", { id: r.slip.id, email: true }, T);
check("no address: finalized, and told why no email", fin.success && fin.data.slip.status === "final" && /no email address/.test(fin.message), fin.message);
check("no address: the PDF is still filed", !!fin.data.slip.pdf_url);
refused(call("emailSlip", { id: r.slip.id }, T), "email without an address", /no email address/);
run("MailApp.getRemainingDailyQuota = () => 0");
const q = call("emailSlip", { id: slipId }, T);
check("daily limit reached", !q.success && q.code === "QUOTA", q);
run("MailApp.getRemainingDailyQuota = () => 100");
// the filed PDF was deleted in Drive: emailing makes a fresh one
env.drive.items.get(/\/d\/([^/]+)/.exec(ok(call("getSlip", { id: slipId }, T), "get").slip.pdf_url)[1]).setTrashed(true);
d = ok(call("emailSlip", { id: slipId }, T), "email after the file was binned");
check("a fresh PDF was made and sent", !env.drive.items.get(/\/d\/([^/]+)/.exec(d.slip.pdf_url)[1]).trashed && env.mails[env.mails.length - 1].attachments[0].name === "3-Asha-2026-09.pdf");
// copied to the address in Settings
ok(call("saveSettings", { settings: { slip_email_cc: "Accounts@GBG.in; owner@gbg.in" } }, T), "set the cc list");
ok(call("emailSlip", { id: slipId }, T), "email with cc");
check("cc on the slip email", env.mails[env.mails.length - 1].cc === "accounts@gbg.in,owner@gbg.in", env.mails[env.mails.length - 1].cc);
refused(call("saveSettings", { settings: { slip_email_cc: "not-an-address" } }, T), "bad cc address", /Not a valid email/);
ok(call("saveSettings", { settings: { slip_email_cc: "" } }, T), "clear the cc list");

// ---- the month: everyone on the payroll, prepare all, email all ----
let month = ok(call("listMonth", { month: "2026-09" }, T), "September payroll");
check("who is on September's payroll", month.rows.map((x) => x.employee.name).join() === "Asha Khan,Imran Shaikh,Rahul Patil,Zoya Shaikh", month.rows.map((x) => x.employee.name));
check("September summary", month.summary.employees === 4 && month.summary.finals === 3 && month.summary.not_started === 1 && month.summary.drafts === 0, month.summary);
check("someone who left in March is on March's payroll, not April's", ok(call("listMonth", { month: "2026-03" }, T), "March").rows.some((x) => x.employee.name === "Old Hand") && !ok(call("listMonth", { month: "2026-04" }, T), "April").rows.some((x) => x.employee.name === "Old Hand"));
check("someone who joined in September is not on August's", !ok(call("listMonth", { month: "2026-08" }, T), "August").rows.some((x) => x.employee.name === "Zoya Shaikh"));
check("no month given → last month", ok(call("listMonth", {}, T), "default month").month === run("lastMonth_(todayStr_())"));
refused(call("prepareMonth", { month: next }, T), "cannot prepare a future month", /hasn't started/);
let prep = call("prepareMonth", { month: "2026-09" }, T);
check("prepare makes only the missing slip", ok(prep, "prepare September").created === 1, prep);
check("prepare again makes nothing", ok(call("prepareMonth", { month: "2026-09" }, T), "prepare again").created === 0);
prep = ok(call("prepareMonth", { month: "2026-08" }, T), "prepare August");
check("August: three drafts", prep.created === 3, prep);
month = ok(call("listMonth", { month: "2026-08" }, T), "August payroll");
check("August drafts carry recurring lines", month.rows.find((x) => x.employee.name === "Imran Shaikh").slip.net_salary === 32500 && month.summary.drafts === 3 && month.summary.total_net === 32500 + 15000 + 16000, month);

// email all: finals not yet sent, skipping those without an address
ok(call("saveEmployee", Object.assign({}, newbie, { email: "zoya@example.com" }), T), "give Zoya an address");
const zoyaSlip = ok(call("listMonth", { month: "2026-09" }, T), "September").rows.find((x) => x.employee.name === "Zoya Shaikh").slip;
ok(call("finalizeSlip", { id: zoyaSlip.id }, T), "finalize Zoya");
const m2 = env.mails.length;
const all = call("emailMonth", { month: "2026-09" }, T);
check("email all: Zoya only (Asha and Imran were sent, Rahul has no address)", ok(all, "email all").sent === 1 && env.mails.length === m2 + 1 && env.mails[m2].to === "zoya@example.com", all);
check("email all names who has no address", all.data.no_email.join() === "Rahul Patil" && all.data.remaining === 0 && /no email address for Rahul Patil/.test(all.message), all);
check("email all again sends nothing", ok(call("emailMonth", { month: "2026-09" }, T), "email all again").sent === 0 && env.mails.length === m2 + 1);
month = ok(call("listMonth", { month: "2026-09" }, T), "September payroll");
check("September: all final, three emailed", month.summary.finals === 4 && month.summary.emailed === 3, month.summary);

// settings: a change affects new slips only
ok(call("saveSettings", { settings: { salary_days: "26", paid_holidays: "2", business_name: "Groovy Business Group", earning_types: " Overtime, Bonus ,overtime, Unpaid leave ", slip_footer: "Thank you." } }, T), "change the payroll settings");
const st = ok(call("getSettings", {}, T), "settings");
check("type list cleaned", st.earning_types === "Overtime, Bonus", st.earning_types);
check("an existing slip keeps its own days", ok(call("getSlip", { id: slipId }, T), "old slip").slip.salary_days === 30);
const jul = ok(call("saveSlip", { employee_id: asha.id, month: "2026-07", days_off: 4 }, T), "new slip after the change");
check("a new slip uses the new settings", jul.slip.salary_days === 26 && jul.slip.paid_holidays === 2 && jul.slip.unpaid_days === 2 && jul.items[0].amount === Math.round((15000 / 26) * 2), jul);
refused(call("saveSettings", { settings: { salary_days: "0" } }, T), "salary days must be 1–31", /between 1 and 31/);
refused(call("saveSettings", { settings: { paid_holidays: "-1" } }, T), "paid holidays cannot be negative");
refused(call("saveSettings", { settings: { currency_symbol: "" } }, T), "currency symbol required");
refused(call("saveSettings", { settings: { deduction_types: " , " } }, T), "at least one deduction type");
ok(call("saveSettings", { settings: { salary_days: "30", paid_holidays: "1" } }, T), "settings back");
ok(call("deleteSlip", { id: jul.slip.id }, T), "delete the July draft");

// ---- an employee's history, home, the log ----
const hist = ok(call("employeeSlips", { employee_id: asha.id }, T), "Asha's slips");
check("history: newest month first", hist.map((s) => s.month).join() === "2026-09,2026-08,2026-03", hist.map((s) => s.month));
const dash = ok(call("dashboard", {}, T), "dashboard");
check("dashboard counts", dash.active === 4 && dash.left === 1 && dash.base_total === 15000 + 32000 + 16000 + 15000, dash);
check("dashboard is about last month", dash.month === run("lastMonth_(todayStr_())") && dash.payroll.month === dash.month, dash);
// a birthday nine days away and one forty days away
const d9 = run("dayFromToday_(9)");
const d40 = run("dayFromToday_(40)");
ok(call("saveEmployee", emp({ emp_no: 20, name: "Soon Birthday", dob: "1995" + d9.slice(4), doj: "2024-01-12" }), T), "birthday soon");
ok(call("saveEmployee", emp({ emp_no: 21, name: "Later Birthday", dob: "1995" + d40.slice(4), doj: "2024-01-12" }), T), "birthday later");
const up = ok(call("dashboard", {}, T), "dashboard").upcoming;
check("upcoming: within 30 days only", up.some((u) => u.name === "Soon Birthday" && u.type === "birthday" && u.days === 9) && !up.some((u) => u.name === "Later Birthday" && u.type === "birthday"), up);
check("upcoming: soonest first", up.every((u, i) => i === 0 || up[i - 1].days <= u.days), up);
const logs = ok(call("listLogs", {}, T), "activity log");
check("log has the main events", ["LOGIN", "CREATE", "FINALIZE", "EMAIL", "REOPEN", "PREPARE"].every((a) => logs.some((l) => l.action === a)), logs.map((l) => l.action));
check("no password or code in the log", !logs.some((l) => /secret1|newpass1/.test(l.details)) && !logs.some((l) => l.details.indexOf(otp) >= 0));

// ---- nothing sensitive is stored ----
const cols = run("Object.keys(SCHEMA.Employees).join()");
check("no bank or ID columns on an employee", !/bank|account|ifsc|pan|aadhaar|aadhar|ssn|national/i.test(cols), cols);

// ---- backup, logout, sheet-side tools ----
const b1 = ctx.monthlyBackup();
const b2 = ctx.monthlyBackup();
const copies = [...env.drive.items.values()].filter((x) => x.kind === "file" && /^Groovy Employees Data \d{4}-\d{2}$/.test(x.name));
check("monthly backup copies the sheet once", b1.copied && !b2.copied && copies.length === 1 && /Groovy Employees\/Back_up\/\d{4}-\d{2}\/Groovy Employees Data/.test(pathOf(copies[0])), copies.map(pathOf));
ctx.backupNow();
check("back up now", /A copy of this sheet is now in Back_up\//.test(env.alerts.pop()));
const reset = run(`resetAdminPassword_("sana@gbg.in")`);
ok(call("login", { email: "sana@gbg.in", password: reset.password }), "login after a sheet-side password reset");
ok(call("logout", {}, T), "logout");
check("logged out", call("listEmployees", {}, T).code === "AUTH_EXPIRED");

/* ================= demo data loads on a fresh sheet ================= */
{
    const demo = createEnv();
    demo.ctx.setupSheets();
    const p = /Password: (\S+)/.exec(demo.alerts.pop())[1];
    demo.ctx.seedDemo();
    const said = demo.alerts.pop();
    check("demo data loaded", /Demo data loaded: 6 employees/.test(said), said);
    const t = demo.call("login", { email: "owner@groovy.test", password: p }).data.token;
    const dash2 = demo.call("dashboard", {}, t).data;
    check("demo: six active, last month all drafts", dash2.active === 6 && dash2.payroll.drafts === 6 && dash2.payroll.finals === 0, dash2);
    check("demo: a birthday is coming up", dash2.upcoming.some((u) => u.type === "birthday" && u.days === 9), dash2.upcoming);
    const prev = demo.ctx.lastMonth_(dash2.month + "-01");
    const m = demo.call("listMonth", { month: prev }, t).data;
    check("demo: the month before is final, with PDFs, nothing emailed", m.summary.finals === 6 && m.rows.every((x) => x.slip.pdf_url) && demo.mails.length === 0, m.summary);
    demo.ctx.seedDemo();
    check("demo data refuses to load twice", /already exist/.test(demo.alerts.pop()));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
