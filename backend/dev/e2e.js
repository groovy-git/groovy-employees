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
const emp = (o) => Object.assign({ designation: "Salesperson Kiosk", doj: "2024-01-12", base_salary: 15000 }, o);
const asha = ok(call("saveEmployee", emp({ emp_no: 3, name: "Asha Khan", email: "Asha@Example.com", phone: "09876543210", dob: "1998-11-03", location: "Kondhwa" }), T), "add Asha");
check("employee saved as typed", asha.emp_no === 3 && asha.email === "asha@example.com" && asha.phone === "09876543210" && asha.status === "active", asha);
refused(call("saveEmployee", emp({ emp_no: 3, name: "Someone Else" }), T), "duplicate employee number", /already belongs to Asha Khan/);
refused(call("saveEmployee", emp({ emp_no: 0, name: "Zero" }), T), "employee number must be 1 or more", /whole number/);
refused(call("saveEmployee", emp({ emp_no: 2.5, name: "Half" }), T), "employee number must be whole", /whole number/);
refused(call("saveEmployee", emp({ emp_no: 9, name: "" }), T), "name required", /Name/);
refused(call("saveEmployee", emp({ emp_no: 9, name: "No Role", designation: "" }), T), "role required", /Choose a role/);
refused(call("saveEmployee", emp({ emp_no: 9, name: "No Pay", base_salary: 0 }), T), "base salary required", /base salary/);
refused(call("saveEmployee", emp({ emp_no: 9, name: "Bad Date", doj: "12/01/2024" }), T), "joining date required", /date of joining/);
refused(call("saveEmployee", emp({ emp_no: 9, name: "Bad Mail", email: "not-an-email" }), T), "email checked", /Email/);
refused(call("saveEmployee", emp({ emp_no: 9, name: "Baby", dob: "2024-06-01" }), T), "born after joining", /before the date of joining/);

