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
        // how they are paid: "monthly" (a base salary; blank means this too) or "event" (only for the
        // event days they work, no base). New columns go at the end so Setup can add them to a live sheet.
        pay_type: "s",
        day_rate: "n", // what one event day pays; the starting rate on their slips
        alt_phone: "s", // a second number to reach them on
        // their own paid holidays a month, e.g. "2". Text, not a number, so that blank — use the number in
        // Settings — stays apart from "0" (no paid holidays at all).
        paid_holidays: "s",
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
        pay_type: "s", // as the employee was paid when the slip was made: monthly | event
        event_days: "n", // event days worked that month (monthly staff can have these too)
        event_rate: "n", // what one of those days paid
        // the days off, by kind. days_off and unpaid_days above stay as their totals:
        // days_off = paid_off + paid_half/2 + unpaid_off + unpaid_half/2, unpaid_days = unpaid_off + unpaid_half/2
        paid_off: "n", // whole days off, paid
        paid_half: "n", // half days off, paid (each is half a paid holiday)
        unpaid_off: "n",
        unpaid_half: "n",
        // the dates they were taken, when the admin marked them, and the event days worked:
        // {"2":"paid","9":"paid_half","3":"unpaid","4":"unpaid_half","5":"event"}
        day_marks: "j",
        // the days of the month they were employed: 1 to the month's last day, or from the day they
        // joined / to their last working day. Number of days = to_day − from_day + 1. Kept on the slip so
        // a final slip never changes; 0 on a slip from before there was this.
        from_day: "n",
        to_day: "n",
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
// the lines the app writes itself: two from the days off, one from the event days worked
const LEAVE_CATEGORY_ = "Unpaid leave";
const HOLIDAY_CATEGORY_ = "Holiday not taken";
const EVENT_CATEGORY_ = "Event pay";
const AUTO_CATEGORIES_ = [LEAVE_CATEGORY_, HOLIDAY_CATEGORY_, EVENT_CATEGORY_].map((c) => c.toLowerCase());
