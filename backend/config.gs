/**
 * Groovy Employees — schema & constants.
 * Every sheet is a table: row 1 = headers, one record per row.
 * Column types: n = number, s = text (stored as plain text so phones and dates stay as typed),
 *               d = IST datetime text "yyyy-MM-dd HH:mm:ss", j = JSON text.
 */

const APP = {
    NAME: "Groovy Employees",
    TZ: "Asia/Kolkata",
    SESSION_DAYS: 30,
    HOME_FOLDER: "Groovy Employees", // the Drive folder that holds the Sheet, the slips and the backups
    KIOSK_FOLDER: "Groovy Kiosk", // Setup puts the home folder beside this one
};

// one role for now: everyone who can log in is an admin. Kept as a list (and a column on Users) so a
// second role is one entry here and one list in api.gs.
const ROLES = ["owner"];

const SCHEMA = {
    Users: {
        id: "n",
        name: "s",
        email: "s",
        phone: "s",
        role: "s",
        pwd_hash: "s",
        salt: "s",
        active: "n",
        otp: "s",
        otp_exp: "s",
        created_at: "d",
        updated_at: "d",
    },
    Sessions: {
        token: "s",
        user_id: "n",
        created_at: "d",
        expires_at: "d",
        device: "s",
    },
    Settings: { key: "s", value: "s", updated_by: "n", updated_at: "d" },
    // No bank details and no ID numbers of any kind — on purpose.
    Employees: {
        id: "n",
        // typed by the admin: the same number this person has as `id` in the Groovy Kiosk sheet.
        // It names their slip files (3-Asha-2026-09.pdf).
        emp_no: "n",
        name: "s",
        designation: "s",
        location: "s",
        dob: "s", // yyyy-MM-dd
        doj: "s",
        phone: "s",
        email: "s", // slips are emailed here
        address: "s",
        base_salary: "n", // per month
        recurring: "j", // [{kind, category, label, amount}] — copied into every new slip
        status: "s", // active | left
        dol: "s", // date of leaving
        notes: "s",
        created_at: "d",
        updated_at: "d",
    },
    Salary_Slips: {
        id: "n",
        month: "s", // the salary month, yyyy-MM
        employee_id: "n",
        // the employee as they were when the slip was made: editing a profile never changes an old slip
        emp_no: "n",
        employee_name: "s",
        designation: "s",
        location: "s",
        doj: "s",
        base_salary: "n",
        salary_days: "n", // one day's salary = base_salary / salary_days
        paid_holidays: "n", // official paid days off that month
        days_off: "n", // days off taken
        unpaid_days: "n", // days_off beyond the paid holidays
        earnings_total: "n", // the lines only; base salary is not in it
        deductions_total: "n",
        net_salary: "n",
        status: "s", // draft | final
        notes: "s",
        pdf_url: "s",
        emailed_at: "d",
        emailed_to: "s",
        created_by: "n",
        created_at: "d",
        updated_at: "d",
        finalized_at: "d",
    },
    Slip_Items: {
        id: "n",
        slip_id: "n",
        kind: "s", // earning | deduction
        category: "s",
        label: "s",
        qty: "n", // days or hours, when it means something
        amount: "n",
        sort: "n",
        auto: "n", // 1 = made from the days off (unpaid leave / holiday not taken), not typed in
    },
    Activity_Logs: {
        id: "n",
        user_id: "n",
        user_name: "s",
        action: "s",
        entity: "s",
        ref_id: "s",
        details: "s",
        at: "d",
    },
};

const DEFAULT_SETTINGS = {
    business_name: "Groovy Business Group",
    tagline: "",
    address: "",
    phone: "",
    email: "",
    currency_symbol: "₹",
    // one day's salary is the base divided by this, every month alike
    salary_days: "30",
    // paid days off a month. Days off beyond these are unpaid; a holiday not taken is paid extra.
    paid_holidays: "1",
    // the roles an employee can be given, one per line (a title may hold a comma or a dash)
    roles: [
        "Chief Executive Officer",
        "Director – Strategic Alliances",
        "Director – Business Development",
        "Store Manager",
        "Salesperson Kiosk",
        "Salesperson Event",
        "Logistics Executive",
    ].join("\n"),
    // what "+ Add" offers on a slip. The two lines made from the days off are not in these lists.
    earning_types: "Overtime, Commission, Allowance, Bonus, Other",
    deduction_types: "Advance, Penalty, Other",
    slip_footer: "This is a computer-generated slip and needs no signature.",
    email_slips: "yes", // offer to email the slip when it is finalized
    slip_email_cc: "", // copied on every slip email
};

const KINDS_ = ["earning", "deduction"];
// the two lines the app writes itself, from the days off
const LEAVE_CATEGORY_ = "Unpaid leave";
const HOLIDAY_CATEGORY_ = "Holiday not taken";