// ---- roles: a list in Settings, and an employee's role must come from it ----
const ROLES = ["Chief Executive Officer", "Director – Strategic Alliances", "Director – Business Development", "Store Manager", "Salesperson Kiosk", "Salesperson Event", "Logistics Executive"];
check("the seven roles are there from the start", boot.settings.roles === ROLES.join("\n"), boot.settings.roles);
refused(call("saveEmployee", emp({ emp_no: 30, name: "Role Tester", designation: "Astronaut" }), T), "a role not on the list is refused", /not one of the roles/);
let tester = ok(call("saveEmployee", emp({ emp_no: 30, name: "Role Tester", designation: "director – business development" }), T), "role typed in small letters");
check("role stored as the list spells it", tester.designation === "Director – Business Development", tester.designation);
// an admin adds a role; the list is tidied on the way in
ok(call("saveSettings", { settings: { roles: ROLES.join("\n") + "\n\n  Accountant \r\naccountant\n Sales   Lead \n" } }, T), "add roles in Settings");
check("role list cleaned: blank lines, repeats, stray spaces", ok(call("getSettings", {}, T), "settings").roles === ROLES.concat(["Accountant", "Sales Lead"]).join("\n"));
tester = ok(call("saveEmployee", Object.assign({}, tester, { designation: "Accountant" }), T), "the new role can be given");
refused(call("saveSettings", { settings: { roles: " \n \n" } }, T), "an empty role list is refused", /at least one role/);
// the role is taken off the list again: whoever holds it keeps it, nobody new can be given it
ok(call("saveSettings", { settings: { roles: ROLES.join("\n") } }, T), "remove the added roles");
tester = ok(call("saveEmployee", Object.assign({}, tester, { phone: "9000000001" }), T), "edit someone whose role left the list");
check("their role is kept", tester.designation === "Accountant" && tester.phone === "9000000001", tester);
refused(call("saveEmployee", emp({ emp_no: 31, name: "Second Accountant", designation: "Accountant" }), T), "a removed role cannot be given to someone new", /not one of the roles/);
refused(call("saveEmployee", Object.assign({}, tester, { designation: "Astronaut" }), T), "nor can they move to another role that isn't listed", /not one of the roles/);
ok(call("deleteEmployee", { id: tester.id }, T), "delete the role tester");

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
check("salary change logged", ok(call("listLogs", { q: "rahul" }, T), "logs").some((l) => /base salary 16000 → base salary 17000/.test(l.details)));
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
check("slip carries the employee as they are", d.slip.emp_no === 3 && d.slip.employee_name === "Asha Khan" && d.slip.designation === "Salesperson Kiosk" && d.slip.salary_days === 30 && d.slip.paid_holidays === 1, d.slip);
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
    "Employee : Asha Khan (Emp No. 3)",
    "Role     : Salesperson Kiosk",
    "Location : Kondhwa",
    "Joined   : 12 Jan 2024",
    "Days off : 3 (1 paid holiday, 2 unpaid)",
    "",
    "EARNINGS",
    "Base salary                    ₹15,000",
    "Overtime (6 hrs)                ₹1,200",
    "Commission                        ₹850",
    "Total earnings                 ₹17,050",
    "",
    "DEDUCTIONS",
    "Unpaid leave (2 days)           ₹1,000",
    "Advance                         ₹2,000",
    "Total deductions                ₹3,000",
    "",
    "NET SALARY                     ₹14,050",
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
ok(call("saveEmployee", Object.assign({}, asha, { designation: "Store Manager" }), T), "promote Asha");
d = ok(call("saveSlip", { id: slipId }, T), "save the draft again");
check("draft picks up the new designation", d.slip.designation === "Store Manager", d.slip);

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
check("PDF holds the slip", ["GROOVY", "Groovy Business Group", "SEPTEMBER 2026", "Asha Khan", "Emp No. 3", "Store Manager", "Unpaid leave (2 days)", "₹14,050", "Rupees Fourteen Thousand Fifty only", "Advance of 2,000"].every((t) => pdf.html.toUpperCase().indexOf(t.toUpperCase()) >= 0), pdf.html);
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
ok(call("saveEmployee", Object.assign({}, asha, { designation: "Salesperson Kiosk", name: "Asha K. Khan", base_salary: 20000 }), T), "edit Asha after the slip is final");
d = ok(call("getSlip", { id: slipId }, T), "get the final slip");
check("final slip keeps the old name, role and base", d.slip.employee_name === "Asha Khan" && d.slip.designation === "Store Manager" && d.slip.base_salary === 15000, d.slip);
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
ok(call("saveEmployee", Object.assign({}, asha, { designation: "Salesperson Kiosk" }), T), "Asha's name back");
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

// ---- reset all data: employees, slips and the log go; logins and settings stay ----
const count = (tab) => run(`resetReqCache_(), rows_("${tab}").length`);
const TR = ok(call("login", { email: "sana@gbg.in", password: reset.password }), "login before the reset").token;
ok(call("saveSettings", { settings: { slip_footer: "Kept through the reset." } }, TR), "a setting changed before the reset");
const had = { emps: count("Employees"), slips: count("Salary_Slips"), items: count("Slip_Items"), logs: count("Activity_Logs"), users: count("Users") };
check("there is data to clear", had.emps >= 6 && had.slips >= 6 && had.items > 0 && had.logs > 20, had);
const live = (name) => [...env.drive.items.values()].filter((x) => x.name === name && !x.trashed);
const pdfsBefore = [...env.drive.items.values()].filter((x) => x.kind === "file" && /\.pdf$/.test(x.name) && !x.trashed && /Salary_Slips/.test(pathOf(x)) && !x.parent.trashed).length;
const res = run("resetAllData_()");
check("reset reports what it removed", res.cleared.Employees === had.emps && res.cleared.Salary_Slips === had.slips && res.cleared.Slip_Items === had.items && res.cleared.Activity_Logs === had.logs && res.cleared.Sessions >= 1, res.cleared);
check("employees, slips and lines are gone", count("Employees") === 0 && count("Salary_Slips") === 0 && count("Slip_Items") === 0 && count("Sessions") === 0);
check("the log starts again with the reset itself", count("Activity_Logs") === 1 && run(`rows_("Activity_Logs")[0].action`) === "RESET");
check("admin logins are kept", count("Users") === had.users && had.users === 2);
check("everyone is logged out", call("listEmployees", {}, TR).code === "AUTH_EXPIRED");
const TA = ok(call("login", { email: "sana@gbg.in", password: reset.password }), "the same password still works after the reset").token;
const kept = ok(call("getSettings", {}, TA), "settings after the reset");
check("settings are kept", kept.slip_footer === "Kept through the reset." && kept.business_name === "Groovy Business Group" && kept.roles.split("\n").length === 7, kept);
check("the app shows an empty company", ok(call("listEmployees", {}, TA), "list").length === 0 && ok(call("dashboard", {}, TA), "dashboard").active === 0);
check("slip PDFs went to Drive's bin", res.pdfs === pdfsBefore && pdfsBefore >= 3 && live("Salary_Slips").length === 0, [res.pdfs, pdfsBefore]);
const copy = [...env.drive.items.values()].find((x) => x.kind === "file" && / before reset$/.test(x.name));
check("a copy of the sheet was saved first", !!copy && res.backup === copy.parent.name && /Groovy Employees\/Back_up\/[\d -]+ before reset\/Groovy Employees Data/.test(pathOf(copy)), copy && pathOf(copy));
check("earlier backups are untouched", live("Back_up").length === 1 && [...env.drive.items.values()].filter((x) => x.kind === "file" && /^Groovy Employees Data \d{4}-\d{2}$/.test(x.name) && !x.trashed).length === 1);
// and the app is ready to be used for real
const first = ok(call("saveEmployee", emp({ emp_no: 3, name: "Asha Khan", email: "asha@example.com" }), TA), "add an employee after the reset");
check("ids start again", first.id === 1, first.id);
const fresh = ok(call("saveSlip", { employee_id: first.id, month: "2026-09" }, TA), "a slip after the reset");
d = ok(call("finalizeSlip", { id: fresh.slip.id }, TA), "finalize after the reset");
check("a fresh Salary_Slips folder is made", live("Salary_Slips").length === 1 && pathOf(env.drive.items.get(/\/d\/([^/]+)/.exec(d.slip.pdf_url)[1])) === "My Drive/GBG/Groovy Employees/Salary_Slips/FY 2026-27/09/3-Asha-2026-09.pdf");
// if the copy can't be made, nothing is cleared
run("DriveApp.__getFileById = DriveApp.getFileById; DriveApp.getFileById = () => { throw new Error('Drive is down'); }");
let threw = false;
try {
    run("resetAllData_()");
} catch (e) {
    threw = /Drive is down/.test(e.message);
}
run("DriveApp.getFileById = DriveApp.__getFileById");
check("no backup, no reset", threw && count("Employees") === 1 && count("Salary_Slips") === 1);

// the menu item itself: it only runs when RESET is typed and OK is pressed
const answer = (text, button) =>
    run(`SpreadsheetApp.getUi = () => ({ ButtonSet: { OK_CANCEL: 1 }, Button: { OK: "ok", CANCEL: "cancel" }, prompt: (title, msg) => ((__asked = title + "\\n" + msg), { getSelectedButton: () => "${button}", getResponseText: () => "${text}" }) })`);
run("var __asked = ''");
answer("reset", "ok"); // not in capitals
ctx.resetAllData();
check("the wrong word changes nothing", env.alerts.pop() === "Nothing was changed." && count("Employees") === 1);
answer("RESET", "cancel");
ctx.resetAllData();
check("Cancel changes nothing", env.alerts.pop() === "Nothing was changed." && count("Employees") === 1);
check("the box says what goes and what stays", /every employee, every salary slip/.test(run("__asked")) && /Kept: the admin logins/.test(run("__asked")) && /saved in Back_up first/.test(run("__asked")), run("__asked"));
answer(" RESET ", "ok");
ctx.resetAllData();
const done = env.alerts.pop();
check("RESET + OK clears, and says what happened", count("Employees") === 0 && /All data cleared\./.test(done) && /Employees: 1/.test(done) && /Slip PDFs moved to Drive's bin: 1\./.test(done) && /Back_up\/[\d -]+ before reset/.test(done), done);

// every item in the sheet's menu points at a function that exists
const menu = [];
run(`SpreadsheetApp.getUi = () => { const m = { addItem: (label, fn) => (__menu.push([label, fn]), m), addSeparator: () => m, addToUi: () => m }; return { createMenu: () => m }; }`);
Object.assign(ctx, { __menu: menu });
ctx.onOpen();
check("menu has the reset item", menu.some(([label, fn]) => /^3\. Reset all data/.test(label) && fn === "resetAllData"), menu);
check("every menu item runs a real function", menu.length === 8 && menu.every(([, fn]) => typeof ctx[fn] === "function"), menu);
run(`SpreadsheetApp.getUi = () => { throw new Error("no UI in tests"); }`);

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
    check("demo: six active; last month five drafts and the event salesperson on call", dash2.active === 6 && dash2.payroll.drafts === 5 && dash2.payroll.employees === 5 && dash2.payroll.on_call === 1 && dash2.payroll.not_started === 0 && dash2.payroll.finals === 0, dash2);
    check("demo: base total leaves out the one paid per event day", dash2.base_total === 32000 + 18000 + 15000 + 14000 + 16000, dash2.base_total);
    const lastRows = demo.call("listMonth", { month: dash2.month }, t).data.rows;
    check("demo: Ayesha has no slip last month", lastRows.find((x) => x.employee.name === "Ayesha Pathan").slip === null && lastRows.find((x) => x.employee.name === "Ayesha Pathan").employee.pay_type === "event");
    const demoSameer = demo.call("getSlip", { id: lastRows.find((x) => x.employee.name === "Sameer Khan").slip.id }, t).data;
    check("demo: Sameer has a base, unpaid leave and two event days", demoSameer.slip.base_salary === 18000 && demoSameer.items.find((i) => i.category === "Event pay").amount === 1600 && demoSameer.items.find((i) => i.category === "Unpaid leave").amount === 1200, demoSameer.items);
    check("demo: a birthday is coming up", dash2.upcoming.some((u) => u.type === "birthday" && u.days === 9), dash2.upcoming);
    const prev = demo.ctx.lastMonth_(dash2.month + "-01");
    const m = demo.call("listMonth", { month: prev }, t).data;
    check("demo: the month before is final, with PDFs, nothing emailed", m.summary.finals === 6 && m.rows.every((x) => x.slip.pdf_url) && demo.mails.length === 0, m.summary);
    const ay = m.rows.find((x) => x.employee.name === "Ayesha Pathan").slip;
    check("demo: Ayesha's slip that month is four event days plus travel", ay.pay_type === "event" && ay.event_days === 4 && ay.base_salary === 0 && ay.net_salary === 4 * 900 + 300, ay);
    demo.ctx.seedDemo();
    check("demo data refuses to load twice", /already exist/.test(demo.alerts.pop()));
}

/* ================= paid per event day: no base salary ================= */
{
    const ev = createEnv();
    ev.drive.make("folder", "Groovy Kiosk", ev.drive.make("folder", "GBG", ev.drive.root));
    ev.ctx.setupSheets();
    const t = ev.call("login", { email: "owner@groovy.test", password: /Password: (\S+)/.exec(ev.alerts.pop())[1] }).data.token;
    const call2 = (action, payload) => ev.call(action, payload, t);
    const row = (label, amount) => label + " ".repeat(38 - label.length - amount.length) + amount; // a line of the slip
    const person = (o) => Object.assign({ designation: "Salesperson Event", doj: "2025-03-01" }, o);
    const cat = (d, c) => d.items.find((i) => i.category === c);

    // ---- the employee ----
    refused(call2("saveEmployee", person({ emp_no: 4, name: "Ayesha Pathan", pay_type: "event" })), "per event day needs a rate", /rate for an event day/);
    refused(call2("saveEmployee", person({ emp_no: 4, name: "Ayesha Pathan", pay_type: "event", day_rate: -5 })), "a negative rate is refused", /0 or more/);
    const ayesha = ok(call2("saveEmployee", person({ emp_no: 4, name: "Ayesha Pathan", pay_type: "event", day_rate: 800, base_salary: 15000, email: "ayesha@example.com" })), "add someone paid per event day");
    check("no base is kept for them, whatever was sent", ayesha.pay_type === "event" && ayesha.base_salary === 0 && ayesha.day_rate === 800, ayesha);
    refused(call2("saveEmployee", person({ emp_no: 2, name: "Sameer Khan", designation: "Salesperson Kiosk", pay_type: "monthly" })), "a monthly salary still needs a base", /monthly base salary/);
    refused(call2("saveEmployee", person({ emp_no: 2, name: "Sameer Khan", designation: "Salesperson Kiosk" })), "and so does an app that sends no pay type", /monthly base salary/);
    const sameer = ok(call2("saveEmployee", person({ emp_no: 2, name: "Sameer Khan", designation: "Salesperson Kiosk", base_salary: 18000, day_rate: 700 })), "monthly, with a rate for the odd event");
    check("no pay type sent means monthly", sameer.pay_type === "monthly" && sameer.base_salary === 18000 && sameer.day_rate === 700, sameer);
    const logged = ok(call2("listLogs", {}), "log");
    check("the log says how each is paid", logged.some((l) => /Ayesha Pathan.*per event day 800/.test(l.details)) && logged.some((l) => /Sameer Khan.*base salary 18000, event day 700/.test(l.details)), logged.map((l) => l.details));
    check("base total counts the monthly salary only", ok(call2("dashboard", {}), "dashboard").base_total === 18000);

    // ---- the month: only those on a monthly salary are due a slip ----
    let month = ok(call2("listMonth", { month: "2026-09" }), "September");
    check("both are listed", month.rows.map((x) => x.employee.name + ":" + x.employee.pay_type).join() === "Ayesha Pathan:event,Sameer Khan:monthly", month.rows);
    check("one slip due, one person on call", month.summary.employees === 1 && month.summary.on_call === 1 && month.summary.not_started === 1, month.summary);
    check("prepare makes the monthly slip only", ok(call2("prepareMonth", { month: "2026-09" }), "prepare").created === 1);
    const again = call2("prepareMonth", { month: "2026-09" });
    check("prepare again: nothing, and it says who it covers", again.data.created === 0 && /Everyone on a monthly salary already has a slip/.test(again.message), again.message);
    month = ok(call2("listMonth", { month: "2026-09" }), "September");
    check("still no slip for the event salesperson, and nothing waiting", month.rows[0].slip === null && month.summary.not_started === 0 && month.summary.drafts === 1, month.summary);

    // ---- their slip, started by hand ----
    let d = ok(call2("saveSlip", { employee_id: ayesha.id, month: "2026-09" }), "start Ayesha's slip");
    const id = d.slip.id;
    check("an event slip starts empty: no base, no days off", d.slip.pay_type === "event" && d.slip.base_salary === 0 && d.slip.days_off === 0 && d.slip.paid_holidays === 0 && d.slip.event_days === 0 && d.slip.event_rate === 800 && d.items.length === 0 && d.slip.net_salary === 0, d.slip);
    check("its text has no base salary or days off", !/Base salary/.test(d.text) && !/Days off/.test(d.text) && /EARNINGS\nNone\n/.test(d.text), d.text);
    refused(call2("finalizeSlip", { id }), "nothing to pay cannot be finalized", /Nothing to pay/);
    month = ok(call2("listMonth", { month: "2026-09" }), "September");
    check("now two slips are in hand", month.summary.employees === 2 && month.summary.on_call === 0 && month.summary.drafts === 2, month.summary);

    d = ok(call2("saveSlip", { id, event_days: 5 }), "five event days");
    check("5 days × 800", cat(d, "Event pay").amount === 4000 && cat(d, "Event pay").qty === 5 && cat(d, "Event pay").auto === 1 && d.slip.event_days === 5 && d.slip.net_salary === 4000 && d.auto.event_amount === 4000, d);
    check("the slip says what it was worked out from", d.text.split("\n").includes(row("Event pay (5 days × ₹800)", "₹4,000")) && d.text.split("\n").includes(row("NET SALARY", "₹4,000")), d.text);
    d = ok(call2("saveSlip", { id, base_salary: 9999, days_off: 6, leave_amount: 500, holiday_amount: 500 }), "a base and days off sent for an event slip");
    check("they are ignored", d.slip.base_salary === 0 && d.slip.days_off === 0 && d.items.length === 1 && d.slip.net_salary === 4000, d);
    d = ok(call2("saveSlip", { id, event_days: 2.5 }), "half days");
    check("2.5 days × 800", cat(d, "Event pay").amount === 2000 && /Event pay \(2\.5 days × ₹800\)/.test(d.text), d.text);
    refused(call2("saveSlip", { id, event_days: 40 }), "40 event days refused", /between 0 and 31/);
    refused(call2("saveSlip", { id, event_days: 1.25 }), "quarter event days refused", /whole or half/);
    refused(call2("saveSlip", { id, items: [{ kind: "earning", category: "Bonus", label: "Bonus", amount: -1 }] }), "a bad line is still refused");
    // a different rate for this month only
    d = ok(call2("saveSlip", { id, event_days: 5, event_rate: 1000 }), "a higher rate this month");
    check("the slip's own rate is used", cat(d, "Event pay").amount === 5000 && d.slip.event_rate === 1000 && /5 days × ₹1,000/.test(d.text), d);
    check("the employee's usual rate is untouched", ok(call2("listEmployees", {}), "list").find((e) => e.id === ayesha.id).day_rate === 800);
    // an amount typed over the worked-out one
    d = ok(call2("saveSlip", { id, event_amount: 4500 }), "event amount typed over");
    check("typed amount kept, and the label stops claiming a sum", cat(d, "Event pay").amount === 4500 && d.auto.event_amount === 5000 && d.text.split("\n").includes(row("Event pay (5 days)", "₹4,500")), d.text);
    d = ok(call2("saveSlip", { id, event_rate: 800, event_amount: "" }), "back to the usual rate, worked out");
    // other earnings and deductions work as on any slip
    d = ok(call2("saveSlip", { id, items: [{ kind: "earning", category: "Allowance", label: "Travel", amount: 300 }, { kind: "deduction", category: "Advance", label: "Advance", amount: 1000 }, { kind: "earning", category: "Event pay", label: "sneaky", amount: 99999 }] }), "travel and an advance");
    check("totals", d.slip.earnings_total === 4300 && d.slip.deductions_total === 1000 && d.slip.net_salary === 3300 && d.items.map((i) => i.label).join() === "Event pay,Travel,Advance", d);
    const want = [
        "Employee : Ayesha Pathan (Emp No. 4)",
        "Role     : Salesperson Event",
        "Joined   : 1 Mar 2025",
        "",
        "EARNINGS",
        row("Event pay (5 days × ₹800)", "₹4,000"),
        row("Travel", "₹300"),
        row("Total earnings", "₹4,300"),
        "",
        "DEDUCTIONS",
        row("Advance", "₹1,000"),
        row("Total deductions", "₹1,000"),
        "",
        row("NET SALARY", "₹3,300"),
        "Rupees Three Thousand Three Hundred only",
    ].join("\n");
    check("the whole event slip", d.text.indexOf(want) > 0, d.text);

    const fin = call2("finalizeSlip", { id, email: true });
    d = ok(fin, "finalize the event slip");
    const pdf = ev.drive.items.get(/\/d\/([^/]+)/.exec(d.slip.pdf_url)[1]);
    check("filed like any slip", pathOf(pdf) === "My Drive/GBG/Groovy Employees/Salary_Slips/FY 2026-27/09/4-Ayesha-2026-09.pdf" && /Emailed to ayesha@example\.com/.test(fin.message), pathOf(pdf));
    check("PDF: event days, the event line, no base and no days off", ["Event days", "5 days", "Event pay (5 days × ₹800)", "₹3,300", "Travel"].every((x) => pdf.html.indexOf(x) >= 0) && !/Base salary/.test(pdf.html) && !/Days off/i.test(pdf.html), pdf.html);
    check("the email is the same slip", ev.mails[ev.mails.length - 1].body.indexOf(want) > 0);

    // ---- someone on a monthly salary who also worked two event days ----
    const sSlip = month.rows.find((x) => x.employee.name === "Sameer Khan").slip.id;
    d = ok(call2("saveSlip", { id: sSlip, event_days: 2, days_off: 3 }), "Sameer: two event days and three days off");
    check("base, event pay at his rate, and unpaid leave together", d.slip.pay_type === "monthly" && d.slip.base_salary === 18000 && cat(d, "Event pay").amount === 1400 && cat(d, "Unpaid leave").amount === 1200 && d.slip.net_salary === 18000 + 1400 - 1200, d);
    const lines = d.text.split("\n");
    check("his slip keeps the base row, with event pay after it", lines.indexOf(row("Base salary", "₹18,000")) > 0 && lines.indexOf(row("Event pay (2 days × ₹700)", "₹1,400")) === lines.indexOf(row("Base salary", "₹18,000")) + 1 && /Days off : 3 \(1 paid holiday, 2 unpaid\)/.test(d.text), d.text);
    d = ok(call2("saveSlip", { id: sSlip, event_days: 0 }), "no event days after all");
    check("the event line goes", !cat(d, "Event pay") && d.slip.net_salary === 18000 - 1200, d.items);
    ok(call2("finalizeSlip", { id: sSlip }), "finalize Sameer");
    d = ok(call2("getSlip", { id: sSlip }), "get Sameer's slip");
    check("his PDF keeps the days-off box and the base row", /Days off/.test(ev.drive.items.get(/\/d\/([^/]+)/.exec(d.slip.pdf_url)[1]).html) && /Base salary/.test(ev.drive.items.get(/\/d\/([^/]+)/.exec(d.slip.pdf_url)[1]).html));

    // ---- a month she did not work: listed, nothing pending ----
    ok(call2("prepareMonth", { month: "2026-08" }), "prepare August");
    month = ok(call2("listMonth", { month: "2026-08" }), "August");
    check("August: Sameer's draft, Ayesha on call, nothing to start", month.summary.employees === 1 && month.summary.on_call === 1 && month.summary.not_started === 0 && month.rows[0].slip === null, month.summary);
    check("history shows the slip as event days", ok(call2("employeeSlips", { employee_id: ayesha.id }), "history").map((x) => x.pay_type + ":" + x.event_days).join() === "event:5");

    // ---- changing how someone is paid ----
    const moved = ok(call2("saveEmployee", Object.assign({}, sameer, { pay_type: "event", day_rate: 900 })), "Sameer moves to per event day");
    check("his base is dropped, and it is logged", moved.base_salary === 0 && moved.pay_type === "event" && ok(call2("listLogs", { q: "sameer" }), "log").some((l) => /base salary 18000, event day 700 → per event day 900/.test(l.details)));
    check("his final slip is as it was", ok(call2("getSlip", { id: sSlip }), "slip").slip.base_salary === 18000);
    const augDraft = month.rows.find((x) => x.employee.name === "Sameer Khan").slip.id;
    check("an open draft keeps the pay type it was made with", ok(call2("saveSlip", { id: augDraft }), "save the August draft").slip.pay_type === "monthly");

    // "Event pay" belongs to the app: it cannot be made an earning type by hand
    ok(call2("saveSettings", { settings: { earning_types: "Event pay, Bonus" } }), "try to add Event pay as a type");
    check("it is dropped from the list", ok(call2("getSettings", {}), "settings").earning_types === "Bonus");
}

/* ================= a sheet from before this update ================= */
{
    // take the new columns out of the schema, set up, and add data the way the previous version did
    const old = createEnv();
    const oldRun = (code) => vm.runInContext(code, old.ctx);
    oldRun(`var __new = { Employees: ["pay_type", "day_rate"], Salary_Slips: ["pay_type", "event_days", "event_rate"] }; var __types = {};
        Object.keys(__new).forEach((t) => __new[t].forEach((k) => { __types[t + "." + k] = SCHEMA[t][k]; delete SCHEMA[t][k]; }));
        var __w = [Object.keys(SCHEMA.Employees).length, Object.keys(SCHEMA.Salary_Slips).length]; // how wide the old tabs are`);
    old.ctx.setupSheets();
    const t = old.call("login", { email: "owner@groovy.test", password: /Password: (\S+)/.exec(old.alerts.pop())[1] }).data.token;
    const asha = ok(old.call("saveEmployee", { emp_no: 3, name: "Asha Khan", designation: "Salesperson Kiosk", doj: "2024-01-12", base_salary: 15000 }, t), "old version: add an employee");
    const slip = ok(old.call("saveSlip", { employee_id: asha.id, month: "2026-09", days_off: 3 }, t), "old version: a slip");
    ok(old.call("finalizeSlip", { id: slip.slip.id }, t), "old version: finalize");
    const snapshot = `resetReqCache_(), JSON.stringify([sheet_("Employees").getRange(2, 1, 1, __w[0]).getValues(), sheet_("Salary_Slips").getRange(2, 1, 1, __w[1]).getValues()])`;
    const before = oldRun(snapshot);

    // the new code arrives
    oldRun(`Object.keys(__new).forEach((t) => __new[t].forEach((k) => (SCHEMA[t][k] = __types[t + "." + k])));`);
    check("before Setup is run, the app says to run it", old.call("listEmployees", {}, t).code === "SETUP" && /run Groovy Employees → 1\. Setup/.test(old.call("listMonth", { month: "2026-09" }, t).message));
    old.ctx.setupSheets();
    const said = old.alerts.pop();
    check("Setup adds the columns and says so", /Employees \(\+pay_type, day_rate\)/.test(said) && /Salary_Slips \(\+pay_type, event_days, event_rate\)/.test(said), said);
    check("the rows already there are untouched", oldRun(snapshot) === before && before.length > 200);
    const e = ok(old.call("listEmployees", {}, t), "list after Setup")[0];
    check("an employee from before is on a monthly salary", e.pay_type === "monthly" && e.day_rate === 0 && e.base_salary === 15000, e);
    const d = ok(old.call("getSlip", { id: slip.slip.id }, t), "the old slip");
    check("the old slip reads as it did", d.slip.pay_type === "monthly" && d.slip.event_days === 0 && d.slip.net_salary === 14000 && /Base salary +₹15,000/.test(d.text) && /Days off : 3/.test(d.text) && !/Event pay/.test(d.text), d.text);
    check("and its month counts as before", ok(old.call("listMonth", { month: "2026-09" }, t), "month").summary.finals === 1);
    ok(old.call("saveEmployee", Object.assign({}, e, { phone: "9000000002" }), t), "edit them with the new version");
    check("a new slip for them works", ok(old.call("saveSlip", { employee_id: e.id, month: "2026-08", event_days: 1, event_rate: 600 }, t), "new slip").slip.net_salary === 15600);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
